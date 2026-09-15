import path from "path";
import { bufferToDataUrl } from "./image";
import { resolveSafePath, STORAGE_ROOT } from "./storage";
import { promises as fs } from "fs";
import { computePopularOrAverageToolbarDefaults } from "./toolbar";
import { getFileSizes, getImageDimensions, loadFolderSidecar, saveFolderSidecar } from "./file";
import { generateExport } from "./export";
import { synchronizeFolderCatalog, generateGlobalMetaAccumulation, incrementalUpdateGlobalMetaAccumulation } from "./sidecar";
import { FolderJson, RESOLVED_AUTO_INGEST_INTERVAL_MINS } from "../types";
import { processImageWithFastApi } from "./fastapi";
import { pb, upsertPocketBaseMetafile, upsertPocketBaseFolder } from "./pocketbase";
import { deriveLowestAggregateStatus } from "./task-status";

const SUPPORTED_EXTS = [".png", ".jpg", ".jpeg", ".webp"];

interface PendingImageTask {
    imagePath: string;
    jsonPath: string;
    baseName: string;
    parentDir: string;
    ext: string;
}

/**
 * Helper to fetch the 2nd most recent created timestamp from PocketBase metafiles and metafolders,
 * rounded off to the previous hour.
 */
async function getSecondLastCreatedCutoffHour(): Promise<number> {
    const timestamps: number[] = [];

    try {
        const fileRecords = await pb.collection("metafiles").getList(1, 5, {
            sort: "-created",
            fields: "created,createdAt",
        }).catch(() => null);

        if (fileRecords?.items) {
            for (const r of fileRecords.items) {
                const rawDate = r.createdAt || r.created;
                if (rawDate) {
                    const t = new Date(rawDate).getTime();
                    if (!isNaN(t)) timestamps.push(t);
                }
            }
        }

        const folderRecords = await pb.collection("metafolders").getList(1, 5, {
            sort: "-created",
            fields: "created,createdAt",
        }).catch(() => null);

        if (folderRecords?.items) {
            for (const r of folderRecords.items) {
                const rawDate = r.createdAt || r.created;
                if (rawDate) {
                    const t = new Date(rawDate).getTime();
                    if (!isNaN(t)) timestamps.push(t);
                }
            }
        }
    } catch (err) {
        console.warn("Failed to fetch created timestamps from PocketBase:", err);
    }

    // Sort timestamps descending (newest to oldest)
    timestamps.sort((a, b) => b - a);

    let targetTimestamp: number;
    if (timestamps.length >= 2) {
        targetTimestamp = timestamps[1]; // 2nd most recent created timestamp
    } else if (timestamps.length === 1) {
        targetTimestamp = timestamps[0];
    } else {
        // Fallback if no records exist: 24 hours ago
        targetTimestamp = Date.now() - 24 * 60 * 60 * 1000;
    }

    // Round off timestamp to previous hour (set minutes, seconds, milliseconds to 0)
    const cutoffDate = new Date(targetTimestamp);
    cutoffDate.setMinutes(0, 0, 0);
    return cutoffDate.getTime();
}

