
### 1. Hardcoded / In-Memory State Loss on Server Restarts
- **What’s happening**: In `app/lib/ingestion.ts`, `INGESTION_STATUS` is stored in a simple Node.js in-memory boolean variable (`let INGESTION_STATUS = false`).
- **The Issue**: If the Next.js server restarts or runs in multiple cluster workers (or serverless environments), in-flight ingestion tracking is lost. If an error or crash occurs mid-batch, `INGESTION_STATUS` can stay stuck or desynchronized from PocketBase.
- **Recommended Fix**: Store the background worker lock/status in PocketBase (e.g. a `system_status` collection or record) with an expiry heartbeat so any worker node can observe and safely resume or release the lock.

---

### 2. Sidecar `.json` Blobs and Payload Size Bloat
- **What’s happening**: `activeImageLayers` and individual sidecar JSON files store multiple base64 data URLs (`image`, `object`, `repair`, `color`, and composite masks).
- **The Issue**: 
  - Loading large folders over `/api/folder` or saving layers via `/api/layers` can send request payloads well over 10–30 MB.
  - Base64 encoding increases memory and disk transfer size by ~33%.
- **Recommended Fix**:
  - Store binary layer assets (PNGs/WebPs) as distinct files on disk or in PocketBase file storage, referencing relative paths or URLs in the metadata sidecar rather than embedding raw base64 data URLs.
  - Implement pagination or virtualization in `/api/folder` so directories with thousands of images do not attempt to stream all metadata sidecars in a single synchronous response.

---

### 3. FastAPI Worker Failover & Circuit Breaking
- **What’s happening**: In `app/lib/fastapi.ts`, remote AI segmentation workers are probed during batch runs.
- **The Issue**: If a worker node goes down mid-batch or returns a `500/504`, requests can stall until the HTTP timeout completes, bottlenecking all subsequent images in the queue.
- **Recommended Fix**:
  - Add exponential backoff and a circuit breaker: temporarily mark unresponsive worker endpoints as disabled for a 60-second cooldown before retrying.
  - Distribute tasks concurrently across all healthy workers with `Promise.allSettled` or a worker pool queue (e.g., `p-limit`).

---

### 4. PocketBase Token Renewal & Authentication Expiration
- **What’s happening**: `pb.authStore` in `app/lib/pocketbase/client.ts` uses cached credentials.
- **The Issue**: Long-running background ingestion or long browser sessions can fail with `401 Unauthorized` if admin or user tokens expire during prolonged operations.
- **Recommended Fix**:
  - Add automatic auth token refresh interception: wrap `pb.send` or use an auto-refresh helper (`pb.collection("users").authRefresh()`) when a request returns `401`.

---

### 5. Concurrent File Writes & Race Conditions
- **What’s happening**: Fast slider updates or rapid user changes trigger debounced saves in `persistFileToolbar` and `/api/metadata`.
- **The Issue**: If user A and user B update or re-assign items in the same folder nearly simultaneously, asynchronous writes to `__storage__/<folder>/.json` can overwrite each other's changes.
- **Recommended Fix**: Use atomic write operations (`write-file-atomic` or write-to-temp-then-rename pattern) and optimistic concurrency checking with `updatedAt` timestamps in PocketBase.

---

### 6. Vectorization Engine Resource Constraints
- **What’s happening**: Vector tracing (`app/lib/vectorize.ts`) runs on the server Node.js process using Potrace.
- **The Issue**: High-resolution image segmentations (e.g., 4K/8K images) can cause high CPU spikes and event loop delays for other users on the Next.js process.
- **Recommended Fix**: Offload heavy image tracing and mask vectorization to worker threads (`worker_threads`) or pass it to the Python backend alongside segmentation.