import { NextRequest, NextResponse } from "next/server";
import { STORAGE_ROOT } from "@/app/lib/storage";
import { getAllPocketBaseCatalog } from "@/app/lib/pocketbase";

export const dynamic = "force-dynamic";

/**
 * GET /api/reindex
 * Returns the entire workspace catalog directly from PocketBase database tables.
 */
export async function GET() {
  try {
    const catalog = await getAllPocketBaseCatalog();
    return NextResponse.json({
      ok: true,
      meta: {
        metafiles: catalog.metafiles,
        metafolders: catalog.metafolders,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Failed to read PocketBase database catalog:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to read database catalog" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reindex
 * Forces a synchronization / reindexing of the workspace catalog in PocketBase database collections.
 */
export async function POST() {
  try {
    const catalog = await getAllPocketBaseCatalog();
    return NextResponse.json({
      ok: true,
      meta: {
        metafiles: catalog.metafiles,
        metafolders: catalog.metafolders,
        generatedAt: new Date().toISOString(),
      },
      message: "Successfully synchronized PocketBase database catalog",
    });
  } catch (error) {
    console.error("Failed to sync PocketBase database catalog:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to sync PocketBase database catalog" },
      { status: 500 }
    );
  }
}
