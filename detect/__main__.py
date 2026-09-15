"""
Python implementation of the asset composite export pipeline matching app/lib/export.ts.

Pipeline:
1. Base Image Layer (RGBA)
2. Composite Object + Repair Layers for Mask
3. Vectorize / Threshold Stage (Contours, Simplification, Smoothing, Offset, Luminance-to-Alpha)
4. Color / Paint Layer (RGBA)
5. Final Composite (Base Image + Mask Alpha + Color Layer)
6. Export multi-format outputs (.png, .webp, .jpg) to destination path
"""

import sys
import os

_CURR_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT_DIR = os.path.dirname(_CURR_DIR)
if _CURR_DIR not in sys.path:
    sys.path.insert(0, _CURR_DIR)
if _PARENT_DIR not in sys.path:
    sys.path.insert(0, _PARENT_DIR)

try:
    from detect.config import ENABLE_VECTORIZATION, DEFAULT_OPTIONS
    from detect.birefnet import segment_image_pipeline, get_birefnet_model
except ImportError:
    from config import ENABLE_VECTORIZATION, DEFAULT_OPTIONS
    from birefnet import segment_image_pipeline, get_birefnet_model

import os
import io
import json
import base64
import time
import argparse
from typing import Dict, Any, Tuple, Optional
import numpy as np
from PIL import Image, ImageFilter
import cv2


def data_url_to_image(data_url: str) -> Optional[Image.Image]:
    """Decodes a base64 Data URL string to a PIL Image."""
    if not data_url or not data_url.startswith("data:"):
        return None
    try:
        header, b64_str = data_url.split(",", 1)
        image_data = base64.b64decode(b64_str)
        img = Image.open(io.BytesIO(image_data))
        return img.convert("RGBA")
    except Exception as e:
        print(f"[export.py] Failed to decode data URL: {e}")
        return None


def image_to_data_url(img: Image.Image, fmt: str = "PNG") -> str:
    """Encodes a PIL Image to a base64 Data URL string."""
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    mime = "image/png" if fmt.upper() == "PNG" else f"image/{fmt.lower()}"
    return f"data:{mime};base64,{b64}"


def hex_to_rgba(hex_str: str) -> Tuple[int, int, int, int]:
    """Parses a hex color string (#RGB, #RRGGBB, #RRGGBBAA) to an RGBA tuple."""
    hex_str = hex_str.lstrip("#")
    if len(hex_str) == 3:
        r, g, b = [int(c * 2, 16) for c in hex_str]
        return (r, g, b, 255)
    elif len(hex_str) == 6:
        r = int(hex_str[0:2], 16)
        g = int(hex_str[2:4], 16)
        b = int(hex_str[4:6], 16)
        return (r, g, b, 255)
    elif len(hex_str) == 8:
        r = int(hex_str[0:2], 16)
        g = int(hex_str[2:4], 16)
        b = int(hex_str[4:6], 16)
        a = int(hex_str[6:8], 16)
        return (r, g, b, a)
    return (0, 0, 0, 0)


def resolve_layer_image(
    data_url: Optional[str],
    width: int,
    height: int,
    fallback_color: str = "#00000000"
) -> Image.Image:
    """
    Ensures a valid RGBA PIL Image of size (width, height), or a blank fallback canvas.
    """
    if data_url:
        img = data_url_to_image(data_url)
        if img:
            return img.resize((width, height), Image.Resampling.LANCZOS)
    
    fallback_rgba = hex_to_rgba(fallback_color)
    return Image.new("RGBA", (width, height), fallback_rgba)

def binarize_mask(mask_rgba: Image.Image, threshold_level: int = 128) -> Image.Image:
    """Binarizes mask RGBA at threshold level."""
    arr = np.array(mask_rgba)
    gray = cv2.cvtColor(arr, cv2.COLOR_RGBA2GRAY)
    _, thresh = cv2.threshold(gray, threshold_level, 255, cv2.THRESH_BINARY)
    out = np.zeros_like(arr)
    out[:, :, 0] = thresh
    out[:, :, 1] = thresh
    out[:, :, 2] = thresh
    out[:, :, 3] = 255
    return Image.fromarray(out, "RGBA")


