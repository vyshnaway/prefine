

import os
import io
import base64
import time
import numpy as np

from PIL import Image, ImageOps

# pyrefly: ignore [missing-import]
import torch
# pyrefly: ignore [missing-import]
from torchvision import transforms
# pyrefly: ignore [missing-import]
from transformers import AutoModelForImageSegmentation

_PATCH_MULTIPLE = 32

models = {}
height, width = 0, 0
rmbg_transform = None


# Detect and verify CUDA availability before importing SAM 2
device = None
def verify_cuda():
    device = "cuda" if (torch.cuda.is_available() and os.getenv("FORCE_CPU") != "1") else "cpu"
    
    if device == "cuda":
        try:
            _ = torch.zeros(1, device="cuda")
        except Exception as err:
            print(f"CUDA device unavailable ({err}). Falling back to CPU mode.")
            os.environ["CUDA_VISIBLE_DEVICES"] = ""
            device = "cpu"



def _round_up_to_multiple(value: int, multiple: int) -> int:
    return ((value + multiple - 1) // multiple) * multiple

def get_available_hardware_memory_mb() -> float:
    """
    Returns the currently available memory in Megabytes (MB).
    Uses GPU VRAM for CUDA or system RAM for CPU.
    """
    try:
        if device == "cuda":
            free_mem, _ = torch.cuda.mem_get_info()
            return free_mem / (1024 * 1024)
    except Exception:
        pass

    try:
        import psutil
        return psutil.virtual_memory().available / (1024 * 1024)
    except Exception:
        # Fallback to standard 4GB estimate if psutil is unavailable
        return 4096.0

def compute_hardware_constrained_dimensions(
    orig_h: int, 
    orig_w: int, 
    safety_ratio: float = 0.60,
    min_dim: int = 128,
    hard_max_dim: int = 4096
) -> tuple[int, int]:
    """
    Computes the maximum image resolution that safely fits within 60% of the available
    hardware memory space, preserving the original aspect ratio.
    """
    avail_mb = get_available_hardware_memory_mb()
    safe_budget_mb = avail_mb * safety_ratio

    # Memory per pixel estimate for BiRefNet multi-layer forward activations (~1200 bytes/pixel in float32)
    # Plus model weights base memory (~200MB)
    effective_mb = max(safe_budget_mb - 200.0, 100.0)
    bytes_per_pixel = 1200.0
    max_pixels = (effective_mb * 1024.0 * 1024.0) / bytes_per_pixel

    aspect_ratio = orig_w / max(orig_h, 1)

    # Max height/width from pixel budget
    max_h = int((max_pixels / max(aspect_ratio, 0.01)) ** 0.5)
    max_w = int(max_h * aspect_ratio)

    target_h = min(orig_h, max_h, hard_max_dim)
    target_w = min(orig_w, max_w, hard_max_dim)

    final_h = _round_up_to_multiple(max(target_h, min_dim), _PATCH_MULTIPLE)
    final_w = _round_up_to_multiple(max(target_w, min_dim), _PATCH_MULTIPLE)

    return final_h, final_w

# Preprocessing transform for RMBG-2.0 / BiRefNet
def set_dimention(h: int, w: int, safety_ratio: float = 0.60):
    global height, width, rmbg_transform
    new_h, new_w = compute_hardware_constrained_dimensions(h, w, safety_ratio=safety_ratio)
    if height != new_h or width != new_w:
        height, width = new_h, new_w
        rmbg_transform = transforms.Compose([
            transforms.Resize((height, width), interpolation=Image.Resampling.BILINEAR),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])




# ---------------------------------------------------------------------- #
# 4-way rotational test-time augmentation (TTA)
# ---------------------------------------------------------------------- #

_TTA_FORWARD_TRANSPOSE = {
    0: None,
    90: Image.Transpose.ROTATE_90,
    180: Image.Transpose.ROTATE_180,
    270: Image.Transpose.ROTATE_270,
}

_TTA_BACKWARD_TRANSPOSE = {
    0: None,
    90: Image.Transpose.ROTATE_270,
    180: Image.Transpose.ROTATE_180,
    270: Image.Transpose.ROTATE_90,
}


def _infer_mask_tensor(pil_img: Image.Image, model) -> torch.Tensor:
    """Helper to run single-pass forward inference."""
    if pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")
    input_tensor = rmbg_transform(pil_img).unsqueeze(0).to(device)
    with torch.no_grad():
        output = model(input_tensor)
        if isinstance(output, (list, tuple)):
            preds = output[-1].sigmoid().cpu()
        elif isinstance(output, dict):
            pred_tensor = output.get("logits", output.get("pred", None))
            if pred_tensor is None:
                pred_tensor = list(output.values())[-1]
            preds = pred_tensor.sigmoid().cpu()
        else:
            preds = output.sigmoid().cpu()
        return preds[0].squeeze()


def run_tta_segmentation(pil_img: Image.Image, model, multisided: bool = False) -> Image.Image:
    orig_w, orig_h = pil_img.size
    
    # 1-pass (Single direction, 0 deg)
    if not multisided:
        pred_mask = _infer_mask_tensor(pil_img, model)
        mask_pil = transforms.ToPILImage()(pred_mask).resize(
            (orig_w, orig_h), Image.Resampling.BILINEAR
        )
        return mask_pil

    # 4-pass TTA (0, 90, 180, 270 deg)
    aligned_masks = []
    angles = (0, 90, 180, 270)
    
    for angle in angles:
        forward_op = _TTA_FORWARD_TRANSPOSE[angle]
        rotated_img = pil_img.transpose(forward_op) if forward_op is not None else pil_img
        rw, rh = rotated_img.size

        pred_mask = _infer_mask_tensor(rotated_img, model)

        # Resize prediction back up to rotated image dimensions
        mask_rot = transforms.ToPILImage()(pred_mask).resize(
            (rw, rh), Image.Resampling.BILINEAR
        )

        # Undo rotation
        backward_op = _TTA_BACKWARD_TRANSPOSE[angle]
        if backward_op is not None:
            mask_rot = mask_rot.transpose(backward_op)

        if mask_rot.size != (orig_w, orig_h):
            mask_rot = mask_rot.resize((orig_w, orig_h), Image.Resampling.BILINEAR)

        aligned_masks.append(np.asarray(mask_rot, dtype=np.float32))

    # Stack along axis 0 -> Shape: (4, orig_h, orig_w)
    stacked_masks = np.stack(aligned_masks, axis=0)
    sorted_masks = np.sort(stacked_masks, axis=0)

    # Calculate Top-3 mean and Top-2 mean across the 4 predictions
    top3_avg = sorted_masks[1:].mean(axis=0)
    top2_avg = sorted_masks[2:].mean(axis=0)

    fallback_condition = top3_avg < sorted_masks[2]
    final_avg = np.where(fallback_condition, top2_avg, top3_avg)

    mask_avg = np.clip(final_avg, 0, 255).astype(np.uint8)
    return Image.fromarray(mask_avg, mode="L")


# Lazy-load BiRefNet model into memory on first request
def get_birefnet_model():
    """Lazy load BiRefNet model into memory on first request."""
    if "birefnet" not in models:
        print("Loading BiRefNet on-demand...")
        models["birefnet"] = AutoModelForImageSegmentation.from_pretrained(
            "ZhengPeng7/BiRefNet", 
            trust_remote_code=True
        ).to(device).float().eval()
    return models["birefnet"]



def pil_to_base64(img: Image.Image, format: str = "PNG") -> str:
    """Helper to convert PIL Image to pure base64 string (no Data URL prefix)."""
    buffer = io.BytesIO()
    img.save(buffer, format=format)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def segment_image_pipeline(
    pil_img: Image.Image,
    multisided: bool = False,
    object_raw__bg_white: bool = False,
    object_raw__bg_black: bool = False,
    object_raw__bg_transparent: bool = False,
    object_white__bg_raw: bool = False,
    object_white__bg_black: bool = False,
    object_white__bg_transparent: bool = False,
    object_black__bg_raw: bool = False,
    object_black__bg_white: bool = False,
    object_black__bg_transparent: bool = False,
    object_transparent__bg_raw: bool = False,
    object_transparent__bg_white: bool = False,
    object_transparent__bg_black: bool = False,
) -> dict:
    """
    Runs segmentation on a PIL Image and generates all requested composited image modes.
    """
    start_time = time.time()
    orig_w, orig_h = pil_img.size
    set_dimention(orig_h, orig_w)

    model = get_birefnet_model()

    # Run inference (single or 4-way TTA)
    mask_pil = run_tta_segmentation(pil_img, model, multisided=multisided)

    # Inverted mask (background = 255, object = 0)
    inv_mask_pil = ImageOps.invert(mask_pil)

    # Convert original image to RGBA for compositing
    img_rgba = pil_img.convert("RGBA")

    response_data = {"status": "success", "duration": time.time() - start_time}

    # --- OBJECT RAW (original colors) ---
    if object_raw__bg_white:
        bg = Image.new("RGBA", (orig_w, orig_h), (255, 255, 255, 255))
        obj = img_rgba.copy()
        obj.putalpha(mask_pil)
        result = Image.alpha_composite(bg, obj)
        response_data["object_raw__bg_white"] = pil_to_base64(result.convert("RGB"))

    if object_raw__bg_black:
        bg = Image.new("RGBA", (orig_w, orig_h), (0, 0, 0, 255))
        obj = img_rgba.copy()
        obj.putalpha(mask_pil)
        result = Image.alpha_composite(bg, obj)
        response_data["object_raw__bg_black"] = pil_to_base64(result.convert("RGB"))

    if object_raw__bg_transparent:
        obj = img_rgba.copy()
        obj.putalpha(mask_pil)
        response_data["object_raw__bg_transparent"] = pil_to_base64(obj)

    # --- OBJECT WHITE ---
    if object_white__bg_raw:
        white_obj = Image.new("RGBA", (orig_w, orig_h), (255, 255, 255, 255))
        result = Image.composite(white_obj, img_rgba, mask_pil)
        response_data["object_white__bg_raw"] = pil_to_base64(result.convert("RGB"))

    if object_white__bg_black:
        bg = Image.new("RGBA", (orig_w, orig_h), (0, 0, 0, 255))
        white_obj = Image.new("RGBA", (orig_w, orig_h), (255, 255, 255, 255))
        white_obj.putalpha(mask_pil)
        result = Image.alpha_composite(bg, white_obj)
        response_data["object_white__bg_black"] = pil_to_base64(result.convert("RGB"))

    if object_white__bg_transparent:
        white_obj = Image.new("RGBA", (orig_w, orig_h), (255, 255, 255, 255))
        white_obj.putalpha(mask_pil)
        response_data["object_white__bg_transparent"] = pil_to_base64(white_obj)

    # --- OBJECT BLACK ---
    if object_black__bg_raw:
        black_obj = Image.new("RGBA", (orig_w, orig_h), (0, 0, 0, 255))
        black_obj.putalpha(mask_pil)
        result = Image.alpha_composite(img_rgba, black_obj)
        response_data["object_black__bg_raw"] = pil_to_base64(result.convert("RGB"))

    if object_black__bg_white:
        bg = Image.new("RGBA", (orig_w, orig_h), (255, 255, 255, 255))
        black_obj = Image.new("RGBA", (orig_w, orig_h), (0, 0, 0, 255))
        black_obj.putalpha(mask_pil)
        result = Image.alpha_composite(bg, black_obj)
        response_data["object_black__bg_white"] = pil_to_base64(result.convert("RGB"))

    if object_black__bg_transparent:
        black_obj = Image.new("RGBA", (orig_w, orig_h), (0, 0, 0, 255))
        black_obj.putalpha(mask_pil)
        response_data["object_black__bg_transparent"] = pil_to_base64(black_obj)

    # --- OBJECT TRANSPARENT (hole/cutout) ---
    if object_transparent__bg_raw:
        result = Image.composite(img_rgba, Image.new("RGBA", (orig_w, orig_h), (0, 0, 0, 0)), inv_mask_pil)
        response_data["object_transparent__bg_raw"] = pil_to_base64(result.convert("RGB"))

    if object_transparent__bg_white:
        bg = Image.new("RGBA", (orig_w, orig_h), (255, 255, 255, 255))
        result = Image.composite(bg, Image.new("RGBA", (orig_w, orig_h), (0, 0, 0, 0)), inv_mask_pil)
        response_data["object_transparent__bg_white"] = pil_to_base64(result.convert("RGB"))

    if object_transparent__bg_black:
        bg = Image.new("RGBA", (orig_w, orig_h), (0, 0, 0, 255))
        result = Image.composite(bg, Image.new("RGBA", (orig_w, orig_h), (0, 0, 0, 0)), inv_mask_pil)
        response_data["object_transparent__bg_black"] = pil_to_base64(result.convert("RGB"))

    return response_data


