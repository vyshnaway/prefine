"""
Detect package initialization exporting key vision functions and model state.
"""

from detect.birefnet import (
    device,
    models,
    set_dimention,
    segment_image_pipeline,
    verify_cuda,
    get_birefnet_model,
)
from detect.__main__ import process

__all__ = [
    "device",
    "models",
    "set_dimention",
    "segment_image_pipeline",
    "verify_cuda",
    "get_birefnet_model",
    "process",
]
