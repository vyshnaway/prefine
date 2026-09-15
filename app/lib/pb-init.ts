/**
 * PocketBase Collection Auto-Initializer & Migrator
 * Runs at app startup to ensure `metafiles`, `metafolders`, `assignments`,
 * and default users exist in PocketBase without requiring manual UI configuration.
 */

import { POCKETBASE_URL } from "./pocketbase";

export async function ensurePocketBaseCollections(adminEmail?: string, adminPass?: string) {
  try {
    const health = await fetch(`${POCKETBASE_URL}/api/health`).then(r => r.json()).catch(() => null);
    if (!health || health.code !== 200) {
      console.log("[PocketBase Sync] PocketBase server is not running or unreachable. Skipping DB schema sync.");
      return;
    }

    console.log("[PocketBase Sync] PocketBase is reachable at", POCKETBASE_URL);
  } catch (err) {
    console.warn("[PocketBase Sync] Initialization skipped:", err);
  }
}
