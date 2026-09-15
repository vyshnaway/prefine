import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { ImgJsonBlob, PathData, FolderJson, ApiResponse_folder, GlobalMetaJson } from "@/app/types";
import { bufferToDataUrl, createBlankImageDataUrl, generateThumbnailDataUrl, dataUrlToBuffer } from "@/app/lib/image";
import { resolveSafePath, STORAGE_ROOT } from "@/app/lib/storage";
import { getActiveFileToolbarDefaults } from "@/app/components/HeaderToolbar/states";
import { getFileSizes, getImageDimensions, resolveImageDimensions, loadFolderSidecar, saveFolderSidecar } from "@/app/lib/file";
import { deriveTaskStatus } from "@/app/lib/task-status";
import { upsertPocketBaseMetafile, deletePocketBaseMetafile, upsertPocketBaseFolder, deletePocketBaseFolder, getAllPocketBaseCatalog } from "@/app/lib/pocketbase";


export async function synchronizeFolderCatalog(
  targetDir: string,
  folderData: FolderJson,
  stemsOnDisk: Set<string>,
  folderRecordId?: string
): Promise<boolean> {
  let folderDataModified = false;

  if (!folderData.metafiles) {
    folderData.metafiles = {};
  }
  if (!folderData.metafolders) {
    folderData.metafolders = {};
  }

  const relFolder = path.relative(STORAGE_ROOT, targetDir).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

  // 1. Cross-verify: Delete entries in metafiles that no longer have sidecars on disk or start with '.'
  for (const stem of Object.keys(folderData.metafiles)) {
    if (stem.startsWith(".") || !stemsOnDisk.has(stem)) {
      delete folderData.metafiles[stem];
      folderDataModified = true;
      // Also delete from PocketBase database if sidecar doesn't exist
      deletePocketBaseMetafile({
        folder: relFolder,
        metafolder: folderRecordId,
        name: stem,
      }).catch(() => {});
    }
  }

  // 2. Cross-verify & Generate: Add or verify active JSON files in targetDir
  for (const stem of stemsOnDisk) {
    if (stem.startsWith(".")) continue; // Ignore hidden dotfiles (e.g. .meta, .json)
    const jsonFileName = `${stem}.json`;
    const jsonFullPath = path.join(targetDir, jsonFileName);
    let sidecarRaw: ImgJsonBlob | null = null;
    try {
      const sidecarContent = await fs.readFile(jsonFullPath, "utf-8");
      sidecarRaw = JSON.parse(sidecarContent) as ImgJsonBlob;
    } catch {
      continue;
    }

    if (!sidecarRaw) continue;

    let isSidecarModified = false;
    let jsonData = sidecarRaw;

    // Helper to get image buffer from sidecar image dataUrl, or fall back to physical image on disk
    async function getImageBufferForStem(): Promise<{ buffer: Buffer; ext: string }> {
      const dataUrl = sidecarRaw?.image;
      if (dataUrl && dataUrl.startsWith("data:")) {
        const buf = dataUrlToBuffer(dataUrl);
        if (buf && buf.length > 0) {
          const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);/);
          return { buffer: buf, ext: match ? `.${match[1]}` : ".png" };
        }
      }
      // Fallback: Check physical raw file on disk
      for (const ext of [".png", ".webp", ".jpg", ".jpeg", ".bmp", ".gif", ".svg"]) {
        const candidate = path.join(targetDir, stem + ext);
        try {
          const buf = await fs.readFile(candidate);
          if (buf.length > 0) return { buffer: buf, ext };
        } catch { }
      }
      return { buffer: Buffer.alloc(0), ext: ".png" };
    }

    // Read/build properties for the metafile entry
    let metaEntry = folderData.metafiles[stem];
    if (!metaEntry) {
      try {
        const { buffer: imgBuffer, ext: detectedExt } = await getImageBufferForStem();
        const metadata = await resolveImageDimensions(imgBuffer, detectedExt);
        const sizes = await getFileSizes(targetDir, stem);

        let thumbnail = "";
        try {
          if (imgBuffer.length > 0) {
            thumbnail = await generateThumbnailDataUrl(imgBuffer);
          }
        } catch (thumbErr) {
          console.warn("Failed to generate thumbnail for", stem, thumbErr);
        }

        const fileSizes = { ...sizes, raw: imgBuffer.length };
        metaEntry = {
          name: stem,
          folder: relFolder,
          metafolder: folderRecordId,
          width: metadata.width || 0,
          height: metadata.height || 0,
          issues: [],
          comment: "",
          thumbnail,
          sizeRaw: fileSizes.raw || 0,
          sizePng: fileSizes.png || 0,
          sizeJpeg: fileSizes.jpeg || 0,
          sizeWebp: fileSizes.webp || 0,
          toolbar: getActiveFileToolbarDefaults(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        folderData.metafiles[stem] = metaEntry;
        folderDataModified = true;

        // Sync to PocketBase
        upsertPocketBaseMetafile(metaEntry, folderRecordId).catch(() => { });
      } catch (innerErr) {
        console.warn(`Skipping ${jsonFileName} metadata initialization:`, innerErr);
        continue;
      }
    } else {
      // Refresh filesizes & backfill missing dimensions/thumbnails for existing entries
      try {
        const sizes = await getFileSizes(targetDir, stem);
        let entryUpdated = false;

        // If width/height or thumbnail is missing/invalid, resolve from image buffer
        if (!metaEntry.width || !metaEntry.height || !metaEntry.thumbnail) {
          const { buffer: imgBuffer, ext: detectedExt } = await getImageBufferForStem();
          if (imgBuffer.length > 0) {
            if (!metaEntry.width || !metaEntry.height) {
              const dims = await resolveImageDimensions(imgBuffer, detectedExt);
              if (dims.width > 0 && dims.height > 0) {
                metaEntry.width = dims.width;
                metaEntry.height = dims.height;
                entryUpdated = true;
              }
            }
            if (!metaEntry.thumbnail) {
              try {
                metaEntry.thumbnail = await generateThumbnailDataUrl(imgBuffer);
                entryUpdated = true;
              } catch { }
            }
          }
        }

        const dataUrl = sidecarRaw?.image || "";
        const rawSize = dataUrl ? (dataUrlToBuffer(dataUrl)?.length || 0) : (metaEntry.sizeRaw || 0);
        metaEntry.folder = relFolder;
        if (folderRecordId) {
          metaEntry.metafolder = folderRecordId;
        }
        metaEntry.sizeRaw = rawSize;
        metaEntry.sizePng = sizes.png || 0;
        metaEntry.sizeJpeg = sizes.jpeg || 0;
        metaEntry.sizeWebp = sizes.webp || 0;
        metaEntry.updatedAt = new Date().toISOString();
        folderDataModified = true;

        // Sync to PocketBase
        upsertPocketBaseMetafile(metaEntry, folderRecordId).catch(() => { });
      } catch { }
    }

    // Clean sidecar JSON if it contains legacy fields nested (metadata, issues, comment, toolbar)
    if (jsonData && ((jsonData as any).metadata || (jsonData as any).issues || (jsonData as any).comment !== undefined || (jsonData as any).toolbar)) {
      if ((jsonData as any).metadata) {
        metaEntry.width = (jsonData as any).metadata.width || metaEntry.width;
        metaEntry.height = (jsonData as any).metadata.height || metaEntry.height;
        delete (jsonData as any).metadata;
      }
      if ((jsonData as any).issues) {
        metaEntry.issues = (jsonData as any).issues;
        delete (jsonData as any).issues;
      }
      if ((jsonData as any).comment !== undefined) {
        metaEntry.comment = (jsonData as any).comment;
        delete (jsonData as any).comment;
      }
      if ((jsonData as any).toolbar) {
        metaEntry.toolbar = (jsonData as any).toolbar;
        delete (jsonData as any).toolbar;
      }
      folderDataModified = true;
      isSidecarModified = true;
    }

    if (isSidecarModified) {
      await fs.writeFile(jsonFullPath, JSON.stringify(jsonData, null, 2), "utf-8");
    }
  }

  // 3. Cross-verify metafolders: Delete subfolder entries that no longer exist on disk or start with '.'
  if (folderData.metafolders && typeof folderData.metafolders === "object") {
    let existingSubdirsOnDisk = new Set<string>();
    try {
      const dirEntries = await fs.readdir(targetDir, { withFileTypes: true });
      for (const entry of dirEntries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          existingSubdirsOnDisk.add(entry.name);
        }
      }
    } catch { }

    for (const folderName of Object.keys(folderData.metafolders)) {
      if (folderName.startsWith(".") || !existingSubdirsOnDisk.has(folderName)) {
        const subRelPath = relFolder ? `${relFolder}/${folderName}` : folderName;
        delete folderData.metafolders[folderName];
        folderDataModified = true;
        // Delete from PocketBase if folder doesn't exist
        deletePocketBaseFolder({
          folderPath: subRelPath,
        }).catch(() => {});
      }
    }
  }

  if (folderDataModified) {
    await saveFolderSidecar(targetDir, folderData);
  }

  return folderDataModified;
}

