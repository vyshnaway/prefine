import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { ImgJsonBlob, ApiRequest_object } from "@/app/types";
import { dataUrlToBuffer } from "@/app/lib/image";
import { processImageWithFastApi } from "@/app/lib/fastapi";
import { resolveSafePath } from "@/app/lib/storage";

/** POST /api/object — process imageBuffer/imagePath via FastAPI, update sidecar JSON, and return mask. */
export async function POST(request: NextRequest) {
  try {
    const req = (await request.json().catch(() => ({}))) as ApiRequest_object;

    if (!req.parent || !req.basename) {
      return NextResponse.json({ error: "Missing folder or basename parameter" }, { status: 400 });
    }

    // Resolve JSON path
    let resolvedJsonPath: string | null = resolveSafePath(req.parent, req.basename + ".json");
    if (!resolvedJsonPath) {
      return NextResponse.json({ error: "Invalid imagePath or access denied" }, { status: 403 });
    }

    // Get image JSON from sidecar file
    let sidecar: ImgJsonBlob;
    try {
      const fileContent = await fs.readFile(resolvedJsonPath, "utf-8");
      sidecar = JSON.parse(fileContent) as ImgJsonBlob;
    } catch {
      return NextResponse.json({ error: "Failed to read sidecar file or invalid path" }, { status: 403 });
    }

    // Decode sidecarData.image Data URL to Buffer
    const rawImageBuffer = dataUrlToBuffer(sidecar.image);
    if (!rawImageBuffer) {
      return NextResponse.json({ error: "Invalid raw image data URL in sidecar" }, { status: 400 });
    }

    // Call FastAPI requesting only the mask (mask_transparent) with high priority
    const segmentResult = await processImageWithFastApi(rawImageBuffer, {
      object_black__bg_white: true,
      priority: "high",
    });

    const maskBase64 = segmentResult.object_black__bg_white;
    if (!maskBase64) {
      return NextResponse.json({ error: "FastAPI did not return a mask" }, { status: 500 });
    }

    const maskUrl = maskBase64.startsWith("data:") ? maskBase64 : `data:image/png;base64,${maskBase64}`;
    await fs.writeFile(resolvedJsonPath, JSON.stringify({ ...sidecar, object: maskUrl }, null, 2), "utf-8");

    return NextResponse.json({
      ok: true,
      mask: maskUrl,
    });
  } catch (error) {
    console.error("Processing object failed:", error);
    const message = error instanceof Error ? error.message : "Processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