def raw_buffer_to_luminance_alpha(img_rgba: Image.Image, invert: bool = False) -> Image.Image:
    """
    Converts an RGBA image into a white luminance-to-alpha mask:
    Output pixel: RGB = (255, 255, 255), Alpha = luminance(R, G, B).
    """
    arr = np.array(img_rgba, dtype=np.uint8)
    r = arr[:, :, 0].astype(np.uint32)
    g = arr[:, :, 1].astype(np.uint32)
    b = arr[:, :, 2].astype(np.uint32)

    # Fixed-point luminance: 0.2126*R + 0.7152*G + 0.0722*B
    lum = ((r * 13932 + g * 46871 + b * 4733) >> 16) & 0xFF
    lum = lum.astype(np.uint8)

    if invert:
        lum = 255 - lum

    out_arr = np.zeros((img_rgba.height, img_rgba.width, 4), dtype=np.uint8)
    out_arr[:, :, 0] = 255
    out_arr[:, :, 1] = 255
    out_arr[:, :, 2] = 255
    out_arr[:, :, 3] = lum

    return Image.fromarray(out_arr, "RGBA")


def chaikin_smooth(points: np.ndarray, iterations: int = 2) -> np.ndarray:
    """Applies Chaikin's corner-cutting smoothing algorithm to a 2D curve in sub-pixel float space."""
    if len(points) < 3 or iterations <= 0:
        return points.astype(np.float32)
    
    curr = points.astype(np.float32)
    for _ in range(iterations):
        next_pts = []
        n = len(curr)
        for i in range(n):
            p0 = curr[i]
            p1 = curr[(i + 1) % n]
            q = 0.75 * p0 + 0.25 * p1
            r = 0.25 * p0 + 0.75 * p1
            next_pts.append(q)
            next_pts.append(r)
        curr = np.array(next_pts, dtype=np.float32)
    return curr


def trace_and_vectorize_mask(
    mask_rgba: Image.Image,
    width: int,
    height: int,
    threshold_level: int = 128,
    min_blob_pixels: int = 25,
    simplify_epsilon: float = 0.8,
    simplify_enabled: bool = True,
    smooth_iterations: int = 2,
    smooth_enabled: bool = True,
    offset_distance: float = 0,
    offset_enabled: bool = False,
    color_in: str = "#000000",
    color_out: str = "#FFFFFF",
) -> Image.Image:
    """
    Traces contours from the mask with sub-pixel precision, simplifies and smooths them in float space,
    and renders an anti-aliased vector mask matching JS HTML5 Canvas / Marching Squares output.
    """
    arr = np.array(mask_rgba)
    gray = cv2.cvtColor(arr, cv2.COLOR_RGBA2GRAY)

    res = segment_image_pipeline(mask_rgba, object_black__bg_white=True)
    if "object_black__bg_white" in res:
        segmented_img = data_url_to_image(res["object_black__bg_white"])
        if segmented_img:
            gray = cv2.cvtColor(np.array(segmented_img), cv2.COLOR_RGBA2GRAY)

    # Threshold
    _, thresh = cv2.threshold(gray, threshold_level, 255, cv2.THRESH_BINARY)

    # Find full-resolution contours without lossy segment compression (CHAIN_APPROX_NONE)
    contours, _ = cv2.findContours(thresh, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)

    processed_contours = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_blob_pixels:
            continue

        c_pts = cnt.reshape(-1, 2).astype(np.float32)

        # Simplify contour using direct pixel distance threshold (matching simplify-js)
        if simplify_enabled and simplify_epsilon > 0:
            epsilon = float(simplify_epsilon)
            approx = cv2.approxPolyDP(c_pts, epsilon, True)
            c_pts = approx.reshape(-1, 2).astype(np.float32)

        # Smooth contour with Chaikin algorithm in floating-point space
        if smooth_enabled and smooth_iterations > 0:
            c_pts = chaikin_smooth(c_pts, smooth_iterations)

        # Round float coordinates to int32 for OpenCV polygon rendering
        int_pts = np.round(c_pts).astype(np.int32)
        processed_contours.append(int_pts.reshape(-1, 1, 2))

    # Parse color_out (background color) and color_in (fill color inside contours)
    bg_rgba = hex_to_rgba(color_out)
    fill_rgba = hex_to_rgba(color_in)

    # Render rasterized vector mask canvas: background = color_out, fill = color_in
    canvas = np.full((height, width, 4), bg_rgba, dtype=np.uint8)

    if processed_contours:
        # Draw with LINE_AA for anti-aliased smooth edges matching JS Canvas
        cv2.drawContours(
            canvas,
            processed_contours,
            -1,
            fill_rgba,
            thickness=cv2.FILLED,
            lineType=cv2.LINE_AA,
        )

    # Apply offset / dilation / erosion if enabled
    if offset_enabled and offset_distance != 0:
        kernel_size = int(abs(offset_distance)) * 2 + 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        if offset_distance > 0:
            canvas = cv2.erode(canvas, kernel)
        else:
            canvas = cv2.dilate(canvas, kernel)

    return Image.fromarray(canvas, "RGBA")


