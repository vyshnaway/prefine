export interface BrushMask {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function createMask(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height);
}

export function createBrushMask(width: number, height: number): BrushMask {
  return { width, height, data: createMask(width, height) };
}

export function applyBrushStroke(
  mask: Uint8ClampedArray,
  x: number,
  y: number,
  radius: number,
  width: number,
  height: number,
  colorTransparent: boolean,
) {
  const size = Math.max(1, Math.round(radius));
  const value = colorTransparent ? 0 : 255;
  const half = size;

  for (let py = -half; py <= half; py += 1) {
    const yy = y + py;
    if (yy < 0 || yy >= height) continue;

    for (let px = -half; px <= half; px += 1) {
      const xx = x + px;
      if (xx < 0 || xx >= width) continue;
      const dist = Math.hypot(px, py);
      if (dist <= size) {
        const index = yy * width + xx;
        mask[index] = value;
      }
    }
  }
}

export function composeMaskedImageData(
  raw: ImageData,
  refined: ImageData,
  mask: Uint8ClampedArray,
): ImageData {
  const output = new ImageData(raw.width, raw.height);

  for (let i = 0; i < raw.data.length; i += 4) {
    const useRaw = mask[i / 4] > 0;
    const source = useRaw ? raw : refined;
    output.data[i] = source.data[i];
    output.data[i + 1] = source.data[i + 1];
    output.data[i + 2] = source.data[i + 2];
    output.data[i + 3] = 255;
  }

  return output;
}

export function getMaskedImageData(
  source: ImageData,
  mask: Uint8ClampedArray,
  brushColor: string,
) {
  const output = new ImageData(source.width, source.height);
  const color = hexToRgb(brushColor);

  for (let i = 0; i < source.data.length; i += 4) {
    const alpha = mask[i / 4] ? 255 : 0;
    output.data[i] = source.data[i];
    output.data[i + 1] = source.data[i + 1];
    output.data[i + 2] = source.data[i + 2];
    output.data[i + 3] = alpha;

    if (alpha > 0) {
      output.data[i] = color[0];
      output.data[i + 1] = color[1];
      output.data[i + 2] = color[2];
      output.data[i + 3] = 255;
    }
  }

  return output;
}

// ----------------------------------------------------------------------
// Hex color parsing
// ----------------------------------------------------------------------
// Single source of truth for hex → RGB parsing. hexToRgbStr is a thin
// formatter on top of hexToRgb rather than a second independent parser
// (previously these two duplicated the shorthand-expansion + parseInt
// logic separately, with slightly different rounding/NaN handling).

