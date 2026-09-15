/* eslint-disable @typescript-eslint/no-explicit-any */
import PocketBase from "pocketbase";
import {
  MetaFile,
  MetaFolder,
  FastApiWorkerConfig,
  RoleDefinition,
  UserAccount,
  POCKETBASE_URL as CONFIG_PB_URL,
} from "@/app/types";

export const POCKETBASE_URL = CONFIG_PB_URL || "http://127.0.0.1:8099";

export const pb = new PocketBase(POCKETBASE_URL);

// Disable auto-cancellation so concurrent requests don't cancel each other
pb.autoCancellation(false);

export const DEFAULT_USERS: UserAccount[] = [
  { id: "admin_user", name: "Admin", email: "admin@email.com", role: "admin" },
  { id: "user_1", name: "User 1", email: "user1@email.com", role: "annotator" },
  { id: "user_2", name: "User 2", email: "user2@email.com", role: "reviewer" },
];

export const DEFAULT_ROLES: RoleDefinition[] = [
  { id: "annotator", name: "Annotator", description: "Segment masks & repair layers", color: "emerald" },
  { id: "reviewer", name: "Reviewer", description: "QA inspection & export review", color: "blue" },
  { id: "admin", name: "Admin", description: "Full workspace & batch control", color: "purple" },
];

let adminTokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Ensures an admin session is active for server-side PocketBase operations.
 */
export async function getAdminAuthToken(): Promise<string | null> {
  const now = Date.now();
  if (adminTokenCache && adminTokenCache.expiresAt > now) {
    return adminTokenCache.token;
  }

  try {
    const res = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: "admin@team.internal",
        password: "password123456",
      }),
      cache: "no-store",
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.token) {
      adminTokenCache = {
        token: data.token,
        // Expire in 1 hour
        expiresAt: now + 3600 * 1000,
      };
      pb.authStore.save(data.token, data.admin);
      return data.token;
    }
  } catch (err) {
    // If PocketBase server is not running or unreachable
    console.warn("[PocketBase] Admin auth failed or server offline:", err);
  }
  return null;
}

/**
 * Transform PocketBase record into MetaFile object
 */
export function recordToMetaFile(rec: any): MetaFile {
  const toolbar = {
    imageVisibility: rec.prop_imageVisibility ?? true,
    maskVisibility: rec.prop_maskVisibility ?? true,
    brushMode: rec.prop_brushMode ?? "brush",
    brushSize: rec.prop_brushSize ?? 30,
    brushHardness: rec.prop_brushHardness ?? 0.8,
    brushOpacity: rec.prop_brushOpacity ?? 1,
    brushColor: rec.prop_brushColor ?? "#00ff00",
    swapMouseClicks: rec.prop_swapMouseClicks ?? false,
    maskOpacity: rec.prop_maskOpacity ?? 0.6,
    thresholdValue: rec.prop_thresholdValue ?? 128,
    thresholdValueEnabled: rec.prop_thresholdValueEnabled ?? false,
    traceMinBlobPixels: rec.prop_traceMinBlobPixels ?? 50,
    traceMinBlobPixelsEnabled: rec.prop_traceMinBlobPixelsEnabled ?? false,
    simplifyEpsilon: rec.prop_simplifyEpsilon ?? 1,
    simplifyEpsilonEnabled: rec.prop_simplifyEpsilonEnabled ?? false,
    smoothIterations: rec.prop_smoothIterations ?? 1,
    smoothIterationsEnabled: rec.prop_smoothIterationsEnabled ?? false,
    contourOffset: rec.prop_contourOffset ?? 0,
    contourOffsetEnabled: rec.prop_contourOffsetEnabled ?? false,
    feather: rec.prop_feather ?? 0,
    featherEnabled: rec.prop_featherEnabled ?? false,
    imageOpacity: rec.prop_imageOpacity ?? 1,
    splineCurviness: rec.prop_splineCurviness ?? 0.5,
  };

  const sizes = {
    raw: rec.sizeRaw ?? 0,
    png: rec.sizePng ?? 0,
    jpeg: rec.sizeJpeg ?? 0,
    webp: rec.sizeWebp ?? 0,
  };

  return {
    id: rec.id,
    name: rec.name,
    width: rec.width ?? 0,
    height: rec.height ?? 0,
    issues: Array.isArray(rec.issues) ? rec.issues : [],
    comment: rec.comment ?? "",
    thumbnail: rec.thumbnail ?? "",
    sizeRaw: rec.sizeRaw ?? 0,
    sizePng: rec.sizePng ?? 0,
    sizeJpeg: rec.sizeJpeg ?? 0,
    sizeWebp: rec.sizeWebp ?? 0,
    filesizes: sizes,
    toolbar,
    metafolder: rec.metafolder ?? undefined,
    assignedTo: rec.assignedTo ?? undefined,
    assignedToName: rec.expand?.assignedTo?.name || rec.expand?.assignedTo?.email || undefined,
    status: rec.status ?? "unassigned",
    priority: rec.priority ?? "medium",
    hasSidecar: Boolean(rec.hasSidecar),
    exportedAt: rec.exportedAt || undefined,
    lastIngestedAt: rec.lastIngestedAt || undefined,
    createdAt: rec.createdAt || rec.created || new Date().toISOString(),
    updatedAt: rec.updatedAt || rec.updated || new Date().toISOString(),
  };
}

