# Python Vision & Image Processing Service (`detect`)

This directory contains the core Python AI backend service powering automated object segmentation, mask vectorization/smoothing, and multi-format asset exports.

---

## 🏗️ Architecture & Modules

The `detect` module consists of three primary configuration and execution files:

1. **[`config.py`](file:///c:/Users/vyshn/OneDrive/Desktop/app/detect/config.py)**
   - **Global Configuration & Vectorization Toggle**: Contains `ENABLE_VECTORIZATION` toggle and `DEFAULT_OPTIONS` dictionary (threshold values, blob size limits, simplification epsilon, Chaikin smoothing iterations, contour offset, and feathering).

2. **[`birefnet.py`](file:///c:/Users/vyshn/OneDrive/Desktop/app/detect/birefnet.py)**
   - **BiRefNet / RMBG-2.0 Segmentation Engine**: Manages neural model loading, weights caching, and inference.
   - **Hardware-Constrained Resizing**: Dynamically computes hardware-safe image dimensions based on available GPU VRAM or system RAM to prevent Out-Of-Memory (OOM) crashes.
   - **CUDA & CPU Fallback**: Automatically checks CUDA device health and falls back to CPU execution if GPU hardware is unavailable.

3. **[`__main__.py`](file:///c:/Users/vyshn/OneDrive/Desktop/app/detect/__main__.py)**
   - **Mask Refinement & Compositing Engine**: Pipeline matching `app/lib/export.ts` to trace contours (`trace_and_vectorize_mask`), perform simplification, Chaikin smoothing, thresholding, color mapping (`color_in`, `color_out`), and color layer compositing.
   - **Recursive Batch Ingestion CLI**: Recursively scans source directories (`--src`), processes pending images or sidecar JSON metadata, and writes output files (`.png`, `.webp`, `.jpg`) to destination directories (`--dst`).

---

## 🚀 Getting Started

### Prerequisites

Activate your Python virtual environment and ensure all dependencies are installed:

```bash
# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt
```

---

## ⚙️ Configuration & Vectorization (`config.py`)

You can control pipeline settings and toggles in [`config.py`](file:///c:/Users/vyshn/OneDrive/Desktop/app/detect/config.py):

```python
ENABLE_VECTORIZATION = True  # Enable / disable contour vectorization pipeline stage

DEFAULT_OPTIONS = {
    "thresholdValue": 64,
    "thresholdValueEnabled": True,
    "traceMinBlobPixels": 32,
    "traceMinBlobPixelsEnabled": True,
    "simplifyEpsilon": 0.75,
    "simplifyEpsilonEnabled": True,
    "smoothIterations": 1,
    "smoothIterationsEnabled": True,
    "contourOffset": -0.5,
    "contourOffsetEnabled": True,
    "featherEnabled": True,
    "feather": 0.5,
}
```

---

## 💻 CLI Commands & Usage

### Run Batch Ingestion & Refinement Pipeline

Recursively detect objects, refine masks, and output composite assets:

```bash
# Direct python execution (ensure virtual environment is active)
python -m detect --src path/to/source_folder --dst path/to/destination_folder --res 512

# Explicit virtual environment execution on Windows
.\.venv\Scripts\python.exe -m detect --src path/to/source --dst path/to/destination
```

Or execute via npm script:

```bash
npm run python -- --src path/to/source --dst path/to/destination
```

**Options:**
- `--src`: Path to input image file, sidecar JSON, or folder (required).
- `--dst`: Output destination directory or file path (required).
- `--res`: Target resolution dimension override (e.g., 512).

---

## 🔌 API Endpoints & Server

The server entrypoint exposes FastAPI endpoints for Next.js frontend integration.

### `POST /api/segment`
Executes BiRefNet segmentation on an uploaded image.
- **Payload**: `Multipart Form Data` (`image` file + options)
- **Response**: Segmented image binary or base64 mask string.

### `POST /api/ingest`
Triggers background ingestion for a specified source and destination path.
- **Request Body**:
  ```json
  {
    "src": "__storage__/raw",
    "dst": "__storage__/processed"
  }
  ```
- **Response**: `{ "status": "triggered", ... }`

