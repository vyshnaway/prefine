import path from "path";

import { promises as fs } from "fs";
import { resolveSafePath } from "@/app/lib/storage";
import { NextRequest, NextResponse } from "next/server";
import { ApiRequest_export, FolderJson, ImgJsonBlob } from "@/app/types";
import { dataUrlToBuffer } from "@/app/lib/image";
import { convertAndSaveSiblingFormats, loadFolderSidecar, saveFolderSidecar } from "@/app/lib/file";
import { processImageWithFastApi } from "@/app/lib/fastapi";
import { generateExport } from "@/app/lib/export";
import { FILE_TOOLBAR_DEFAULTS } from "@/app/components/HeaderToolbar/states";
import { upsertPocketBaseMetafile } from "@/app/lib/pocketbase";

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

    let imagejson: ImgJsonBlob = {
      image: "",
      object: "",
      repair: "",
      color: "",
    }
    // Read existing sidecar to update, or initialize it
    try {
      imagejson = JSON.parse(await fs.readFile(targetFilePath + ".json", "utf-8"));

      const sidecarToWrite = {
        image: imagejson.image,
        object: imagejson.object,
        repair: img.new_erase || imagejson.repair,
        color: img.new_paint || imagejson.color,
      };
      await fs.writeFile(targetFilePath + ".json", JSON.stringify(sidecarToWrite, null, 2), "utf-8");

      await generateExport(
        imagejson,
        { ...FILE_TOOLBAR_DEFAULTS, ...(img.metadata?.toolbar || {}) },
        targetFilePath
      );
    } catch (error) {
      // If sidecar does not exist, Do Nothing
      console.error("Export failed:", error);
    }


    const targetDir = path.dirname(targetFilePath);
    const imageBasePath = path.join(targetDir, img.basename);
    const pngPath = `${imageBasePath}.png`;
    const webpPath = `${imageBasePath}.webp`;
    const jpegPath = `${imageBasePath}.jpg`;

    await fs.mkdir(targetDir, { recursive: true });

    // Save metadata, issues, comment, toolbar, assignment & status in collective folder data
    const folderJson = await loadFolderSidecar(targetDir) as FolderJson;
    const existingMeta = folderJson.metafiles?.[img.basename];
    if (!folderJson.metafiles) {
      folderJson.metafiles = {};
    }
    const nowIso = new Date().toISOString();
    folderJson.metafiles[img.basename] = {
      name: img.basename,
      width: img.metadata?.width || existingMeta?.width || 0,
      height: img.metadata?.height || existingMeta?.height || 0,
      issues: img.metadata?.issues || [],
      comment: img.metadata?.comment || existingMeta?.comment || "",
      thumbnail: img.metadata?.thumbnail || existingMeta?.thumbnail || "",
      filesizes: {
        raw: imagejson.image.length,
        png: (await fs.stat(pngPath)).size,
        webp: (await fs.stat(webpPath)).size,
        jpeg: (await fs.stat(jpegPath)).size
      },
      toolbar: img.metadata?.toolbar ?? existingMeta?.toolbar,
      assignedTo: img.metadata?.assignedTo !== undefined ? img.metadata.assignedTo : existingMeta?.assignedTo,
      assignedToName: img.metadata?.assignedToName !== undefined ? img.metadata.assignedToName : existingMeta?.assignedToName,
      status: "completed",
      priority: img.metadata?.priority !== undefined ? img.metadata.priority : existingMeta?.priority,
      exportedAt: nowIso,
      createdAt: existingMeta?.createdAt || nowIso,
      updatedAt: nowIso,
    };
    const updatedExportMeta = folderJson.metafiles[img.basename];
    await saveFolderSidecar(targetDir, folderJson);
    upsertPocketBaseMetafile({ ...updatedExportMeta, folder: img.folder }).catch((err) => {
      console.warn("PocketBase export sync warning:", err);
    });

    return NextResponse.json({
      ok: true,
      message: `Exported ${img.basename} to storage`,
      filesizes: updatedExportMeta.filesizes,
      sizes: updatedExportMeta.filesizes,
      metadata: updatedExportMeta,
    });

  } catch (error) {
    console.error("Export failed:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