/**
 * Transform PocketBase record into MetaFolder object
 */
export function recordToMetaFolder(rec: any): MetaFolder {
  return {
    id: rec.id,
    name: rec.name || (rec.folderPath ? rec.folderPath.split("/").pop() : "folder"),
    folderPath: rec.folderPath,
    filesCount: rec.filesCount ?? 0,
    foldersCount: rec.foldersCount ?? 0,
    assignedTo: rec.assignedTo ?? undefined,
    assignedToName: rec.expand?.assignedTo?.name || rec.expand?.assignedTo?.email || undefined,
    status: rec.status ?? "unassigned",
    createdAt: rec.createdAt || rec.created || new Date().toISOString(),
    updatedAt: rec.updatedAt || rec.updated || new Date().toISOString(),
  };
}

/**
 * Upsert MetaFolder record in PocketBase
 */
export async function upsertPocketBaseFolder(folder: Partial<MetaFolder> & { folderPath?: string; name: string }) {
  try {
    await getAdminAuthToken();
    const folderPath = (folder.folderPath || folder.name || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!folderPath) return null;

    let existing: any = null;
    try {
      existing = await pb.collection("metafolders").getFirstListItem(`folderPath = "${folderPath}"`, { requestKey: null });
    } catch {}

    const payload: Record<string, any> = {
      folderPath,
      name: folder.name || folderPath.split("/").pop(),
      filesCount: folder.filesCount ?? 0,
      foldersCount: folder.foldersCount ?? 0,
      status: folder.status ?? "unassigned",
      updatedAt: folder.updatedAt || new Date().toISOString(),
    };

    if (folder.assignedTo !== undefined) {
      payload.assignedTo = folder.assignedTo;
    }
    if (folder.createdAt) {
      payload.createdAt = folder.createdAt;
    }

    if (existing?.id) {
      return await pb.collection("metafolders").update(existing.id, payload, { requestKey: null });
    } else {
      payload.createdAt = payload.createdAt || new Date().toISOString();
      return await pb.collection("metafolders").create(payload, { requestKey: null });
    }
  } catch (err) {
    console.warn("[PocketBase] upsertPocketBaseFolder failed:", err);
    return null;
  }
}

/**
 * Delete MetaFolder record from PocketBase
 */
