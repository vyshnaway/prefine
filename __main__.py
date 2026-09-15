
import io
import os
import uvicorn
import argparse
from dotenv import load_dotenv

from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager


import asyncio
from pydantic import BaseModel
from typing import Optional

from detect import (
    device,
    models,
    set_dimention,
    segment_image_pipeline,
    verify_cuda,
    process as run_ingest_process
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager."""
    print(f"Vision service active on device: {device}")
    yield
    models.clear()

app = FastAPI(
    title="Image Segmentation API", 
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AutomateRequest(BaseModel):
    folder: Optional[str] = None
    multisided: bool = False


class IngestRequest(BaseModel):
    src: str
    dst: str
    list: Optional[str] = None
    multisided: bool = False



@app.post("/api/ingest")
async def trigger_ingest(req: IngestRequest):
    """
    Triggers object mask detection and refinement ingestion on a folder or file.
    """
    if not os.path.exists(req.src):
        raise HTTPException(status_code=404, detail=f"Source path not found: {req.src}")

    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, lambda: run_ingest_process(req.src, req.dst, multisided=req.multisided))

    return {
        "status": "triggered",
        "src": req.src,
        "dst": req.dst,
        "multisided": req.multisided,
        "message": "Ingestion pipeline started in background.",
    }

class ImageSegmentationRequest(BaseModel):
    width: int = 1024
    height: int = 1024
    multisided: bool = False
    object_raw__bg_white: bool = False
    object_raw__bg_black: bool = False
    object_raw__bg_transparent: bool = False
    object_white__bg_raw: bool = False
    object_white__bg_black: bool = False
    object_white__bg_transparent: bool = False
    object_black__bg_raw: bool = False
    object_black__bg_white: bool = False
    object_black__bg_transparent: bool = False
    object_transparent__bg_raw: bool = False
    object_transparent__bg_white: bool = False
    object_transparent__bg_black: bool = False

@app.post("/api/segment")
async def segment_image(
    image: UploadFile = File(...),
    options: ImageSegmentationRequest = Depends(),
):
    """
    Automated High-Res Matting via BiRefNet, using 4-way rotational
    test-time augmentation (0/90/180/270deg) for a more robust mask.
    Query parameters determine which modes are generated and returned in
    the JSON payload.
    """
    set_dimention(options.height, options.width)

    try:
        contents = await image.read()
        pil_img = Image.open(io.BytesIO(contents)).convert("RGB")

        loop = asyncio.get_event_loop()
        response_data = await loop.run_in_executor(
            None,
            lambda: segment_image_pipeline(
                pil_img=pil_img,
                multisided = options.multisided,
                object_raw__bg_white = options.object_raw__bg_white,
                object_raw__bg_black = options.object_raw__bg_black,
                object_raw__bg_transparent = options.object_raw__bg_transparent,
                object_white__bg_raw = options.object_white__bg_raw,
                object_white__bg_black = options.object_white__bg_black,
                object_white__bg_transparent = options.object_white__bg_transparent,
                object_black__bg_raw = options.object_black__bg_raw,
                object_black__bg_white = options.object_black__bg_white,
                object_black__bg_transparent = options.object_black__bg_transparent,
                object_transparent__bg_raw = options.object_transparent__bg_raw,
                object_transparent__bg_white = options.object_transparent__bg_white,
                object_transparent__bg_black = options.object_transparent__bg_black,
            )
        )

        return JSONResponse(content=response_data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image segmentation failed: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint to verify service is ready."""
    return {
        "status": "ok", 
        "device": device, 
        "loaded_models": list(models.keys())
    }



if __name__ == "__main__":

    verify_cuda()
    load_dotenv()

    default_port = int(os.getenv("FASTAPI_PORT") or 8000)

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", type=str, default="127.0.0.1")
    parser.add_argument("--port", type=int, default=default_port)
    args, _ = parser.parse_known_args()
    
    uvicorn.run(app, host=args.host, port=args.port)