"""
Default configuration constants for refine_mask options in detect module.
"""

ENABLE_VECTORIZATION = True

DEFAULT_OPTIONS = {
    "thresholdValue": 128,
    "thresholdValueEnabled": True,
    "traceMinBlobPixels": 64,
    "traceMinBlobPixelsEnabled": True,
    "simplifyEpsilon": 0.8,
    "simplifyEpsilonEnabled": True,
    "smoothIterations": 2,
    "smoothIterationsEnabled": True,
    "contourOffset": -1,
    "contourOffsetEnabled": True,
    "featherEnabled": True,
    "feather": 0.5,
}
