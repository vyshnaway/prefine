import path from "path";

import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { ApiRequest_export, FolderJson } from "@/app/types";
import { loadFolderSidecar, saveFolderSidecar } from "@/app/lib/file";
import { resolveSafePath } from "@/app/lib/storage";
import { upsertPocketBaseMetafile, upsertPocketBaseFolder } from "@/app/lib/pocketbase";

export const dynamic = "force-dynamic";

/** POST /api/export — save image/mask layers to storage sidecar. */
export async function POST(request: NextRequest) {
  try {
    const img = await request.json().catch(() => null) as ApiRequest_export;
    if (!img) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const targetFilePath = resolveSafePath(img.folder, img.basename);
    if (!targetFilePath) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const targetDir = path.dirname(targetFilePath);

    await fs.mkdir(targetDir, { recursive: true });

    // Check if this is a folder assignment request
    const isFolderAssignment = (img as any).isFolder;
    if (isFolderAssignment) {
      const folderRelativePath = img.basename; // e.g. "subfolder" or "sub/child"
      const targetFolderPath = resolveSafePath(folderRelativePath);
      if (!targetFolderPath) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      const assignedTo = img.metadata?.assignedTo;
      const assignedToName = img.metadata?.assignedToName;

      // Recursive assignment helper for files and subfolders
      async function assignFolderRecursively(dir: string) {
        const subFolderJson = (await loadFolderSidecar(dir)) as FolderJson;
        if (!subFolderJson.metafiles) subFolderJson.metafiles = {};
        if (!subFolderJson.metafolders) subFolderJson.metafolders = {};

        // 1. Assign all metafiles in this directory
        const nowIso = new Date().toISOString();
        for (const stem of Object.keys(subFolderJson.metafiles)) {
          subFolderJson.metafiles[stem] = {
            ...subFolderJson.metafiles[stem],
            assignedTo,
            assignedToName,
            status: assignedTo ? "assigned" : "unassigned",
            createdAt: subFolderJson.metafiles[stem].createdAt || nowIso,
            updatedAt: nowIso,
          };
        }

        // 2. Scan disk for subdirectories and recurse
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              const childDir = path.join(dir, entry.name);
              // Update parent's metafolders entry
              const existingChildMeta = subFolderJson.metafolders[entry.name];
              subFolderJson.metafolders[entry.name] = {
                ...(existingChildMeta || { name: entry.name, filesCount: 0, foldersCount: 0 }),
                assignedTo,
                assignedToName,
                createdAt: existingChildMeta?.createdAt || nowIso,
                updatedAt: nowIso,
              };
              await assignFolderRecursively(childDir);
            }
          }
        } catch (err) {
          console.error("Error reading dir during recursive assign:", dir, err);
        }

        await saveFolderSidecar(dir, subFolderJson);
      }

      // Assign the target folder tree
      await assignFolderRecursively(targetFolderPath);

      // Also update the parent folder's metafolders entry for this folder
      const parentDir = path.dirname(targetFolderPath);
      const parentFolderJson = (await loadFolderSidecar(parentDir)) as FolderJson;
      if (!parentFolderJson.metafolders) parentFolderJson.metafolders = {};
      const folderBase = path.basename(targetFolderPath);
      const nowIso = new Date().toISOString();
      const existingParentMeta = parentFolderJson.metafolders[folderBase];
      parentFolderJson.metafolders[folderBase] = {
        ...(existingParentMeta || { name: folderBase, filesCount: 0, foldersCount: 0 }),
        assignedTo,
        assignedToName,
        createdAt: existingParentMeta?.createdAt || nowIso,
        updatedAt: nowIso,
      };
      await saveFolderSidecar(parentDir, parentFolderJson);

      return NextResponse.json({
        ok: true,
        message: `Assigned folder ${folderRelativePath} recursively to ${assignedToName || "unassigned"}`,
      });
    }

    // Save metadata, issues, comment, toolbar in collective folder data
    const folderJson = (await loadFolderSidecar(targetDir)) as FolderJson;
    const nowIso = new Date().toISOString();
    const oldmetadata = folderJson.metafiles?.[img.basename] || {
      name: img.basename,
      width: 0,
      height: 0,
      thumbnail: "",
      filesizes: {},
      issues: [],
      comment: "",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (!folderJson.metafiles) {
      folderJson.metafiles = {};
    }

    folderJson.metafiles[img.basename] = {
      name: img.basename,
      issues: img.metadata?.issues ?? oldmetadata.issues ?? [],
      comment: img.metadata?.comment ?? oldmetadata.comment ?? "",
      width: img.metadata?.width || oldmetadata.width || 0,
      height: img.metadata?.height || oldmetadata.height || 0,
      thumbnail: img.metadata?.thumbnail || oldmetadata.thumbnail || "",
      filesizes: (img.metadata?.filesizes && Object.keys(img.metadata.filesizes).length > 0) ? img.metadata.filesizes : (oldmetadata.filesizes || {}),
      toolbar: img.metadata?.toolbar ?? oldmetadata.toolbar,
      assignedTo: img.metadata?.assignedTo !== undefined ? img.metadata.assignedTo : oldmetadata.assignedTo,
      assignedToName: img.metadata?.assignedToName !== undefined ? img.metadata.assignedToName : oldmetadata.assignedToName,
      status: img.metadata?.status !== undefined ? img.metadata.status : (img.metadata?.assignedTo || oldmetadata.assignedTo ? "assigned" : "unassigned"),
      priority: img.metadata?.priority !== undefined ? img.metadata.priority : oldmetadata.priority,
      exportedAt: img.metadata?.exportedAt || oldmetadata.exportedAt,
      createdAt: oldmetadata.createdAt || nowIso,
      updatedAt: nowIso,
    };
    const updatedMetaEntry = folderJson.metafiles[img.basename];
    await saveFolderSidecar(targetDir, folderJson);

    // Sync to PocketBase
    await upsertPocketBaseMetafile({ ...updatedMetaEntry, folder: img.folder }).catch((err) => {
      console.warn("PocketBase metadata sync warning:", err);
    });

    return NextResponse.json({
      ok: true,
      message: `Updated metadata for ${img.basename}`,
      metadata: updatedMetaEntry,
    });

  } catch (error) {
    console.error("Export failed:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
