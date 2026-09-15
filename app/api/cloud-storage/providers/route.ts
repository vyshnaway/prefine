import { NextRequest, NextResponse } from "next/server";
import { CloudProviderConfig, loadCloudConfigs, saveCloudConfigs, testCloudConnection, sanitizeProviderForClient } from "@/app/lib/cloud-storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/cloud-storage/providers
 * Returns all configured cloud storage provider profiles with sanitized credentials.
 */
export async function GET() {
  try {
    const configs = await loadCloudConfigs();
    const sanitized = configs.map(sanitizeProviderForClient);
    return NextResponse.json({ providers: sanitized });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load providers" }, { status: 500 });
  }
}

/**
 * POST /api/cloud-storage/providers
 * Saves or tests a cloud storage provider configuration.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, provider } = body as { action: "save" | "delete" | "test"; provider: CloudProviderConfig };

    if (!provider || !provider.id) {
      return NextResponse.json({ error: "Invalid provider payload" }, { status: 400 });
    }

    if (action === "test") {
      const testResult = await testCloudConnection(provider);
      return NextResponse.json(testResult);
    }

    const configs = await loadCloudConfigs();

    if (action === "delete") {
      const filtered = configs.filter((c) => c.id !== provider.id);
      await saveCloudConfigs(filtered);
      return NextResponse.json({ success: true, providers: filtered });
    }

    if (action === "save") {
      const testResult = await testCloudConnection(provider);
      provider.status = testResult.success ? "connected" : "error";
      provider.errorMessage = testResult.success ? undefined : testResult.message;

      const idx = configs.findIndex((c) => c.id === provider.id);
      if (idx !== -1) {
        configs[idx] = provider;
      } else {
        configs.push(provider);
      }

      await saveCloudConfigs(configs);
      return NextResponse.json({ success: true, testResult, providers: configs });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Operation failed" }, { status: 500 });
  }
}
