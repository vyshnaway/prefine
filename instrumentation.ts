export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { triggerFastApiDistributedAutomation } = await import("@/app/lib/ingestion");
    const { RESOLVED_AUTO_INGEST_INTERVAL_MINS } = await import("@/app/types");

    const intervalMs = RESOLVED_AUTO_INGEST_INTERVAL_MINS * 60 * 1000;
    console.log(
      `[Backend Scheduler] Starting automatic ingestion timer every ${RESOLVED_AUTO_INGEST_INTERVAL_MINS} minute(s)`
    );

    setInterval(async () => {
      try {
        console.log(`[Backend Scheduler] ${new Date().toISOString()}: Triggering scheduled auto-ingestion...`);
        const result = await triggerFastApiDistributedAutomation();
        console.log(`[Backend Scheduler] Scheduled auto-ingestion completed:`, result);
      } catch (err) {
        console.error(`[Backend Scheduler] Scheduled auto-ingestion error:`, err);
      }
    }, intervalMs);
  }
}
