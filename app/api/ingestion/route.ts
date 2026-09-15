import { NextRequest, NextResponse } from "next/server";
import { INGESTION_STATUS, triggerFastApiDistributedAutomation } from "@/app/lib/ingestion";
import { STORAGE_ROOT } from "@/app/lib/storage";

import { RESOLVED_AUTO_INGEST_INTERVAL_MINS } from "@/app/types";

export const dynamic = "force-dynamic";


/**
 * GET /api/ingestion
 * Returns the current INGESTION_STATUS.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    ingestionStatus: INGESTION_STATUS,
    autoIngestIntervalMins: RESOLVED_AUTO_INGEST_INTERVAL_MINS,
  });
}

/**
 * POST /api/ingestion
 * Triggers batch processing of all images in STORAGE_PATH via FastAPI.
 */
export async function POST(request: NextRequest) {
  try {

    const body = await request.json().catch(() => ({}));
    const targetFolder = body.folder || STORAGE_ROOT;

    const result = await triggerFastApiDistributedAutomation(targetFolder);
    
    return NextResponse.json({
      ok: true,
      result,
      message: `Batch segmentation triggered for storage directory (${targetFolder})`,
    });
  } catch (error) {
    console.error("Batch automation trigger failed:", error);
    const message = error instanceof Error ? error.message : "Failed to trigger batch processing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
