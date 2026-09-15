import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { ImgJsonBlob, ApiRequest_file } from "@/app/types";
import { bufferToDataUrl, createBlankImageDataUrl } from "@/app/lib/image";
import { resolveSafePath } from "@/app/lib/storage";
import { getAllPocketBaseCatalog } from "@/app/lib/pocketbase";
import { getImageDimensions, resolveImageDimensions } from "@/app/lib/file";

export const dynamic = "force-dynamic";

/**
 * GET /api/file
 * Returns the entire global catalog directly from PocketBase database collections (metafiles & metafolders).
 */
export async function GET() {
  try {
    const catalog = await getAllPocketBaseCatalog();
    return NextResponse.json({
      ok: true,
      metafiles: catalog.metafiles,
      metafolders: catalog.metafolders,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/file failed:", error);
    return NextResponse.json({ error: "Failed to fetch global catalog" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const req: ApiRequest_file = await request.json().catch(() => ({}));
    if (typeof req.parent !== "string" || !req.basename) {
      return NextResponse.json({ error: "Missing folder or basename parameter" }, { status: 400 });
    }

    // Disallow accessing hidden files/folders starting with "." (e.g. .json, .index.json, .git, etc.)
    if (req.basename.startsWith(".") || req.parent.split("/").some((part) => part.startsWith("."))) {
      return NextResponse.json({ error: "Access to hidden files or directories is forbidden" }, { status: 403 });
    }

    const jsonFullPath = resolveSafePath(req.parent, req.basename + ".json");
    if (!jsonFullPath) {
      return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    const targetDir = path.dirname(jsonFullPath);
    let imageJson: ImgJsonBlob = {
      image: "",
      object: "",
      repair: "",
      color: "",
    };
    let imageFullPath: string | null = null;
    let imageExt = ".png";

    // Check if the sidecar JSON already exists
    let exists = false;
    try { await fs.access(jsonFullPath); exists = true; } catch { }

    if (exists) {
      // 1. Read existing sidecar JSON
      try {
        imageJson = { ...imageJson, ...(JSON.parse(await fs.readFile(jsonFullPath, "utf-8")) as ImgJsonBlob) }
      } catch (err) {
        return NextResponse.json({ error: "Invalid JSON format in sidecar file" }, { status: 500 });
      }

    } else {
      // 2. Create JSON sidecar if it doesn't exist
      // Probe known extensions in preference order to find the raw image
      for (const ext of [".png", ".webp", ".jpg", ".jpeg", ".gif", ".bmp", ".svg"]) {
        const candidate = path.join(targetDir, req.basename + ext);
        try {
          await fs.stat(candidate);
          imageFullPath = candidate;
          imageExt = ext;
          break;
        } catch { }
      }

      if (!imageFullPath) {
        return NextResponse.json({ error: "Canonical raw image not found for sidecar creation" }, { status: 404 });
      }

      try {
        const imgBuffer = await fs.readFile(imageFullPath);
        const metadata = await resolveImageDimensions(imgBuffer, imageExt);
        const width = metadata.width || 1024;
        const height = metadata.height || 768;

        imageJson = {
          image: bufferToDataUrl(imgBuffer, imageExt),
          object: createBlankImageDataUrl(width, height, "#000000"),
          repair: createBlankImageDataUrl(width, height, "#00000000"),
          color: createBlankImageDataUrl(width, height, "#00000000"),
        };

        // Write sidecar JSON
        await fs.writeFile(jsonFullPath, JSON.stringify(imageJson, null, 2), "utf-8");

      } catch (err) {
        console.error("Failed to create sidecar:", err);
        return NextResponse.json({ error: "Failed to initialize sidecar assets" }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      layers: imageJson,
    });
  } catch (error) {
    console.error("POST /api/file failed:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