def refine_mask(
    image_data_url: Any,
    object_data_url: Any,
    options: Optional[Dict[str, Any]] = None,
    width: int = 0,
    height: int = 0,
) -> Dict[str, Any]:
    """
    Backend generation script for exporting composite image persona assets in Python.
    
    Pipeline:
    base_image + convert_to_alpha_luminance(vectorize_with_params(input.object + input.repair)) + input.color
    """
    options = options or {}

    # Extract URL if a dictionary/sidecar blob was passed
    if isinstance(image_data_url, dict):
        img_input = image_data_url.get("image", "")
    else:
        img_input = image_data_url

    if isinstance(object_data_url, dict):
        obj_input = object_data_url.get("object", "")
    else:
        obj_input = object_data_url

    # 1. Load Base Image Layer
    base_img = data_url_to_image(img_input) if isinstance(img_input, str) else (img_input if isinstance(img_input, Image.Image) else None)
    if base_img is None:
        raise ValueError("Invalid or empty base image buffer in sidecar JSON blob")

    w, h = base_img.size
    target_w = width or w or 1
    target_h = height or h or 1

    base_layer = base_img.resize((target_w, target_h), Image.Resampling.LANCZOS).convert("RGBA")

    # 2. Composite Object + Repair Layers for Mask
    object_layer = resolve_layer_image(obj_input, target_w, target_h, fallback_color="#000000")

    # 3. Vectorize / Threshold Stage
    threshold_level = options.get("thresholdValue", DEFAULT_OPTIONS["thresholdValue"])
    threshold_enabled = options.get("thresholdValueEnabled", DEFAULT_OPTIONS["thresholdValueEnabled"])
    trace_min_blob = options.get("traceMinBlobPixels", DEFAULT_OPTIONS["traceMinBlobPixels"])
    trace_enabled = options.get("traceMinBlobPixelsEnabled", DEFAULT_OPTIONS["traceMinBlobPixelsEnabled"])
    simplify_epsilon = options.get("simplifyEpsilon", DEFAULT_OPTIONS["simplifyEpsilon"])
    simplify_enabled = options.get("simplifyEpsilonEnabled", DEFAULT_OPTIONS["simplifyEpsilonEnabled"])
    smooth_iterations = options.get("smoothIterations", DEFAULT_OPTIONS["smoothIterations"])
    smooth_enabled = options.get("smoothIterationsEnabled", DEFAULT_OPTIONS["smoothIterationsEnabled"])
    offset_distance = options.get("contourOffset", DEFAULT_OPTIONS["contourOffset"])
    offset_enabled = options.get("contourOffsetEnabled", DEFAULT_OPTIONS["contourOffsetEnabled"])
    feather_enabled = options.get("featherEnabled", DEFAULT_OPTIONS["featherEnabled"])
    feather_val = options.get("feather", DEFAULT_OPTIONS["feather"])
    color_in = options.get("colorIn", options.get("color_in", "#000000"))
    color_out = options.get("colorOut", options.get("color_out", "#FFFFFF"))

    mask_alpha_img = object_layer
    if ENABLE_VECTORIZATION:
        if threshold_enabled and trace_enabled:
            mask_alpha_img = trace_and_vectorize_mask(
                object_layer,
                target_w,
                target_h,
                threshold_level=threshold_level,
                min_blob_pixels=trace_min_blob,
                simplify_epsilon=simplify_epsilon,
                simplify_enabled=simplify_enabled,
                smooth_iterations=smooth_iterations,
                smooth_enabled=smooth_enabled,
                offset_distance=offset_distance,
                offset_enabled=offset_enabled,
                color_in=color_in,
                color_out=color_out,
            )
    elif threshold_enabled:
        mask_alpha_img = binarize_mask(object_layer, threshold_level=threshold_level)


    # Feathering (Gaussian Blur)
    if feather_enabled and feather_val > 0.1:
        mask_alpha_img = mask_alpha_img.filter(ImageFilter.GaussianBlur(radius=feather_val))

    # 4. Final Composite: Base Image + Mask Alpha
    final_composite = Image.alpha_composite(
        base_layer, 
        raw_buffer_to_luminance_alpha(
            mask_alpha_img,
            invert= not ENABLE_VECTORIZATION
        )
    )

    buf = io.BytesIO()
    final_composite.save(buf, format="PNG")
    output_bytes = buf.getvalue()

    return {
        "buffer": output_bytes,
        "mime_type": "image/png",
        "width": target_w,
        "height": target_h,
    }


