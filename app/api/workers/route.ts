import { NextRequest, NextResponse } from "next/server";
import { FastApiWorkerConfig } from "@/app/types";
import { checkFastApiHealth, getLocalServerState } from "@/app/lib/fastapi";
import { getPocketBaseWorkers, upsertPocketBaseWorker, deletePocketBaseWorker } from "@/app/lib/pocketbase";

export const dynamic = "force-dynamic";

/** Load worker configurations solely from PocketBase database table */
async function loadWorkers(): Promise<FastApiWorkerConfig[]> {
  try {
    const pbWorkers = await getPocketBaseWorkers();
    return pbWorkers.filter((w) => w.id !== "local_default");
  } catch (err) {
    console.error("Failed to fetch workers from PocketBase:", err);
    return [];
  }
}

async function getAllWorkersWithStatus(): Promise<FastApiWorkerConfig[]> {
  const persistedWorkers = await loadWorkers();

  // Check health of external workers in parallel
  const checkedWorkers = await Promise.all(
    persistedWorkers.map(async (worker) => {
      if (!worker.enabled) {
        return { ...worker, status: "offline" as const };
      }
      const isOnline = await checkFastApiHealth(worker.url);
      return {
        ...worker,
        status: isOnline ? ("online" as const) : ("offline" as const),
      };
    })
  );

  // In-memory representation of the local sibling process
  const localState = getLocalServerState();
  const isLocalOnline = await checkFastApiHealth(localState.url);

  const localWorker: FastApiWorkerConfig = {
    id: "local_default",
    name: "Serverless",
    url: localState.url,
    enabled: true,
    status: isLocalOnline ? "online" : "offline",
  };

  return [localWorker, ...checkedWorkers];
}

/**
 * GET /api/workers
 * Returns list of configured FastAPI worker endpoints with live health statuses,
 * plus the auto-managed local sibling FastAPI server dynamically kept in-memory.
 */
export async function GET() {
  try {
    const allWorkers = await getAllWorkersWithStatus();
    return NextResponse.json({ ok: true, workers: allWorkers });
  } catch (error) {
    console.error("Failed to load workers:", error);
    return NextResponse.json({ error: "Failed to load workers" }, { status: 500 });
  }
}

/**
 * POST /api/workers
 * Adds or updates a worker endpoint in PocketBase database.
 * Body: { id?: string, name: string, url: string, enabled?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.name || !body.url) {
      return NextResponse.json({ error: "name and url are required" }, { status: 400 });
    }

    let url = body.url.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }

    const id = body.id || `worker_${Date.now()}`;
    const newWorker: FastApiWorkerConfig = {
      id,
      name: body.name.trim(),
      url,
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
    };

    // Save strictly to PocketBase database table
    await upsertPocketBaseWorker(newWorker);

    const allWorkers = await getAllWorkersWithStatus();

    return NextResponse.json({
      ok: true,
      worker: newWorker,
      workers: allWorkers,
    });
  } catch (error) {
    console.error("Failed to save worker to database:", error);
    return NextResponse.json({ error: "Failed to save worker to database" }, { status: 500 });
  }
}

/**
 * PUT /api/workers
 * Toggles or edits a worker endpoint in PocketBase database.
 * Body: { id: string, name?: string, url?: string, enabled?: boolean }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (body.id === "local_default") {
      const allWorkers = await getAllWorkersWithStatus();
      return NextResponse.json({ ok: true, workers: allWorkers });
    }

    const workers = await loadWorkers();
    const existing = workers.find((w) => w.id === body.id);
    if (!existing) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    let url = existing.url;
    if (body.url !== undefined) {
      url = body.url.trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
    }

    const updatedWorker: FastApiWorkerConfig = {
      id: existing.id,
      name: body.name !== undefined ? body.name.trim() : existing.name,
      url,
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : existing.enabled,
    };

    // Save strictly to PocketBase database table
    await upsertPocketBaseWorker(updatedWorker);

    const allWorkers = await getAllWorkersWithStatus();
    return NextResponse.json({ ok: true, workers: allWorkers });
  } catch (error) {
    console.error("Failed to update worker in database:", error);
    return NextResponse.json({ error: "Failed to update worker in database" }, { status: 500 });
  }
}

/**
 * DELETE /api/workers
 * Removes a worker endpoint from PocketBase database.
 * Query: ?id=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Worker id is required" }, { status: 400 });
    }

    if (id !== "local_default") {
      await deletePocketBaseWorker(id);
    }

    const allWorkers = await getAllWorkersWithStatus();
    return NextResponse.json({ ok: true, deletedId: id, workers: allWorkers });
  } catch (error) {
    console.error("Failed to delete worker from database:", error);
    return NextResponse.json({ error: "Failed to delete worker from database" }, { status: 500 });
  }
}
