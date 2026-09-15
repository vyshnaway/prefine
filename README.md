# Segmentation Studio & Mask Refinement Engine

A high-performance, non-destructive **Image Segmentation, Vectorization & Mask Annotation Studio** built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **PocketBase**, **FastAPI (PyTorch RMBG-2.0 / BiRefNet)**, and **HTML5 Canvas**.

---

## Key Features

- **Multi-Persona Refinement Pipeline**:
  - `Admin`: User account management, custom roles, and distributed AI worker cluster configuration.
  - `Image`: High-resolution canvas inspection with hardware-accelerated pan & zoom.
  - `Object`: AI-assisted auto-segmentation powered by FastAPI (RMBG-2.0 / BiRefNet with 4-way rotational TTA).
  - `Repair`: Non-destructive manual raster touch-ups (Soft/Hard brush stamping, Polygon Lasso, and Erase).
  - `Vector`: Real-time topological contour extraction (Marching Squares), polygonal simplification (Ramer-Douglas-Peucker), Chaikin curve smoothing, and morphological dilation/erosion offsetting.
  - `Color / Inpaint`: Final compositing and custom colorization masks.
- **Team Workflow & Task Management**:
  - `NavTable` data grid with batch task assignment, priority tagging, and progress tracking (`unassigned`, `assigned`, `progressing`, `commented`, `completed`).
  - PocketBase authentication backend for team accounts, permissions, and roles.
  - Global `.index.json` workspace catalog for instant multi-folder search and triage.
- **Distributed AI Worker Infrastructure**:
  - Connect to local or remote GPU worker clusters (`/api/workers`) for parallelized batch segmentation.
  - Automated background ingestion and distributed task scheduling (`/api/ingestion`).
- **Sidecar-Based Storage Model**:
  - Automatically loads and synchronizes per-folder metadata (`folder.json` / `.index.json`) and per-image multi-layer assets (`.json` sidecar preserving raw image, object mask, repair strokes, and color layers).
- **Fast 60 FPS Canvas Architecture**:
  - 32-bit `Uint32Array` buffers with fixed-point math for zero-latency mask thresholding and luminance-to-alpha conversions.
  - Pre-allocated offscreen scratch buffers to eliminate garbage collection pauses.
- **Autoplay & Rapid Triage**:
  - Loop previewing with adjustable speed micro-steppers for bulk dataset validation.
  - Quick issue flagging, inline inspector notes, and gated **Checked & Export** workflows.

---

## Tech Stack

- **Frontend**: Next.js 16 (React 19), TypeScript, Tailwind CSS v4, Lucide Icons, Motion.
- **Database & Auth**: PocketBase (embedded Go/SQLite server on port `8099`).
- **Algorithms**: Marching Squares (`marchingsquares`), Ramer-Douglas-Peucker (`simplify-js`), Chaikin Curve Smoothing (`chaikin-smooth`), Sharp.
- **AI / Backend**: Python 3.10+, FastAPI, PyTorch (CUDA / CPU), HuggingFace Transformers (`birefnet` / `rmbg-2.0`).

---

## Getting Started

### Prerequisites
- **Node.js**: v20.0+ / npm
- **Python**: 3.10+ (with PyTorch and CUDA support recommended for AI segmentation)
- **PocketBase**: `pocketbase.exe` (included in root)

### Installation

1. **Clone the repository and run the cross-platform setup:**
   ```bash
  npm run setup
   ```

  This installs Node dependencies, creates `.venv`, installs Python dependencies, and downloads the correct PocketBase executable for Windows, macOS, or Linux. Node.js 20+, Python 3.10+, and `unzip` on macOS/Linux are required.

2. **Start the application:**
   ```bash
  npm run app
   ```

  The runner starts PocketBase, FastAPI, and Next.js together. Each service writes to `logs/pocketbase.log`, `logs/fastapi.log`, and `logs/next.log`; failures are also printed with the service name. Press `Ctrl+C` to stop all services.

  Platform launchers are also available as `scripts/setup.ps1` and `scripts/run.ps1` on Windows, or `scripts/setup.sh` and `scripts/run.sh` on macOS/Linux.