def detect_and_refine_mask(
    image_input: Any,
    options: Optional[Dict[str, Any]] = None,
    multisided: bool = False,
    width: int = 0,
    height: int = 0,
    max_res: int = 0,
) -> Dict[str, Any]:
    """
    Detects object mask from an input image using BiRefNet model,
    and refines the mask using vectorization/smoothing via `refine_mask`.

    :param image_input: PIL Image, Data URL string, file path, image bytes, or dict {"image": ...}
    :param options: Dict of mask refinement options (thresholdValue, contourOffset, feather, etc.)
    :param multisided: Whether to run 4-pass TTA segmentation
    :param write_path: Optional destination write path for sibling files (.png, .webp, .jpg)
    :param width: Target export width override
    :param height: Target export height override
    :param max_res: Maximum dimension (width or height) to downscale image before segmentation
    :return: Dict containing {"buffer": bytes, "mime_type": "image/png", "width": int, "height": int, "mask_data_url": str}
    """
    # 1. Resolve base_img from input
    base_img: Optional[Image.Image] = None
    if isinstance(image_input, dict):
        base_img = data_url_to_image(image_input.get("image", ""))
    elif isinstance(image_input, str):
        if image_input.startswith("data:"):
            base_img = data_url_to_image(image_input)
        elif os.path.exists(image_input):
            with Image.open(image_input) as _f:
                base_img = _f.convert("RGBA")
    elif isinstance(image_input, bytes):
        base_img = Image.open(io.BytesIO(image_input)).convert("RGBA")
    elif isinstance(image_input, Image.Image):
        base_img = image_input.convert("RGBA")

    if base_img is None:
        raise ValueError("Invalid image input provided to detect_and_refine_mask")

    # Downscale image if max_res limit is specified and base_img exceeds max_res
    if max_res > 0 and (base_img.width > max_res or base_img.height > max_res):
        base_img.thumbnail((max_res, max_res), Image.Resampling.LANCZOS)

    target_w = width or base_img.width
    target_h = height or base_img.height

    # 2. Run BiRefNet segmentation using segment_image_pipeline
    segmentation_result = segment_image_pipeline(
        base_img.convert("RGB"), 
        multisided=multisided, 
        object_white__bg_black=True,
    ).get("object_white__bg_black", "")

    object_data_url = f"data:image/png;base64,{segmentation_result}" if segmentation_result else ""
    image_data_url = image_to_data_url(base_img)

    # 4. Refine mask via refine_mask
    result = refine_mask(
        image_data_url=image_data_url,
        object_data_url=object_data_url,
        width=target_w,
        height=target_h,
        options=options,
    )

    result["mask_data_url"] = object_data_url
    return result


SUPPORTED_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def _get_existing_pngs(dst_path: str) -> set:
    """Recursively scans destination directory using os.scandir and returns set of normalized relative png file paths."""
    existing = set()
    if not os.path.exists(dst_path):
        return existing
    stack = [dst_path]
    while stack:
        current_dir = stack.pop()
        try:
            with os.scandir(current_dir) as entries:
                for entry in entries:
                    if entry.name.startswith("."):
                        continue
                    if entry.is_dir(follow_symlinks=False):
                        stack.append(entry.path)
                    elif entry.is_file(follow_symlinks=False) and entry.name.lower().endswith(".png"):
                        rel_path = os.path.normpath(os.path.relpath(entry.path, dst_path))
                        existing.add(rel_path)
        except OSError:
            pass
    return existing


