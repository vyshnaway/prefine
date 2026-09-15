import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { ImgJsonBlob, PathData, FolderJson, ApiResponse_folder } from "@/app/types";
import { createBlankImageDataUrl, generateThumbnailDataUrl, dataUrlToBuffer } from "@/app/lib/image";
import { resolveSafePath, STORAGE_ROOT } from "@/app/lib/storage";
import { getActiveFileToolbarDefaults } from "@/app/components/HeaderToolbar/states";
import { getFileSizes, getImageDimensions, getSubfolders, loadFolderSidecar, toPosixPath } from "@/app/lib/file";
import { upsertPocketBaseFolder, getPocketBaseFolderData } from "@/app/lib/pocketbase";


import { deriveTaskStatus, STATUS_RANK, RANK_TO_STATUS } from "@/app/lib/task-status";
import { isDateWithinRange } from "@/app/lib/date-filter";

const SUPPORTED_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

/**
 * Computes the least/lowest status among all metafiles and subfolders in a directory.
 */
async function computeLowestFolderStatus(dirPath: string): Promise<{ status: "unassigned" | "assigned" | "progressing" | "commented" | "completed"; filesCount: number; foldersCount: number }> {
  let minRank = 4; // Start at completed
  let hasItems = false;
  let filesCount = 0;
  let foldersCount = 0;

  try {
    const cleanFolder = path.relative(STORAGE_ROOT, dirPath).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const { metafiles } = await getPocketBaseFolderData(cleanFolder);

    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (entry.isFile() && !entry.name.startsWith(".")) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTS.includes(ext)) {
          filesCount++;
          hasItems = true;
          const stem = path.basename(entry.name, ext);
          const meta = metafiles[stem];
          const statusStr = deriveTaskStatus(meta);
          const rank = STATUS_RANK[statusStr] ?? 0;
          if (rank < minRank) minRank = rank;
        }
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        foldersCount++;
        hasItems = true;
        const subResult = await computeLowestFolderStatus(path.join(dirPath, entry.name));
        const subRank = STATUS_RANK[subResult.status] ?? 0;
        if (subRank < minRank) minRank = subRank;
      }
    }
  } catch (err) {
    console.warn("Failed to compute lowest status for folder:", dirPath, err);
  }

  const status = hasItems ? (RANK_TO_STATUS[minRank] || "unassigned") : "unassigned";
  return { status, filesCount, foldersCount };
}

export const dynamic = "force-dynamic";