export async function deletePocketBaseFolder(folderQuery: string | { folderPath?: string; id?: string }) {
  try {
    await getAdminAuthToken();
    if (typeof folderQuery === "string") {
      const cleanPath = folderQuery.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      const existing = await pb.collection("metafolders").getFirstListItem(`folderPath = "${cleanPath}"`, { requestKey: null }).catch(() => null);
      if (existing?.id) {
        await pb.collection("metafolders").delete(existing.id, { requestKey: null });
      }
      return;
    }

    if (folderQuery.id) {
      await pb.collection("metafolders").delete(folderQuery.id, { requestKey: null });
      return;
    }

    if (folderQuery.folderPath) {
      const cleanPath = folderQuery.folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      const existing = await pb.collection("metafolders").getFirstListItem(`folderPath = "${cleanPath}"`, { requestKey: null }).catch(() => null);
      if (existing?.id) {
        await pb.collection("metafolders").delete(existing.id, { requestKey: null });
      }
    }
  } catch (err) {
    console.warn("[PocketBase] deletePocketBaseFolder failed:", err);
  }
}

/**
 * Upsert MetaFile record in PocketBase
 */
export async function upsertPocketBaseMetafile(
  meta: Partial<MetaFile> & { name: string; folder?: string; metafolder?: string },
  folderRecordId?: string
) {
  try {
    await getAdminAuthToken();
    if (!meta.name) return null;

    let metafolderId = folderRecordId || meta.metafolder;
    if (!metafolderId && meta.folder) {
      const cleanFolder = meta.folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
      const folderRec = await pb.collection("metafolders").getFirstListItem(`folderPath = "${cleanFolder}"`, { requestKey: null }).catch(() => null);
      if (folderRec?.id) {
        metafolderId = folderRec.id;
      }
    }

    let existing: any = null;
    try {
      const filter = metafolderId
        ? `name = "${meta.name}" && metafolder = "${metafolderId}"`
        : `name = "${meta.name}"`;
      existing = await pb.collection("metafiles").getFirstListItem(filter, { requestKey: null });
    } catch {}

    const payload: Record<string, any> = {
      name: meta.name,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      issues: meta.issues || [],
      comment: meta.comment || "",
      thumbnail: meta.thumbnail || "",
      sizeRaw: meta.sizeRaw ?? meta.filesizes?.raw ?? 0,
      sizePng: meta.sizePng ?? meta.filesizes?.png ?? 0,
      sizeJpeg: meta.sizeJpeg ?? meta.filesizes?.jpeg ?? 0,
      sizeWebp: meta.sizeWebp ?? meta.filesizes?.webp ?? 0,
      status: meta.status || "unassigned",
      priority: meta.priority || "medium",
      hasSidecar: meta.hasSidecar !== undefined ? meta.hasSidecar : true,
      updatedAt: meta.updatedAt || new Date().toISOString(),
    };

    if (metafolderId) payload.metafolder = metafolderId;
    if (meta.assignedTo !== undefined) payload.assignedTo = meta.assignedTo;
    if (meta.exportedAt) payload.exportedAt = meta.exportedAt;
    if (meta.lastIngestedAt) payload.lastIngestedAt = meta.lastIngestedAt;
    if (meta.createdAt) payload.createdAt = meta.createdAt;

    // Destructure toolbar properties
    const tb = meta.toolbar || {};
    if (tb.imageVisibility !== undefined) payload.prop_imageVisibility = tb.imageVisibility;
    if (tb.maskVisibility !== undefined) payload.prop_maskVisibility = tb.maskVisibility;
    if (tb.brushMode !== undefined) payload.prop_brushMode = tb.brushMode;
    if (tb.brushSize !== undefined) payload.prop_brushSize = tb.brushSize;
    if (tb.brushHardness !== undefined) payload.prop_brushHardness = tb.brushHardness;
    if (tb.brushOpacity !== undefined) payload.prop_brushOpacity = tb.brushOpacity;
    if (tb.brushColor !== undefined) payload.prop_brushColor = tb.brushColor;
    if (tb.swapMouseClicks !== undefined) payload.prop_swapMouseClicks = tb.swapMouseClicks;
    if (tb.maskOpacity !== undefined) payload.prop_maskOpacity = tb.maskOpacity;
    if (tb.thresholdValue !== undefined) payload.prop_thresholdValue = tb.thresholdValue;
    if (tb.thresholdValueEnabled !== undefined) payload.prop_thresholdValueEnabled = tb.thresholdValueEnabled;
    if (tb.traceMinBlobPixels !== undefined) payload.prop_traceMinBlobPixels = tb.traceMinBlobPixels;
    if (tb.traceMinBlobPixelsEnabled !== undefined) payload.prop_traceMinBlobPixelsEnabled = tb.traceMinBlobPixelsEnabled;
    if (tb.simplifyEpsilon !== undefined) payload.prop_simplifyEpsilon = tb.simplifyEpsilon;
    if (tb.simplifyEpsilonEnabled !== undefined) payload.prop_simplifyEpsilonEnabled = tb.simplifyEpsilonEnabled;
    if (tb.smoothIterations !== undefined) payload.prop_smoothIterations = tb.smoothIterations;
    if (tb.smoothIterationsEnabled !== undefined) payload.prop_smoothIterationsEnabled = tb.smoothIterationsEnabled;
    if (tb.contourOffset !== undefined) payload.prop_contourOffset = tb.contourOffset;
    if (tb.contourOffsetEnabled !== undefined) payload.prop_contourOffsetEnabled = tb.contourOffsetEnabled;
    if (tb.feather !== undefined) payload.prop_feather = tb.feather;
    if (tb.featherEnabled !== undefined) payload.prop_featherEnabled = tb.featherEnabled;
    if (tb.imageOpacity !== undefined) payload.prop_imageOpacity = tb.imageOpacity;
    if (tb.splineCurviness !== undefined) payload.prop_splineCurviness = tb.splineCurviness;

    if (existing?.id) {
      return await pb.collection("metafiles").update(existing.id, payload, { requestKey: null });
    } else {
      payload.createdAt = payload.createdAt || new Date().toISOString();
      return await pb.collection("metafiles").create(payload, { requestKey: null });
    }
  } catch (err) {
    console.warn("[PocketBase] upsertPocketBaseMetafile failed:", err);
    return null;
  }
}

