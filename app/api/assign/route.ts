import path from "path";
import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { FolderJson } from "@/app/types";
import { loadFolderSidecar } from "@/app/lib/file";
import { resolveSafePath } from "@/app/lib/storage";
import { upsertPocketBaseMetafile, upsertPocketBaseFolder } from "@/app/lib/pocketbase";

export const dynamic = "force-dynamic";

interface AssignItem {
  file: string;
  assigneeId: string;
  assigneeName: string;
  priority?: "low" | "medium" | "high";
  status?: string;
}

interface AssignRequest {
  folder: string;
  assignments?: AssignItem[];
  folderAssignments?: {
    folderPath: string;
    assigneeId: string;
    assigneeName: string;
  }[];
}

/**
 * POST /api/assign
 * Atomic, concurrency-safe batch assignment for files and folders without data loss.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as AssignRequest | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { folder = "", assignments = [], folderAssignments = [] } = body;

    // 1. Process file assignments in the specified folder (Single read-modify-write)
    if (assignments.length > 0) {
      const targetDir = resolveSafePath(folder);
      if (!targetDir) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      await fs.mkdir(targetDir, { recursive: true });
      const folderJson = (await loadFolderSidecar(targetDir)) as FolderJson;
      if (!folderJson.metafiles) folderJson.metafiles = {};
      if (!folderJson.metafolders) folderJson.metafolders = {};

      const nowIso = new Date().toISOString();
      const pbPromises: Promise<any>[] = [];
      for (const item of assignments) {
        const currentMeta = folderJson.metafiles[item.file] || {
          name: item.file,
          folder: folder,
          width: 0,
          height: 0,
          thumbnail: "",
          issues: [],
          comment: "",
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const updatedFileMeta = {
          ...currentMeta,
          folder: folder,
          assignedTo: item.assigneeId,
          assignedToName: item.assigneeName,
          status: (item.status as any) || (item.assigneeId ? "assigned" : "unassigned"),
          priority: item.priority || currentMeta.priority || "medium",
          createdAt: currentMeta.createdAt || nowIso,
          updatedAt: nowIso,
        };

        folderJson.metafiles[item.file] = updatedFileMeta;
        pbPromises.push(upsertPocketBaseMetafile(updatedFileMeta).catch((err) => {
          console.warn("Error syncing assigned file to PB:", err);
        }));
      }

      await Promise.all(pbPromises);

      // Persist updated metadata to disk sidecar (.json)
      const sidecarFilePath = path.join(targetDir, ".json");
      await fs.writeFile(sidecarFilePath, JSON.stringify(folderJson, null, 2), "utf-8");
    }

    // 2. Process recursive folder assignments
    for (const fAssign of folderAssignments) {
      const targetFolderPath = resolveSafePath(fAssign.folderPath);
      if (!targetFolderPath) continue;

      const nowIso = new Date().toISOString();
      const statusValue = (fAssign.assigneeId ? "assigned" : "unassigned") as import("@/app/types").TaskStatus;

      // Update the parent folder's sidecar so this folder's entry in metafolders is assigned
      const normalizedFolderPath = fAssign.folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      if (normalizedFolderPath && normalizedFolderPath !== ".") {
        const lastSlash = normalizedFolderPath.lastIndexOf("/");
        const parentRel = lastSlash !== -1 ? normalizedFolderPath.substring(0, lastSlash) : ".";
        const folderBaseName = lastSlash !== -1 ? normalizedFolderPath.substring(lastSlash + 1) : normalizedFolderPath;
        const parentFsDir = resolveSafePath(parentRel);
        if (parentFsDir) {
          try {
            const parentSidecar = (await loadFolderSidecar(parentFsDir)) as FolderJson;
            if (!parentSidecar.metafolders) parentSidecar.metafolders = {};
            const existingInParent = parentSidecar.metafolders[folderBaseName];
            parentSidecar.metafolders[folderBaseName] = {
              ...(existingInParent || { name: folderBaseName, filesCount: 0, foldersCount: 0 }),
              name: folderBaseName,
              folderPath: normalizedFolderPath,
              assignedTo: fAssign.assigneeId,
              assignedToName: fAssign.assigneeName,
              status: statusValue,
              createdAt: existingInParent?.createdAt || nowIso,
              updatedAt: nowIso,
            };
            const parentSidecarPath = path.join(parentFsDir, ".json");
            await fs.writeFile(parentSidecarPath, JSON.stringify(parentSidecar, null, 2), "utf-8");
          } catch (err) {
            console.warn("Failed to update parent sidecar during folder assign:", err);
          }
        }
      }

      const SUPPORTED_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

      // Recursive function to assign all files and subfolders down the entire tree
      async function assignRecursively(dir: string, relPath: string) {
        const subFolderJson = (await loadFolderSidecar(dir)) as FolderJson;
        if (!subFolderJson.metafiles) subFolderJson.metafiles = {};
        if (!subFolderJson.metafolders) subFolderJson.metafolders = {};

        // Discover all image files and subdirectories on disk
        const dirEntries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

        // 1. Ensure all disk image files exist in subFolderJson.metafiles
        for (const entry of dirEntries) {
          if (entry.isFile() && !entry.name.startsWith(".")) {
            const ext = path.extname(entry.name).toLowerCase();
            if (SUPPORTED_EXTS.includes(ext)) {
              const stem = path.basename(entry.name, ext);
              if (!subFolderJson.metafiles[stem]) {
                const filePath = path.join(dir, entry.name);
                const fileStat = await fs.stat(filePath).catch(() => null);
                const birthIso = fileStat?.birthtime ? new Date(fileStat.birthtime).toISOString() : nowIso;
                subFolderJson.metafiles[stem] = {
                  name: stem,
                  folder: relPath,
                  width: 0,
                  height: 0,
                  issues: [],
                  comment: "",
                  thumbnail: "",
                  createdAt: birthIso,
                  updatedAt: nowIso,
                };
              }
            }
          }
        }

        const subPbPromises: Promise<any>[] = [];

        // 2. Assign all metafiles in this directory
        for (const stem of Object.keys(subFolderJson.metafiles)) {
          if (stem.startsWith(".")) continue;
          const updatedMeta = {
            ...subFolderJson.metafiles[stem],
            folder: relPath,
            assignedTo: fAssign.assigneeId,
            assignedToName: fAssign.assigneeName,
            status: statusValue,
            createdAt: subFolderJson.metafiles[stem].createdAt || nowIso,
            updatedAt: nowIso,
          };
          subFolderJson.metafiles[stem] = updatedMeta;
          subPbPromises.push(upsertPocketBaseMetafile(updatedMeta).catch((err) => {
            console.warn("Error syncing assigned folder file to PB:", err);
          }));
        }

        // 3. Discover and assign all subfolders in this directory
        for (const entry of dirEntries) {
          if (entry.isDirectory() && !entry.name.startsWith(".")) {
            const childDir = path.join(dir, entry.name);
            const childRelPath = relPath && relPath !== "." ? `${relPath}/${entry.name}` : entry.name;
            const existingFolder = subFolderJson.metafolders[entry.name];
            const folderMeta = {
              ...(existingFolder || { name: entry.name, filesCount: 0, foldersCount: 0 }),
              name: entry.name,
              folderPath: childRelPath,
              assignedTo: fAssign.assigneeId,
              assignedToName: fAssign.assigneeName,
              status: statusValue,
              createdAt: existingFolder?.createdAt || nowIso,
              updatedAt: nowIso,
            };
            subFolderJson.metafolders[entry.name] = folderMeta;
            subPbPromises.push(upsertPocketBaseFolder(folderMeta).catch((err) => {
              console.warn("Error syncing assigned child folder to PB:", err);
            }));

            // Recurse into child directory
            await assignRecursively(childDir, childRelPath);
          }
        }

        await Promise.all(subPbPromises);

        // Persist subfolder metadata to disk sidecar (.json)
        const subSidecarFilePath = path.join(dir, ".json");
        await fs.writeFile(subSidecarFilePath, JSON.stringify(subFolderJson, null, 2), "utf-8");
      }

      await assignRecursively(targetFolderPath, fAssign.folderPath);

      // Update target folder's own metafolder record in PocketBase
      const folderBase = path.basename(targetFolderPath);
      const folderMeta = {
        name: folderBase,
        folderPath: fAssign.folderPath,
        assignedTo: fAssign.assigneeId,
        assignedToName: fAssign.assigneeName,
        status: statusValue,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await upsertPocketBaseFolder(folderMeta).catch(() => { });
    }

    return NextResponse.json({ ok: true, message: "Assignments updated successfully" });
  } catch (error) {
    console.error("Assignment batch failed:", error);
    return NextResponse.json({ error: "Failed to assign items" }, { status: 500 });
  }
}