/**
 * GET /api/folder
 * 
 * Lists the contents of a storage directory, returning metadata-enriched folders and image assets.
 * 
 * Query Parameters:
 * - folder: The relative path inside storage root (e.g., "", "subfolder").
 * - search: Optional filter matching filename stems.
 * 
 * @returns {Promise<NextResponse>} JSON response of type `ApiResponse_folder` or an error response.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedFolder = searchParams.get("folder") || "";
    const searchQuery = (searchParams.get("search") || "").trim().toLowerCase();
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    let startDate: number | null = null;
    if (startDateParam) {
      const parsedStart = new Date(`${startDateParam}T00:00:00.000`);
      startDate = !isNaN(parsedStart.getTime()) ? parsedStart.getTime() : new Date(startDateParam).setHours(0, 0, 0, 0);
      if (isNaN(startDate)) startDate = null;
    }

    let endDate: number | null = null;
    if (endDateParam) {
      const parsedEnd = new Date(`${endDateParam}T23:59:59.999`);
      endDate = !isNaN(parsedEnd.getTime()) ? parsedEnd.getTime() : new Date(endDateParam).setHours(23, 59, 59, 999);
      if (isNaN(endDate)) endDate = null;
    }
    const targetDir = resolveSafePath(requestedFolder);
    if (!targetDir) return NextResponse.json({ error: "Access Denied" }, { status: 403 })

    try {
      const stat = await fs.stat(targetDir);
      if (!stat.isDirectory()) return NextResponse.json({ error: "Not a directory" }, { status: 400 })
    } catch {
      return NextResponse.json({ error: "Directory not found" }, { status: 404 });
    }

    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    const currentFolder = toPosixPath(requestedFolder).replace(/^\/+|\/+$/g, "");

    const siblingFolders: Array<PathData> = [];

    // Scan targetDir for subfolders and compute folder counts
    const metafolders: Record<string, import("@/app/types").MetaFolder> = {};

    // Load catalog data from both PocketBase database AND local disk sidecar
    const dbCatalog = await getPocketBaseFolderData(currentFolder).catch(() => ({ metafiles: {}, metafolders: {} }));
    const localSidecar = await loadFolderSidecar(targetDir).catch(() => ({ metafiles: {}, metafolders: {} }));

    const combinedMetafiles: Record<string, import("@/app/types").MetaFile> = {
      ...(localSidecar.metafiles || {}),
      ...(dbCatalog.metafiles || {}),
    };

    // Scan targetDir for actual supported image files on disk and ensure entries exist for all of them
    for (const entry of entries) {
      if (entry.isFile() && !entry.name.startsWith(".")) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTS.includes(ext)) {
          const stem = path.basename(entry.name, ext);
          if (!combinedMetafiles[stem]) {
            const filePath = path.join(targetDir, entry.name);
            const fileStat = await fs.stat(filePath).catch(() => null);
            const nowIso = new Date().toISOString();
            const diskBirthIso = fileStat?.birthtime ? new Date(fileStat.birthtime).toISOString() : nowIso;
            combinedMetafiles[stem] = {
              name: stem,
              width: 0,
              height: 0,
              issues: [],
              comment: "",
              thumbnail: "",
              createdAt: diskBirthIso,
              updatedAt: diskBirthIso,
            };
          }
        }
      } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const entryRelativePath = currentFolder
          ? `${currentFolder}/${entry.name}`
          : entry.name;

        siblingFolders.push({
          basename: entry.name,
          parent: entryRelativePath || ".",
        });

        // Compute subfolder statistics & minimum task status
        try {
          const subfolderPath = path.join(targetDir, entry.name);
          const { status: lowestStatus, filesCount, foldersCount } = await computeLowestFolderStatus(subfolderPath);
          const subStat = await fs.stat(subfolderPath).catch(() => null);
          const nowIso = new Date().toISOString();
          const birthIso = subStat?.birthtime ? new Date(subStat.birthtime).toISOString() : nowIso;
          const mtimeIso = subStat?.mtime ? new Date(subStat.mtime).toISOString() : nowIso;

          const existingFolderMeta = (dbCatalog.metafolders as Record<string, any>)?.[entry.name] || (localSidecar.metafolders as Record<string, any>)?.[entry.name];
          const folderMeta = {
            name: entry.name,
            folderPath: entryRelativePath,
            filesCount,
            foldersCount,
            assignedTo: existingFolderMeta?.assignedTo,
            assignedToName: existingFolderMeta?.assignedToName,
            status: lowestStatus,
            createdAt: existingFolderMeta?.createdAt || birthIso,
            updatedAt: existingFolderMeta?.updatedAt || mtimeIso,
          };
          metafolders[entry.name] = folderMeta;
          upsertPocketBaseFolder(folderMeta).catch(() => { });
        } catch (subErr) {
          console.warn("Failed to read subfolder stats for", entry.name, subErr);
        }
      }
    }

    const folderData: FolderJson = {
      metafiles: combinedMetafiles,
      metafolders: {
        ...(localSidecar.metafolders || {}),
        ...(dbCatalog.metafolders || {}),
        ...metafolders,
      },
    };

    const includeNullDatesParam = searchParams.get("includeNullDates");
    const includeNullDates = includeNullDatesParam === null ? true : includeNullDatesParam === "true";

    // Build the final response imageFiles representation filtered by date
    const imageFiles: FolderJson = { metafiles: {} };
    for (const stem of Object.keys(folderData.metafiles)) {
      if (stem.startsWith(".")) continue; // Ignore hidden files/dotfiles (e.g. .meta, .json)
      if (searchQuery && !stem.toLowerCase().includes(searchQuery)) continue;

      const metaEntry = folderData.metafiles[stem];
      const itemDateStr = metaEntry.exportedAt || metaEntry.updatedAt || metaEntry.createdAt;

      if (!isDateWithinRange(itemDateStr, startDate, endDate, includeNullDates)) {
        continue;
      }

      const sizes = metaEntry.filesizes || {};
      imageFiles.metafiles[stem] = {
        name: stem,
        width: metaEntry.width || 0,
        height: metaEntry.height || 0,
        issues: metaEntry.issues || [],
        comment: metaEntry.comment || "",
        thumbnail: metaEntry.thumbnail || "",
        sizeRaw: metaEntry.sizeRaw ?? sizes.raw ?? 0,
        sizePng: metaEntry.sizePng ?? sizes.png ?? 0,
        sizeJpeg: metaEntry.sizeJpeg ?? sizes.jpeg ?? 0,
        sizeWebp: metaEntry.sizeWebp ?? sizes.webp ?? 0,
        filesizes: {
          raw: metaEntry.sizeRaw ?? sizes.raw ?? 0,
          png: metaEntry.sizePng ?? sizes.png ?? 0,
          jpeg: metaEntry.sizeJpeg ?? sizes.jpeg ?? 0,
          webp: metaEntry.sizeWebp ?? sizes.webp ?? 0,
        },
        toolbar: metaEntry.toolbar,
        assignedTo: metaEntry.assignedTo,
        assignedToName: metaEntry.assignedToName,
        status: metaEntry.status,
        priority: metaEntry.priority,
        exportedAt: metaEntry.exportedAt,
        createdAt: metaEntry.createdAt || new Date().toISOString(),
        updatedAt: metaEntry.updatedAt || new Date().toISOString(),
      };
    }

    // Build the final response metafolders representation filtered by date
    const sourceMetafolders = folderData.metafolders || {};
    const filteredMetafolders: Record<string, import("@/app/types").MetaFolder> = {};
    for (const fName of Object.keys(sourceMetafolders)) {
      if (fName.startsWith(".")) continue;
      const fMeta = sourceMetafolders[fName];
      if (!fMeta) continue;
      const itemDateStr = fMeta.updatedAt || fMeta.createdAt;

      if (!isDateWithinRange(itemDateStr, startDate, endDate, includeNullDates)) {
        continue;
      }

      filteredMetafolders[fName] = fMeta;
    }

    // Filter childrenFolders to match filteredMetafolders
    const filteredChildrenFolders = siblingFolders.filter((f) => {
      if (startDate === null && endDate === null) return true;
      return !!filteredMetafolders[f.basename];
    });

    // FIXED: Compute parent path correctly using posix string logic, not path.resolve()
    const parentPath = currentFolder.includes("/")
      ? currentFolder.substring(0, currentFolder.lastIndexOf("/"))
      : (currentFolder ? "" : null);

    let parentFolders: Array<PathData> = [];
    if (parentPath !== null) {
      parentFolders = await getSubfolders(parentPath);
    }

    const response: ApiResponse_folder = {
      currentFolder: {
        basename: currentFolder ? path.basename(currentFolder) : "root",
        parent: currentFolder,
      },
      parentFolder: {
        basename: parentPath === "" ? "root" : (parentPath ? path.basename(parentPath) : ""),
        parent: parentPath ?? "",
      },
      siblingFolders: parentFolders,
      childrenFolders: filteredChildrenFolders,
      metafiles: imageFiles.metafiles,
      metafolders: filteredMetafolders,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch storage path:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}