/**
 * Delete MetaFile record from PocketBase
 */
export async function deletePocketBaseMetafile(query: { folder?: string; metafolder?: string; name: string } | string) {
  try {
    await getAdminAuthToken();
    if (typeof query === "string") {
      await pb.collection("metafiles").delete(query, { requestKey: null });
      return;
    }

    let filter = `name = "${query.name}"`;
    if (query.metafolder) {
      filter += ` && metafolder = "${query.metafolder}"`;
    }
    const existing = await pb.collection("metafiles").getFirstListItem(filter, { requestKey: null }).catch(() => null);
    if (existing?.id) {
      await pb.collection("metafiles").delete(existing.id, { requestKey: null });
    }
  } catch (err) {
    console.warn("[PocketBase] deletePocketBaseMetafile failed:", err);
  }
}

/**
 * Query PocketBase folder data (metafiles + metafolders)
 */
export async function getPocketBaseFolderData(folderPath: string): Promise<{ metafiles: Record<string, MetaFile>; metafolders: Record<string, MetaFolder> }> {
  const result: { metafiles: Record<string, MetaFile>; metafolders: Record<string, MetaFolder> } = {
    metafiles: {},
    metafolders: {},
  };

  try {
    await getAdminAuthToken();
    const cleanPath = folderPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");

    let folderId: string | null = null;
    if (cleanPath) {
      const folderRec = await pb.collection("metafolders").getFirstListItem(`folderPath = "${cleanPath}"`, { requestKey: null }).catch(() => null);
      if (folderRec?.id) {
        folderId = folderRec.id;
      }
    }

    // Get child metafolders
    const folderFilter = cleanPath
      ? `folderPath ~ "${cleanPath}/" || parentMetafolder = "${folderId}"`
      : "";
    const folderRecords = await pb.collection("metafolders").getFullList({
      filter: folderFilter || undefined,
      expand: "assignedTo",
      requestKey: null,
    }).catch(() => []);

    for (const rec of folderRecords) {
      const folderObj = recordToMetaFolder(rec);
      const stem = folderObj.name || (folderObj.folderPath ? folderObj.folderPath.split("/").pop()! : rec.id);
      result.metafolders[stem] = folderObj;
    }

    // Get metafiles
    const fileFilter = folderId ? `metafolder = "${folderId}"` : "";
    const fileRecords = await pb.collection("metafiles").getFullList({
      filter: fileFilter || undefined,
      expand: "assignedTo",
      requestKey: null,
    }).catch(() => []);

    for (const rec of fileRecords) {
      const fileObj = recordToMetaFile(rec);
      result.metafiles[fileObj.name] = fileObj;
    }
  } catch (err) {
    console.warn("[PocketBase] getPocketBaseFolderData failed:", err);
  }

  return result;
}