3. **Configure Storage Directory:**
   Place input images in the local `__storage__/` directory (or subfolders within `__storage__/`).

### Running the Application

To start all services concurrently (PocketBase, FastAPI AI Server, and Next.js Dev Server) after setup:
```bash
npm run app
```

Alternatively, run each service independently:
```bash
# Terminal 1 (PocketBase Backend):
npm run pocketbase

# Terminal 2 (Python AI Backend):
npm run python

# Terminal 3 (Next.js Dev Server):
npm run dev:next
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── assign/      # Batch task assignment to team members
│   │   ├── export/      # Output generation (PNG/WebP exports and metadata commit)
│   │   ├── file/        # Sidecar JSON initialization & layer retrieval
│   │   ├── folder/      # Folder listings and hierarchy traversal
│   │   ├── ingestion/   # Distributed batch AI segmentation trigger
│   │   ├── metadata/    # Tagging, issues, comments, and per-file toolbar settings
│   │   ├── object/      # Auto-segmentation proxy to local/remote FastAPI model
│   │   ├── reindex/     # Global .index.json accumulation and catalog synchronization
│   │   ├── roles/       # User role management (PocketBase integration)
│   │   ├── sidecar/     # Direct non-destructive layer blob updates
│   │   ├── users/       # Team account management (PocketBase integration)
│   │   └── workers/     # Distributed FastAPI AI worker health & configuration
│   ├── components/
│   │   ├── AdminWorkspace/   # Team accounts, roles, and AI worker management UI
│   │   ├── Auth/             # Login and authentication modals
│   │   ├── HeaderToolbar/    # Persona switch, brush parameters, vector controls
│   │   ├── NavTable/         # Batch triage table, task assignment, status filtering
│   │   ├── PreviewWorkspace/ # Viewport canvas, gesture controls, offscreen compositing
│   │   ├── ButtonBar.tsx     # Image/folder navigation, autoplay loop, Resolve/Export
│   │   ├── Inspector.tsx     # Issue tags, comment notes, and file statistics
│   │   └── TeamSidebar.tsx   # Team member list, quick assignment, status filters
│   ├── lib/
│   │   ├── auth-context.tsx  # PocketBase client authentication context
│   │   ├── export.ts         # High-resolution multi-format image exporter
│   │   ├── fastapi.ts        # FastAPI worker communication & health checks
│   │   ├── file.ts           # Sidecar read/write operations
│   │   ├── image.ts          # Sharp image processing & buffer conversion
│   │   ├── ingestion.ts      # Distributed batch processing & worker balancing
│   │   ├── pocketbase.ts     # PocketBase client configuration & defaults
│   │   ├── sidecar.ts        # Sidecar layer manipulation & global indexer
│   │   ├── storage.ts        # Path traversal security & safe directory resolver
│   │   ├── task-status.ts    # Task status and priority definitions
│   │   ├── toolbar.ts        # Toolbar state management & serialization
│   │   └── vectorize.ts      # Marching squares, simplification, smoothing & morphology
│   ├── page.tsx              # Central state coordinator & event dispatcher
│   └── types.ts              # Data models and API contract definitions
├── __storage__               # Local image directory and generated sidecar files
├── python/
│   ├── __main__.py           # FastAPI AI segmentation service (RMBG-2.0 / BiRefNet)
│   ├── automate.py           # Batch disk processor
│   └── detector.py           # PyTorch inference & 4-way rotational TTA
├── pocketbase.exe            # PocketBase executable
└── package.json
```

---

## Keyboard & Navigation Shortcuts

- **Middle Mouse Click / Shift + Left Click**: Pan the workspace canvas.
- **Mouse Wheel**: Smooth zoom anchored to cursor coordinates.
- **Right Click / Secondary Mouse Button**: Erase stroke in Brush / Lasso modes.
- **Autoplay**: Hands-free cycling across images with adjustable stepper speed.
- **A / D or Arrow Left / Arrow Right**: Previous / Next image.
- **1 - 6**: Switch between Studio Personas (Admin, Image, Object, Repair, Vector, Color).