async function findPendingImagesRecursively(
    dirPath: string
): Promise<PendingImageTask[]> {
    const pending: PendingImageTask[] = [];

    // 1. Fetch 2nd last created timestamp rounded off to previous hour
    const cutoffHourMs = await getSecondLastCreatedCutoffHour();
    console.log(`[Ingestion] Pending images cutoff timestamp (previous hour of 2nd last created): ${new Date(cutoffHourMs).toISOString()}`);

    // 2. Fetch existing metafiles from PocketBase database
    const existingDbRecords = await pb.collection("metafiles").getFullList({
        fields: "name,folder",
    }).catch(() => []);

    const existingDbKeys = new Set<string>();
    for (const r of existingDbRecords) {
        existingDbKeys.add(r.name);
        if (r.folder) {
            existingDbKeys.add(`${r.folder}/${r.name}`);
        }
    }

    async function traverse(currentDir: string) {
        let entries: any[] = [];
        try {
            entries = await fs.readdir(currentDir, { withFileTypes: true });
        } catch {
            return;
        }

        const relFolder = path.relative(STORAGE_ROOT, currentDir).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

        // Group files by base name (without extension)
        const stemGroups = new Map<string, Array<{ fullPath: string; ext: string; mtimeMs: number }>>();

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith(".")) {
                    await traverse(fullPath);
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (SUPPORTED_EXTS.includes(ext)) {
                    const baseName = path.basename(entry.name, ext);

                    // Ignore hidden files, dotfiles, or system sidecars
                    if (baseName.startsWith(".")) {
                        continue;
                    }

                    // Check file creation / modification timestamp against cutoffHourMs
                    let fileTimeMs = 0;
                    try {
                        const stat = await fs.stat(fullPath);
                        fileTimeMs = Math.max(stat.birthtimeMs || 0, stat.ctimeMs || 0, stat.mtimeMs || 0);
                    } catch { }

                    if (fileTimeMs > 0 && fileTimeMs < cutoffHourMs) {
                        // Image was created before the 2nd last created cutoff hour: skip
                        continue;
                    }

                    if (!stemGroups.has(baseName)) {
                        stemGroups.set(baseName, []);
                    }
                    stemGroups.get(baseName)!.push({
                        fullPath,
                        ext,
                        mtimeMs: fileTimeMs,
                    });
                }
            }
        }

        // Check each base name group: if <baseName>.json sidecar does NOT exist, it needs remote segmentation
        for (const [baseName, files] of stemGroups.entries()) {
            if (files.length === 0) continue;

            const jsonPath = path.join(currentDir, `${baseName}.json`);
            try {
                // Check if .json sidecar exists on disk
                await fs.access(jsonPath);
                // Exists: already ingested, skip
            } catch {
                // Does NOT exist: needs ingestion
                const primarySource = files[0];
                pending.push({
                    imagePath: primarySource.fullPath,
                    jsonPath,
                    baseName,
                    parentDir: currentDir,
                    ext: primarySource.ext,
                });
            }
        }
    }

    await traverse(dirPath);
    return pending;
}