def process(src: str, dst: str, multisided: bool = False, max_res: int = 0):
    src_path = os.path.abspath(src)
    dst_path = os.path.abspath(dst)
    targets = []

    # 1. Fast indexing using os.scandir and set lookups
    if os.path.isdir(src_path):
        existing_pngs = _get_existing_pngs(dst_path)
        stack = [src_path]
        while stack:
            current_dir = stack.pop()
            try:
                with os.scandir(current_dir) as entries:
                    for entry in entries:
                        name = entry.name
                        if name.startswith("."):
                            continue
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(entry.path)
                        elif entry.is_file(follow_symlinks=False):
                            ext = os.path.splitext(name)[1].lower()
                            if ext in SUPPORTED_EXTS or ext == ".json":
                                rel_dir = os.path.relpath(current_dir, src_path)
                                base_name = os.path.splitext(name)[0]
                                rel_png = os.path.normpath(os.path.join(rel_dir, f"{base_name}.png"))
                                if rel_png not in existing_pngs:
                                    out_base = os.path.normpath(os.path.join(dst, rel_dir, base_name))
                                    targets.append((entry.path, out_base))
            except OSError:
                pass
    elif os.path.isfile(src_path):
        out_base = os.path.splitext(dst)[0] if dst.endswith(SUPPORTED_EXTS) else dst
        png_out = f"{out_base}.png"
        if not os.path.exists(png_out):
            targets.append((src_path, out_base))
    else:
        print(f"Error: Source path {src} does not exist.")
        return

    total = len(targets)
    if total == 0:
        print(f"No pending image files to process in '{src_path}'.")
        return

    print(f"Indexing completed: Found {total} file(s) to process in '{src_path}'.")

    # 2. Pre-load model only if there are pending images requiring segmentation
    needs_model = any(not file_path.endswith(".json") for file_path, _ in targets)
    if needs_model:
        print("Starting segmentation model...")
        get_birefnet_model()

    # 3. Process indexed files sequentially
    batch_start_time = time.time()
    success_count = 0
    failed_count = 0

    for idx, (file_path, out_base_path) in enumerate(targets, 1):
        png_out = f"{out_base_path}.png"
        print(f"[{idx}/{total}] Processing: {file_path} -> {png_out}")
        os.makedirs(os.path.dirname(out_base_path), exist_ok=True)
        img_start_time = time.time()

        try:
            if file_path.endswith(".json"):
                with open(file_path, "r", encoding="utf-8") as f:
                    sidecar_data = json.load(f)
                result_data = refine_mask(
                    image_data_url=sidecar_data,
                    object_data_url=sidecar_data,
                    options={},
                )
            else:
                result_data = detect_and_refine_mask(
                    image_input=file_path,
                    options={},
                    multisided=multisided,
                    max_res=max_res,
                )

            with open(png_out, "wb") as f:
                f.write(result_data["buffer"])

            elapsed = time.time() - img_start_time
            success_count += 1
            print(f"[{idx}/{total}] Completed: {file_path} ({result_data['width']}x{result_data['height']}) in {elapsed:.2f}s")
        except Exception as err:
            elapsed = time.time() - img_start_time
            failed_count += 1
            print(f"[ERROR] Failed to process {file_path} after {elapsed:.2f}s: {err}")

    batch_elapsed = time.time() - batch_start_time
    avg_speed = (batch_elapsed / total) if total > 0 else 0
    print(f"\n[FINISHED] Batch processing completed in {batch_elapsed:.2f}s ({success_count} succeeded, {failed_count} failed, avg {avg_speed:.2f}s/image)")


if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(description="Detect object and refine mask using BiRefNet & vector processing.")

    # Implement batch process for images folder or single file/JSON
    parser.add_argument("--src", type=str, required=True, help="Path to input image file, sidecar JSON, or folder")
    parser.add_argument("--dst", type=str, required=True, help="Destination write path or output folder")
    parser.add_argument("--list", type=str, required=False, default=None, help="Optional legacy list file parameter (ignored)")
    parser.add_argument("--multisided", action="store_true", help="Enable rotational TTA segmentation")
    parser.add_argument("--res", type=int, default=0, help="Max resolution dimension (width/height) to downscale image before segmentation")

    args = parser.parse_args()

    try:
        print("Indexing source folder...")   
        start_time = time.time()
        
        process(args.src, args.dst, multisided=args.multisided, max_res=args.res)
        
        total_time = time.time() - start_time
        print(f"Total execution time: {total_time:.2f}s")
    except Exception as e:
        print(f"Fatal error during processing: {e}")


    