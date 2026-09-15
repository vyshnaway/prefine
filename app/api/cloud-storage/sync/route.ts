import { NextRequest, NextResponse } from "next/server";
import { CloudProviderConfig, syncCloudProviderToWorkspace, loadCloudConfigs } from "@/app/lib/cloud-storage";

export const dynamic = "force-dynamic";

/**
 * POST /api/cloud-storage/sync
 * Triggers background sync of remote cloud storage datasets into local workspace.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerId, provider: payloadProvider, customItems } = body as {
      providerId?: string;
      provider?: CloudProviderConfig;
      customItems?: { url: string; filename: string }[];
    };

    let targetProvider = payloadProvider;

    if (!targetProvider && providerId) {
      const configs = await loadCloudConfigs();
      targetProvider = configs.find((c) => c.id === providerId);
    }

    if (!targetProvider) {
      return NextResponse.json({ error: "Cloud provider profile not found" }, { status: 404 });
    }

    const result = await syncCloudProviderToWorkspace(targetProvider, customItems);

    return NextResponse.json({
      success: true,
      message: `Synced ${result.downloadedCount} image(s) to folder '${result.targetFolder}'`,
      downloadedCount: result.downloadedCount,
      targetFolder: result.targetFolder,
      errors: result.errors,
    });
  } catch (error: any) {
    console.error("Cloud sync error:", error);
    return NextResponse.json({ error: error.message || "Cloud sync failed" }, { status: 500 });
  }
}