export let INGESTION_STATUS = false
export async function triggerFastApiDistributedAutomation(
    folder: string = STORAGE_ROOT
) {
    const targetDir = folder ? (resolveSafePath(folder) || path.resolve(folder)) : STORAGE_ROOT;

    if (INGESTION_STATUS) {
        return {
            status: "error",
            message: "Ingestion already in progress",
            processed: 0,
        };
    }
    INGESTION_STATUS = true;
    try {
        try {
            await fs.access(targetDir);
        } catch {
            console.error(`Automation target directory ${targetDir} does not exist.`);
            return {
                status: "error",
                message: `Directory ${targetDir} not found`,
                processed: 0,
            };
        }

        // Step 1: Update backend toolbar defaults from completed metafiles
        const PopularToolbar_Settings = await computePopularOrAverageToolbarDefaults(STORAGE_ROOT);

        // Step 2: Find and process all pending images needing remote FastAPI segmentation
        const pendingTasks = await findPendingImagesRecursively(targetDir);
        console.log(`[Remote Segmentation] Found ${pendingTasks.length} pending images in ${targetDir}`);

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < pendingTasks.length; i++) {
            const task = pendingTasks[i];
            console.log(`[Remote Segmentation] [${i + 1}/${pendingTasks.length}] Processing: ${task.imagePath}`);

            try {
                const imageBuffer = await fs.readFile(task.imagePath);
                const dimensions = getImageDimensions(imageBuffer, task.ext);
                const width = dimensions.width || 1024;
                const height = dimensions.height || 1024;

                // 1. Send to FastAPI to detect mask (object_black__bg_white: white bg, black object)
                const segmentationResult = await processImageWithFastApi(
                    imageBuffer,
                    {
                        width,
                        height,
                        object_black__bg_white: true,
                        priority: "low",
                    }
                );

                // 2. Prepare sidecar JSON data
                const origImageDataUrl = bufferToDataUrl(imageBuffer, task.ext);
                const objectDataUrl = segmentationResult.object_black__bg_white
                    ? `data:image/png;base64,${segmentationResult.object_black__bg_white}`
                    : "";

                const sidecarData = {
                    image: origImageDataUrl,
                    object: objectDataUrl,
                    repair: "",
                    color: "",
                };

                await fs.writeFile(task.jsonPath, JSON.stringify(sidecarData, null, 2), "utf-8");

                // 3. Save multi-format outputs: PNG, WebP (60%), JPG (80%)
                const basePath = path.join(task.parentDir, task.baseName);
                await generateExport(sidecarData, PopularToolbar_Settings, basePath, width, height);

                // 4. Immediately sync metadata to PocketBase metafiles DB collection
                const relFolder = path.relative(STORAGE_ROOT, task.parentDir).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
                const fileSizes = await getFileSizes(task.parentDir, task.baseName);

                await upsertPocketBaseMetafile({
                    name: task.baseName,
                    folder: relFolder,
                    width,
                    height,
                    sizeRaw: imageBuffer.length,
                    sizePng: fileSizes.png || 0,
                    sizeJpeg: fileSizes.jpeg || 0,
                    sizeWebp: fileSizes.webp || 0,
                    status: "unassigned",
                    toolbar: PopularToolbar_Settings,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    lastIngestedAt: new Date().toISOString(),
                }).catch(() => { });

                successCount++;
            } catch (err) {
                console.error(`[Remote Segmentation] ❌ Failed to process ${task.imagePath}:`, err);
                failureCount++;
            }
        }

        // Step 3: Synchronize metafiles and metafolders DB collections for ALL scanned directories
        async function collectAllDirectories(dir: string, result: Set<string>) {
            result.add(dir);
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && !entry.name.startsWith(".")) {
                        await collectAllDirectories(path.join(dir, entry.name), result);
                    }
                }
            } catch { }
        }

        const allDirsToSync = new Set<string>();
        await collectAllDirectories(targetDir, allDirsToSync);
        allDirsToSync.add(STORAGE_ROOT);

        for (const dir of allDirsToSync) {
            try {
                const folderData: FolderJson = (await loadFolderSidecar(dir)) as FolderJson || { metafiles: {}, metafolders: {} };
                const dirEntries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
                const activeStems = new Set<string>();
                let filesCount = 0;
                let foldersCount = 0;

                for (const entry of dirEntries) {
                    if (entry.isFile() && !entry.name.startsWith(".")) {
                        if (entry.name.endsWith(".json") && entry.name !== ".json") {
                            activeStems.add(path.basename(entry.name, ".json"));
                        }
                        const ext = path.extname(entry.name).toLowerCase();
                        if (SUPPORTED_EXTS.includes(ext)) {
                            filesCount++;
                        }
                    } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
                        foldersCount++;
                    }
                }

                const cleanFolder = path.relative(STORAGE_ROOT, dir).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
                const folderName = path.basename(dir) || "root";

                // 1. Upsert parent metafolders record first to retrieve its PocketBase record ID
                let parentFolderId: string | undefined = undefined;
                if (!folderName.startsWith(".")) {
                    const folderRecord = await upsertPocketBaseFolder({
                        name: folderName,
                        folderPath: cleanFolder || folderName,
                        filesCount,
                        foldersCount,
                        status: "unassigned",
                        updatedAt: new Date().toISOString(),
                    }).catch(() => null);

                    if (folderRecord?.id) {
                        parentFolderId = folderRecord.id;
                    }

                    const dbFiles = parentFolderId ? await pb.collection("metafiles").getFullList({
                        filter: `metafolder = "${parentFolderId}"`,
                        fields: "status,exportedAt,issues,comment,assignedTo",
                    }).catch(() => []) : [];

                    const lowestStatus = deriveLowestAggregateStatus(dbFiles as any);

                    if (folderRecord?.id) {
                        await upsertPocketBaseFolder({
                            name: folderName,
                            folderPath: cleanFolder || folderName,
                            filesCount,
                            foldersCount,
                            status: lowestStatus,
                            updatedAt: new Date().toISOString(),
                        }).catch(() => null);
                    }
                }

                // 2. Sync all image metafiles on disk to PocketBase DB and clean removed sidecars
                await synchronizeFolderCatalog(dir, folderData, activeStems, parentFolderId);
            } catch (syncErr) {
                console.warn(`[Remote Segmentation] Failed to synchronize DB for ${dir}:`, syncErr);
            }
        }

        // Step 4: Clean up global orphaned DB metafiles and metafolders whose physical directories/files no longer exist
        try {
            const allDbMetafolders = await pb.collection("metafolders").getFullList({ fields: "id,folderPath" }).catch(() => []);
            for (const folderRec of allDbMetafolders) {
                if (folderRec.folderPath && folderRec.folderPath !== "." && folderRec.folderPath !== "root") {
                    const physicalPath = resolveSafePath(folderRec.folderPath);
                    if (!physicalPath) {
                        await pb.collection("metafolders").delete(folderRec.id, { requestKey: null }).catch(() => {});
                    } else {
                        const exists = await fs.stat(physicalPath).then((s) => s.isDirectory()).catch(() => false);
                        if (!exists) {
                            await pb.collection("metafolders").delete(folderRec.id, { requestKey: null }).catch(() => {});
                        }
                    }
                }
            }

            const allDbMetafiles = await pb.collection("metafiles").getFullList({ fields: "id,name,folder" }).catch(() => []);
            for (const fileRec of allDbMetafiles) {
                const folderDir = resolveSafePath(fileRec.folder || "");
                if (!folderDir) {
                    await pb.collection("metafiles").delete(fileRec.id, { requestKey: null }).catch(() => {});
                } else {
                    const jsonPath = path.join(folderDir, `${fileRec.name}.json`);
                    const exists = await fs.stat(jsonPath).then((s) => s.isFile()).catch(() => false);
                    if (!exists) {
                        await pb.collection("metafiles").delete(fileRec.id, { requestKey: null }).catch(() => {});
                    }
                }
            }
        } catch (cleanupErr) {
            console.warn("[Remote Segmentation] Note during orphan cleanup:", cleanupErr);
        }

        // Step 5: Recount filesCount and foldersCount directly from database tables where each metafolder is the parent folder
        try {
            const activeMetafolders = await pb.collection("metafolders").getFullList({ fields: "id,folderPath,parentMetafolder" }).catch(() => []);
            for (const fRec of activeMetafolders) {
                // Count child metafiles from DB where metafolder == fRec.id
                const dbChildFiles = await pb.collection("metafiles").getFullList({
                    filter: `metafolder = "${fRec.id}"`,
                    fields: "id,status,exportedAt,issues,comment,assignedTo",
                }).catch(() => []);

                // Count child metafolders from DB where parentMetafolder == fRec.id
                const dbChildFolders = await pb.collection("metafolders").getFullList({
                    filter: `parentMetafolder = "${fRec.id}"`,
                    fields: "id,status",
                }).catch(() => []);

                const lowestStatus = deriveLowestAggregateStatus(dbChildFiles as any);

                await pb.collection("metafolders").update(fRec.id, {
                    filesCount: dbChildFiles.length,
                    foldersCount: dbChildFolders.length,
                    status: lowestStatus,
                    updatedAt: new Date().toISOString(),
                }, { requestKey: null }).catch(() => {});
            }
        } catch (countErr) {
            console.warn("[Remote Segmentation] Note during DB recount:", countErr);
        }

        return {
            status: "completed",
            total: pendingTasks.length,
            processed: successCount,
            failed: failureCount,
            message: `Remote distributed automation completed. Processed ${successCount}/${pendingTasks.length} images.`,
        };
    } finally {
        INGESTION_STATUS = false;
    }
}