/**
 * Query all workspace catalog items from PocketBase
 */
export async function getAllPocketBaseCatalog(): Promise<{ metafiles: Record<string, MetaFile>; metafolders: Record<string, MetaFolder> }> {
  const result: { metafiles: Record<string, MetaFile>; metafolders: Record<string, MetaFolder> } = {
    metafiles: {},
    metafolders: {},
  };

  try {
    await getAdminAuthToken();

    const [fileRecords, folderRecords] = await Promise.all([
      pb.collection("metafiles").getFullList({ expand: "assignedTo", requestKey: null }).catch(() => []),
      pb.collection("metafolders").getFullList({ expand: "assignedTo", requestKey: null }).catch(() => []),
    ]);

    for (const rec of fileRecords) {
      const fileObj = recordToMetaFile(rec);
      result.metafiles[fileObj.name] = fileObj;
    }

    for (const rec of folderRecords) {
      const folderObj = recordToMetaFolder(rec);
      const key = folderObj.folderPath || folderObj.name;
      result.metafolders[key] = folderObj;
    }
  } catch (err) {
    console.warn("[PocketBase] getAllPocketBaseCatalog failed:", err);
  }

  return result;
}

/**
 * Get all configured FastAPI workers from PocketBase database
 */
export async function getPocketBaseWorkers(): Promise<FastApiWorkerConfig[]> {
  try {
    await getAdminAuthToken();
    const records = await pb.collection("workers").getFullList({ requestKey: null }).catch(() => []);
    return records.map((r: any) => ({
      id: r.worker_id || r.id,
      name: r.name,
      url: r.url,
      enabled: Boolean(r.enabled),
    }));
  } catch (err) {
    console.warn("[PocketBase] getPocketBaseWorkers failed:", err);
    return [];
  }
}

/**
 * Upsert worker configuration in PocketBase database
 */
export async function upsertPocketBaseWorker(worker: FastApiWorkerConfig) {
  try {
    await getAdminAuthToken();
    const workerId = worker.id || `worker_${Date.now()}`;
    const existing = await pb.collection("workers").getFirstListItem(`worker_id = "${workerId}"`, { requestKey: null }).catch(() => null);

    const payload = {
      worker_id: workerId,
      name: worker.name,
      url: worker.url,
      enabled: Boolean(worker.enabled),
    };

    if (existing?.id) {
      return await pb.collection("workers").update(existing.id, payload, { requestKey: null });
    } else {
      return await pb.collection("workers").create(payload, { requestKey: null });
    }
  } catch (err) {
    console.warn("[PocketBase] upsertPocketBaseWorker failed:", err);
    return null;
  }
}

/**
 * Delete worker configuration from PocketBase database
 */
export async function deletePocketBaseWorker(workerId: string) {
  try {
    await getAdminAuthToken();
    const existing = await pb.collection("workers").getFirstListItem(`worker_id = "${workerId}"`, { requestKey: null }).catch(() => null);
    if (existing?.id) {
      await pb.collection("workers").delete(existing.id, { requestKey: null });
    }
  } catch (err) {
    console.warn("[PocketBase] deletePocketBaseWorker failed:", err);
  }
}

export default pb;
