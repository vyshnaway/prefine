# Architecture & Technical Design

This document details the system design, data flow, multi-layer canvas compositor, distributed AI worker architecture, and database integrations of the **Segmentation Studio & Mask Refinement Engine**.

---

## 1. High-Level Architecture

The system consists of a hybrid architecture combining a high-performance **Next.js 16 Web Client** (React 19, HTML5 Canvas 60 FPS), **PocketBase** for team auth/roles/accounts, and scalable **PyTorch / FastAPI Microservice Workers** for GPU-accelerated image segmentation.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend (App)                          │
│  - Multi-Persona Studio: Admin, Image, Object, Repair, Vector, Color   │
│  - Hardware-Accelerated 60 FPS HTML5 Canvas Compositor (32-bit Array)  │
│  - Realtime Vectorization & Morphological Mask Math (Marching Squares) │
│  - Team Navigation Table, Batch Triage, Task State Tracking            │
└──────────────┬─────────────────────────┬───────────────────────────────┘
               │                         │
               ▼                         ▼
┌──────────────────────────────┐ ┌────────────────────────────────────────┐
│   Next.js API Route Layer    │ │      FastAPI AI Worker Cluster         │
│  - /api/folder (Directory)   │ │  - Primary: localhost:5678 (Auto)      │
│  - /api/file (Sidecar IO)    │ │  - Workers: Distributed Remote Nodes   │
│  - /api/sidecar (Blob Sync)  │ │  - BiRefNet / RMBG-2.0 Segmentation    │
│  - /api/metadata (Tags/Note) │ │  - 4-way Rotational TTA (0/90/180/270) │
│  - /api/export (PNG/WebP)    │ └────────────────────▲───────────────────┘
│  - /api/assign (Task Assign) │                      │
│  - /api/ingestion (Batch AI) │                      │
│  - /api/reindex (Global Sync)│                      │
│  - /api/workers (Health Mgmt)│                      │
└──────────────┬───────────────┘                      │
               │ (Proxy Segmentation / Load Balance)  │
               ├──────────────────────────────────────┘
               ▼
┌──────────────────────────────┐ ┌────────────────────────────────────────┐
│      PocketBase Server       │ │         Local Storage Sidecars         │
│  - Collections: users, roles │ │  - <name>.png / <name>.webp            │
│  - Team authentication       │ │  - <name>.json (Layer Blobs)           │
│  - Port :8099                │ │  - folder.json (Per-folder Metadata)   │
└──────────────────────────────┘ │  - .index.json (Global Workspace Index) │
                                 └────────────────────────────────────────┘
```

---

## 2. Storage & Sidecar Data Model

All edits in the application are **non-destructive** and persisted using JSON sidecars adjacent to the image files inside `__storage__/`.

### 2.1 File Layer Sidecar (`<image_name>.json`)
Stores base64 data URLs for each independent canvas layer:
```typescript
interface ImgJsonBlob {
  image: string;  // Original raw image
  object: string; // AI generated foreground mask
  repair: string; // Manual raster corrections / brush strokes
  color: string;  // Inpainting / paint layer
}
```

### 2.2 Folder-Level Sidecar (`folder.json`)
Stores aggregated metadata, validation flags, task status, priority, and per-file toolbar settings:
```typescript
interface MetaFile {
  name: string;
  width: number;
  height: number;
  thumbnail: string;
  issues: string[];       // Issue tags (e.g. "bg-noise", "part-excess")
  comment: string;        // Reviewer notes
  filesizes: {
    png?: number;
    webp?: number;
    raw?: number;
  };
  assignedTo?: string;    // PocketBase User ID
  assignedToName?: string;
  status?: "unassigned" | "assigned" | "progressing" | "commented" | "completed";
  priority?: "low" | "medium" | "high";
  toolbar?: FileToolbarSettings; // Per-file tool states
}

interface FolderJson {
  metafiles: Record<string, MetaFile>;
  metafolders?: Record<string, MetaFolder>;
}
```

### 2.3 Global Workspace Index (`.index.json`)
Maintains an atomic snapshot of all subfolders, task distributions, and file metadata across the entire storage directory for instant catalog searches without deep disk traversal.

---

## 3. Mask Vectorization & Processing Pipeline

The vectorization stage converts raster masks into clean topological vectors in real time inside [`app/lib/vectorize.ts`](file:///c:/Users/vyshn/OneDrive/Desktop/app/app/lib/vectorize.ts).

```
  [Raster Mask Canvas]
          │
          ▼
   1. Thresholding (Fast 32-bit Luminance Grid)
          │
          ▼
   2. Iso-contour Tracing (Marching Squares)
          │
          ▼
   3. Blob Size Filtering (polygonArea >= minBlobPixels)
          │
          ▼
   4. Polygonal Simplification (Ramer-Douglas-Peucker)
          │
          ▼
   5. Curve Smoothing (Chaikin's Corner-Cutting)
          │
          ▼
   6. Morphology Offsetting (Inward Erosion / Outward Dilation)
          │
          ▼
   7. Gaussian Feathering
          │
          ▼
   [Final Composite Vector Mask]
```

---

## 4. Distributed AI Segmentation & Worker Balancing

1. **Auto-Discovery & Custom Workers**:
       - Next.js can communicate with local FastAPI (`http://127.0.0.1:5678`) or remote GPU inference clusters configured through the Admin workspace and persisted in PocketBase.
2. **Distributed Ingestion Pipeline**:
   - Workloads are chunked and distributed across healthy online workers with automatic fallback on timeout or error.
3. **4-Way Rotational TTA**:
   - BiRefNet / RMBG-2.0 executes inference across 0°, 90°, 180°, and 270° rotations to eliminate boundary artifacts and enhance segmentation edge precision.

---

## 5. Performance Optimizations

1. **32-Bit Flat Buffers**:
   - Luminance and thresholding loops operate on `Uint32Array(data.buffer)` using integer bitwise shifts (`(r*19595 + g*38469 + b*7472) >> 16`) rather than floating-point RGBA math.
2. **Context Readback Optimization**:
   - 2D canvas contexts are initialized with `{ willReadFrequently: true }` to keep pixel buffers in CPU-accessible memory and avoid GPU sync stalls.
3. **Offscreen Canvas Recycling**:
   - Intermediate rendering canvases (`tempThresholdCanvas`, `tempLuminanceCanvas`, `tempCompositeMaskRef`) are pre-allocated and pooled to prevent GC thrashing during slider drag interactions.
4. **Decoupled Render Architecture**:
   - Heavy stroke recording mutates offscreen canvases directly, while the viewport rendering runs on `requestAnimationFrame` using hardware matrix transformations (`ctx.setTransform(zoom, 0, 0, zoom, panX, panY)`).