/**
 * Traverses STORAGE_ROOT, accumulates all metafiles and metafolders from every .json sidecar,
 * using the relative POSIX path as the key, and writes to STORAGE_ROOT/.index.json.
 */
/**
 * Queries PocketBase database for global catalog accumulation.
 */
export async function generateGlobalMetaAccumulation(storageRoot: string): Promise<GlobalMetaJson> {
  const catalog = await getAllPocketBaseCatalog();
  return {
    metafiles: catalog.metafiles,
    metafolders: catalog.metafolders,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Incrementally patches catalog memory, querying PocketBase DB.
 */
export async function incrementalUpdateGlobalMetaAccumulation(
  storageRoot: string,
  affectedDirs: string[] | Set<string>
): Promise<GlobalMetaJson> {
  return await generateGlobalMetaAccumulation(storageRoot);
}

/**
 * Traverses all folders in STORAGE_ROOT and unassigns any pending/active tasks
 * (files and folders that are NOT complete or commented) assigned to the specified user ID(s).
 */
export async function unassignActiveTasksForUsers(
  storageRoot: string,
  userIds: string[] | Set<string>
): Promise<void> {
  const userIdsSet = new Set(userIds);
  if (userIdsSet.size === 0) return;

  const modifiedDirs = new Set<string>();

  async function traverse(currentDir: string) {
    let entries: any[] = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    try {
      const folderData: FolderJson = await loadFolderSidecar(currentDir);
      let changed = false;

      if (folderData?.metafiles) {
        for (const [stem, meta] of Object.entries(folderData.metafiles)) {
          if (meta?.assignedTo && userIdsSet.has(meta.assignedTo)) {
            const status = deriveTaskStatus(meta);
            if (status !== "completed" && status !== "commented") {
              delete meta.assignedTo;
              delete meta.assignedToName;
              meta.status = "unassigned";
              changed = true;
            }
          }
        }
      }

      if (folderData?.metafolders) {
        for (const [folderName, meta] of Object.entries(folderData.metafolders)) {
          if (meta?.assignedTo && userIdsSet.has(meta.assignedTo)) {
            const status = meta.status || "assigned";
            if (status !== "completed" && status !== "commented") {
              delete meta.assignedTo;
              delete meta.assignedToName;
              meta.status = "unassigned";
              changed = true;
            }
          }
        }
      }

      if (changed) {
        await saveFolderSidecar(currentDir, folderData);
        modifiedDirs.add(currentDir);
      }
    } catch (err) {
      console.warn(`[Unassign Tasks] Error updating ${currentDir}:`, err);
    }

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        await traverse(path.join(currentDir, entry.name));
      }
    }
  }

  await traverse(storageRoot);

  if (modifiedDirs.size > 0) {
    await incrementalUpdateGlobalMetaAccumulation(storageRoot, modifiedDirs);
  }
}