export function hexToRgb(hex: string): [number, number, number] {
  let normalized = hex.replace("#", "");
  if (normalized.length === 3 || normalized.length === 4) {
    normalized = normalized
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const num = Number.parseInt(normalized.slice(0, 6), 16);
  if (Number.isNaN(num)) return [255, 255, 255];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function hexToRgbStr(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

// Shared offscreen canvas for pixel operations to avoid canvas allocation overhead
let tempLuminanceCanvas: HTMLCanvasElement | null = null;

export function luminanceToAlphaCanvas(
  sourceCanvas: HTMLCanvasElement,
  invert: boolean = false
): HTMLCanvasElement {
  if (!tempLuminanceCanvas) {
    tempLuminanceCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  }
  const canvas = tempLuminanceCanvas || document.createElement("canvas");
  if (canvas.width !== sourceCanvas.width || canvas.height !== sourceCanvas.height) {
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return sourceCanvas;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data32 = new Uint32Array(imgData.data.buffer);
  const len = data32.length;

  // Faster 32-bit pixel operations in little-endian (ABGR: [R, G, B, A])
  for (let i = 0; i < len; i++) {
    const pixel = data32[i];
    const r = pixel & 0xff;
    const g = (pixel >> 8) & 0xff;
    const b = (pixel >> 16) & 0xff;
    let lum = ((r * 13932 + g * 46871 + b * 4733) >> 16) & 0xff; // Fast fixed-point 0.2126*R + 0.7152*G + 0.0722*B
    if (invert) lum = 255 - lum;

    // Output is white (RGB 255,255,255) with alpha = lum:
    // (lum << 24) | 0x00ffffff
    data32[i] = (lum << 24) | 0x00ffffff;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

let tempInvertCanvas: HTMLCanvasElement | null = null;

export function invertImage(objectImg: HTMLCanvasElement | null): HTMLCanvasElement {
  if (!objectImg || objectImg.width === 0 || objectImg.height === 0) {
    return objectImg || (typeof document !== "undefined" ? document.createElement("canvas") : (null as unknown as HTMLCanvasElement));
  }

  if (!tempInvertCanvas) {
    tempInvertCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  }
  const canvas = tempInvertCanvas || document.createElement("canvas");
  const width = objectImg.width;
  const height = objectImg.height;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return objectImg;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(objectImg, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data32 = new Uint32Array(imageData.data.buffer);
  const len = data32.length;

  // Invert RGB channels while preserving Alpha
  for (let i = 0; i < len; i++) {
    const p = data32[i];
    // Invert R, G, B bytes: (255 - R) | (255 - G)<<8 | (255 - B)<<16 | A<<24
    data32[i] = (p & 0xff000000) | ((~p) & 0x00ffffff);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// ----------------------------------------------------------------------
// Canvas brush/fill drawing
// ----------------------------------------------------------------------
// Moved here from PreviewWorkspace/canvas.ts's useCanvasRender, which had
// its own inline drawBrushStroke/fillShape doing the same canvas-2D
// paint-or-erase compositing. Centralizing them here means there's one
// implementation of "how a stroke/fill gets composited onto a layer
// canvas" instead of it living duplicated inside the render hook.

export interface BrushPaintOptions {
  brushColor: string;
  brushOpacity: number;
  isErase: boolean;
}

/** Strokes a round-capped line from `from` to `to` onto `targetCanvas`, either painting with brushColor/brushOpacity or erasing (destination-out). */
// ----------------------------------------------------------------------
// Canvas brush/fill drawing
// ----------------------------------------------------------------------
// Soft-edged round brush. hardness (0-1) controls where the radial
// gradient's alpha starts tapering off: 1 = solid disc all the way to
// the edge, 0 = alpha falls off from the very center. The same stamp is
// used for both paint (source-over) and erase (destination-out), so
// hardness and opacity behave identically for both tools — previously
// erase always used a flat, fully-opaque, hard-edged stroke/fill and
// ignored brushOpacity/brushHardness entirely.

export interface BrushPaintOptions {
  brushColor: string;
  brushOpacity: number;
  /** 0 = fully soft falloff from center, 1 = crisp disc edge. */
  brushHardness: number;
  isErase: boolean;
}

// Stamps are cheap to build but rebuilding one per pointermove would add
// up; cache by the values that actually change its pixels.
const brushStampCache = new Map<string, HTMLCanvasElement>();

function getBrushStamp(
  diameter: number,
  hardness: number,
  color: string,
  isErase: boolean,
): HTMLCanvasElement {
  const size = Math.max(2, Math.round(diameter));
  const clampedHardness = Math.min(1, Math.max(0, hardness));
  // Erase stamps only ever need their alpha channel (destination-out
  // ignores source color), so they can share one cache entry regardless
  // of the current brushColor.
  const key = `${size}:${clampedHardness.toFixed(3)}:${isErase ? "erase" : color}`;
  const cached = brushStampCache.get(key);
  if (cached) return cached;

  const stamp = document.createElement("canvas");
  stamp.width = size;
  stamp.height = size;
  const ctx = stamp.getContext("2d");
  if (!ctx) return stamp;

  const radius = size / 2;
  const rgb = isErase ? "255, 255, 255" : hexToRgbStr(color);
  // innerStop: fraction of the radius that stays fully opaque before
  // tapering to transparent at the edge. hardness=1 keeps this at ~0.99
  // (essentially a hard disc); hardness=0 puts it at 0 (taper starts
  // immediately from the center).
  const innerStop = Math.min(0.99, clampedHardness);

  const gradient = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  gradient.addColorStop(0, `rgba(${rgb}, 1)`);
  gradient.addColorStop(innerStop, `rgba(${rgb}, 1)`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.fill();

  brushStampCache.set(key, stamp);
  return stamp;
}


export function getThresholdedMask(src: HTMLCanvasElement, threshold: number): HTMLCanvasElement {
  let out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;

  const octx = out.getContext("2d");
  if (!octx) return src;

  octx.clearRect(0, 0, out.width, out.height);
  octx.drawImage(src, 0, 0);

  const imgData = octx.getImageData(0, 0, out.width, out.height);
  const data = imgData.data;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] >= threshold ? 255 : 0;
  }
  octx.putImageData(imgData, 0, 0);

  return out;
}
export interface BrushPaintOptions {
  brushColor: string;
  brushOpacity: number;
  /** 0 = fully soft edge falloff, 1 = crisp hard edge. */
  brushHardness: number;
  isErase: boolean;
  eraseToBlack?: boolean;
}

// Hardness -> blur radius mapping. hardness=1 disables blur entirely
// (crisp edge, and cheaper — no filter pass); hardness=0 gives the
// softest edge. Scaled relative to brushSize so the falloff feels
// proportional at any brush scale rather than a fixed pixel blur.
function getEdgeBlurPx(brushHardness: number, brushSize: number): number {
  const clamped = Math.min(1, Math.max(0, brushHardness));
  const MAX_BLUR_RATIO = 0.35; // fraction of brushSize, at hardness = 0
  return (1 - clamped) * brushSize * MAX_BLUR_RATIO;
}

/**
 * Strokes a round-capped line from `from` to `to` onto `targetCanvas`,
 * either painting with brushColor/brushOpacity or erasing
 * (destination-out). brushOpacity and brushHardness (edge softness) are
 * applied identically for both paint and erase — previously erase always
 * drew at full opacity with a hard edge, ignoring both settings.
 */
export function drawBrushStrokeOnCanvas(
  targetCanvas: HTMLCanvasElement | null,
  from: { x: number; y: number },
  to: { x: number; y: number },
  brushSize: number,
  options: BrushPaintOptions,
) {
  if (!targetCanvas) return;
  const { brushColor, brushOpacity, brushHardness, isErase, eraseToBlack } = options;

  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;

  const blurPx = getEdgeBlurPx(brushHardness, brushSize);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = brushSize;
  ctx.globalAlpha = brushOpacity;
  if (blurPx > 0.01) {
    ctx.filter = `blur(${blurPx}px)`;
  }

  if (isErase) {
    if (eraseToBlack) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#000000";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    }
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = brushColor;
  }

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Fills a closed polygon (lasso/polygon tool result) onto `targetCanvas`,
 * either painting or erasing (destination-out). Requires at least 3
 * points. brushOpacity and brushHardness (edge softness) apply the same
 * way as the brush stroke above.
 */
export function fillBrushShapeOnCanvas(
  targetCanvas: HTMLCanvasElement | null,
  points: { x: number; y: number }[],
  options: BrushPaintOptions,
  brushSize: number = 32,
) {
  if (!targetCanvas || points.length < 3) return;
  const { brushColor, brushOpacity, brushHardness, isErase } = options;

  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;

  const blurPx = getEdgeBlurPx(brushHardness, brushSize);

  ctx.save();
  ctx.globalAlpha = brushOpacity;
  if (blurPx > 0.01) {
    ctx.filter = `blur(${blurPx}px)`;
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();

  if (isErase) {
    if (options.eraseToBlack) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000000";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,1)";
    }
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = brushColor;
  }

  ctx.fill();
  ctx.restore();
}

/**
 * Calculates a smooth Cardinal / Catmull-Rom spline curve passing through an array of 2D points.
 */
export function getCardinalSplinePoints(
  points: { x: number; y: number }[],
  tension: number = 0.5,
  isClosed: boolean = true,
  numOfSegments: number = 16
): { x: number; y: number }[] {
  if (points.length < 2) return points;
  if (points.length === 2) return points;

  const pts: number[] = [];
  points.forEach((p) => pts.push(p.x, p.y));

  const res: { x: number; y: number }[] = [];
  const _pts = pts.slice(0);

  if (isClosed) {
    _pts.unshift(pts[pts.length - 1]);
    _pts.unshift(pts[pts.length - 2]);
    _pts.push(pts[0]);
    _pts.push(pts[1]);
    _pts.push(pts[2]);
    _pts.push(pts[3]);
  } else {
    _pts.unshift(pts[1]);
    _pts.unshift(pts[0]);
    _pts.push(pts[pts.length - 2]);
    _pts.push(pts[pts.length - 1]);
  }

  const c = tension;

  for (let i = 2; i < _pts.length - 4; i += 2) {
    const x0 = _pts[i - 2], y0 = _pts[i - 1];
    const x1 = _pts[i],     y1 = _pts[i + 1];
    const x2 = _pts[i + 2], y2 = _pts[i + 3];
    const x3 = _pts[i + 4], y3 = _pts[i + 5];

    for (let t = 0; t <= numOfSegments; t++) {
      const st = t / numOfSegments;
      const st2 = st * st;
      const st3 = st2 * st;

      const h1 = 2 * st3 - 3 * st2 + 1;
      const h2 = -2 * st3 + 3 * st2;
      const h3 = st3 - 2 * st2 + st;
      const h4 = st3 - st2;

      const t1x = (x2 - x0) * c * 0.5;
      const t1y = (y2 - y0) * c * 0.5;
      const t2x = (x3 - x1) * c * 0.5;
      const t2y = (y3 - y1) * c * 0.5;

      const px = h1 * x1 + h2 * x2 + h3 * t1x + h4 * t2x;
      const py = h1 * y1 + h2 * y2 + h3 * t1y + h4 * t2y;

      res.push({ x: px, y: py });
    }
  }

  return res;
}