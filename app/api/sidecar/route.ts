import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { ImgJsonBlob, PathData } from "@/app/types";
import { resolveSafePath } from "@/app/lib/storage";

export const dynamic = "force-dynamic";

export interface ApiRequest_sidecar extends PathData {
  layers: Partial<ImgJsonBlob>;
}

/** POST /api/sidecar — save edited layers directly to the image's sidecar JSON file. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as ApiRequest_sidecar | null;
    if (!body || !body.parent || !body.basename) {
      return NextResponse.json({ error: "Missing parent or basename" }, { status: 400 });
    }

    const resolvedJsonPath = resolveSafePath(body.parent, body.basename + ".json");
    if (!resolvedJsonPath) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    let existingSidecar: ImgJsonBlob = {
      image: "",
      object: "",
      repair: "",
      color: "",
    };

    try {
      const content = await fs.readFile(resolvedJsonPath, "utf-8");
      existingSidecar = JSON.parse(content) as ImgJsonBlob;
    } catch {
      // File doesn't exist yet or is empty
    }

    const updatedSidecar: ImgJsonBlob = {
      image: body.layers?.image || existingSidecar.image,
      object: body.layers?.object !== undefined ? body.layers.object : existingSidecar.object,
      repair: body.layers?.repair !== undefined ? body.layers.repair : existingSidecar.repair,
      color: body.layers?.color !== undefined ? body.layers.color : existingSidecar.color,
    };

    await fs.writeFile(resolvedJsonPath, JSON.stringify(updatedSidecar, null, 2), "utf-8");

    return NextResponse.json({
      ok: true,
      message: `Saved sidecar for ${body.basename}`,
      layers: updatedSidecar,
    });
  } catch (error) {
    console.error("Save sidecar failed:", error);
    const message = error instanceof Error ? error.message : "Failed to save sidecar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
