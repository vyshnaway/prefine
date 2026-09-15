import * as MarchingSquares from "marchingsquares";
import simplifyPoints from "simplify-js";
import chaikinSmooth from "chaikin-smooth";

export interface DrawVectorMaskOptions {
    fillInColor?: string;
    fillOutColor?: string;
    lineWidth?: number;
    offsetDistance?: number;
    featherRadius?: number;
}

export interface VectorMaskPipelineOptions {
    threshold?: false | null | { enabled?: boolean; value?: number; };
    trace?: false | null | { enabled?: boolean; minBlobPixels?: number };
    offset?: false | null | { enabled?: boolean; distance?: number };
    simplify?: false | null | { enabled?: boolean; epsilon?: number };
    smooth?: false | null | { enabled?: boolean; iterations?: number };
    feather?: false | null | { enabled?: boolean; radius?: number };
    drawoptions?: DrawVectorMaskOptions;
};

interface Point { x: number; y: number; }

/** Fast luminance grid generation from a raw RGBA buffer (Node.js & Canvas compatible) */
export function rawBufferToLuminanceGrid(rawBuffer: Buffer | Uint8ClampedArray | Uint8Array, width: number, height: number): number[][] {
    const grid: number[][] = new Array(height);
    for (let y = 0; y < height; y++) {
        const row = new Array<number>(width);
        const rowOffset = y * width * 4;
        for (let x = 0; x < width; x++) {
            const pxIdx = rowOffset + (x * 4);
            const r = rawBuffer[pxIdx];
            const g = rawBuffer[pxIdx + 1];
            const b = rawBuffer[pxIdx + 2];
            row[x] = (r * 19595 + g * 38469 + b * 7472) >> 16;
        }
        grid[y] = row;
    }
    return grid;
}

/** Fast luminance from RGB using 32-bit pixel grid */
function canvasToLuminanceGrid(canvas: HTMLCanvasElement): number[][] {
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const { width, height } = canvas;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data32 = new Uint32Array(imgData.data.buffer);

    const grid: number[][] = new Array(height);
    for (let y = 0; y < height; y++) {
        const row = new Array<number>(width);
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
            const pixel = data32[rowOffset + x];
            const r = pixel & 0xff;
            const g = (pixel >> 8) & 0xff;
            const b = (pixel >> 16) & 0xff;
            row[x] = (r * 19595 + g * 38469 + b * 7472) >> 16;
        }
        grid[y] = row;
    }
    return grid;
}

let tempThresholdCanvas: HTMLCanvasElement | null = null;

/** Binarizes a mask's luminance at `threshold` (0-255) into a flat black/white canvas. */
export function getThresholdedMask(sourceCanvas: HTMLCanvasElement, threshold: number): HTMLCanvasElement {
    const { width, height } = sourceCanvas;
    const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true })!;
    const srcData = srcCtx.getImageData(0, 0, width, height);
    const srcData32 = new Uint32Array(srcData.data.buffer);

    if (!tempThresholdCanvas) {
        tempThresholdCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    }
    const outCanvas = tempThresholdCanvas || document.createElement("canvas");
    if (outCanvas.width !== width || outCanvas.height !== height) {
        outCanvas.width = width;
        outCanvas.height = height;
    }
    const outCtx = outCanvas.getContext("2d", { willReadFrequently: true })!;
    const outData = outCtx.createImageData(width, height);
    const outData32 = new Uint32Array(outData.data.buffer);
    const len = srcData32.length;

    for (let i = 0; i < len; i++) {
        const pixel = srcData32[i];
        const r = pixel & 0xff;
        const g = (pixel >> 8) & 0xff;
        const b = (pixel >> 16) & 0xff;
        const lum = (r * 19595 + g * 38469 + b * 7472) >> 16;
        outData32[i] = lum >= threshold ? 0xffffffff : 0xff000000;
    }
    outCtx.putImageData(outData, 0, 0);
    return outCanvas;
}

/** Thresholds a raw RGBA buffer into a binarized RGBA buffer (0 or 255 luminance) */
export function thresholdRawBuffer(rawBuffer: Buffer, width: number, height: number, threshold: number): Buffer {
    const totalPixels = width * height;
    const outBuffer = Buffer.alloc(totalPixels * 4);

    for (let i = 0; i < totalPixels; i++) {
        const srcIdx = i * 4;
        const r = rawBuffer[srcIdx];
        const g = rawBuffer[srcIdx + 1];
        const b = rawBuffer[srcIdx + 2];
        const lum = (r * 19595 + g * 38469 + b * 7472) >> 16;
        const val = lum >= threshold ? 255 : 0;

        outBuffer[srcIdx] = val;
        outBuffer[srcIdx + 1] = val;
        outBuffer[srcIdx + 2] = val;
        outBuffer[srcIdx + 3] = 255;
    }
    return outBuffer;
}


function polygonArea(points: Point[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const { x: x1, y: y1 } = points[i];
        const { x: x2, y: y2 } = points[(i + 1) % points.length];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area / 2);
}

export function traceRawBufferContours(
    rawBuffer: Buffer | Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    thresholdLevel: number,
    minBlobPixels: number
): Point[][] {
    const grid = rawBufferToLuminanceGrid(rawBuffer, width, height);
    const rawRings = MarchingSquares.isoContours(grid, thresholdLevel) as number[][][];

    return rawRings
        .map((ring) => ring.map(([x, y]) => ({ x, y })))
        .filter((ring) => ring.length >= 3 && polygonArea(ring) >= minBlobPixels);
}

function traceMaskContours(
    sourceCanvas: HTMLCanvasElement,
    thresholdLevel: number,
    minBlobPixels: number
): Point[][] {
    const grid = canvasToLuminanceGrid(sourceCanvas);
    const rawRings = MarchingSquares.isoContours(grid, thresholdLevel) as number[][][];

    return rawRings
        .map((ring) => ring.map(([x, y]) => ({ x, y })))
        .filter((ring) => ring.length >= 3 && polygonArea(ring) >= minBlobPixels);
}

export function simplifyPath(points: Point[], epsilon: number): Point[] {
    if (points.length < 3) return points;
    return simplifyPoints(points, epsilon, true);
}

export function smoothPath(points: Point[], iterations: number): Point[] {
    if (points.length < 3 || iterations <= 0) return points;
    const clampedIterations = Math.min(Math.floor(iterations), 6);
    let pts: number[][] = points.map((p) => [p.x, p.y]);
    for (let i = 0; i < clampedIterations; i++) {
        pts = chaikinSmooth(pts);
    }
    return pts.map(([x, y]) => ({ x, y }));
}

export function contoursToSvgMask(
    contours: Point[][],
    width: number,
    height: number,
    options: {
        fillInColor?: string;
        fillOutColor?: string;
        lineWidth?: number;
        offsetDistance?: number;
    } = {}
): string {
    const {
        fillInColor = "#000000",
        fillOutColor = "#ffffff",
        lineWidth = 0,
        offsetDistance = 0,
    } = options;

    const pathData = contours
        .filter((ring) => ring.length >= 3)
        .map((ring) => {
            const first = ring[0];
            const rest = ring.slice(1).map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
            return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)} ${rest} Z`;
        })
        .join(" ");

    let strokeAttr = "";
    if (offsetDistance > 0.01) {
        strokeAttr = `stroke="${fillInColor}" stroke-width="${(offsetDistance * 2).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"`;
    } else if (lineWidth > 0) {
        strokeAttr = `stroke="${fillInColor}" stroke-width="${lineWidth.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${fillOutColor}" />
  <path d="${pathData}" fill="${fillInColor}" fill-rule="evenodd" ${strokeAttr} />
</svg>`;
}


function drawVectorMask(
    ctx: CanvasRenderingContext2D,
    contours: Point[][],
    options: DrawVectorMaskOptions = {}
) {
    const {
        fillInColor = "#ffffff",
        fillOutColor = "#000000",
        lineWidth = 0,
        offsetDistance = 0,
        featherRadius = 0,
    } = options;
    const { width, height } = ctx.canvas;

    ctx.save();
    ctx.fillStyle = fillOutColor;
    ctx.fillRect(0, 0, width, height);

    if (featherRadius > 0.01) {
        ctx.filter = `blur(${featherRadius}px)`;
    }

    if (offsetDistance < -0.01) {
        // Inward shrink / erosion:
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext("2d")!;

        tempCtx.fillStyle = fillInColor;
        tempCtx.fillRect(0, 0, width, height);

        tempCtx.globalCompositeOperation = "destination-out";
        tempCtx.beginPath();
        for (const ring of contours) {
            if (ring.length < 3) continue;
            tempCtx.moveTo(ring[0].x, ring[0].y);
            for (let i = 1; i < ring.length; i++) tempCtx.lineTo(ring[i].x, ring[i].y);
            tempCtx.closePath();
        }
        tempCtx.fill("evenodd");

        const strokeW = Math.abs(offsetDistance) * 2;
        tempCtx.globalCompositeOperation = "source-over";
        tempCtx.fillStyle = fillInColor;
        tempCtx.strokeStyle = fillInColor;
        tempCtx.lineWidth = strokeW;
        tempCtx.lineJoin = "round";
        tempCtx.lineCap = "round";
        for (const ring of contours) {
            if (ring.length < 2) continue;
            tempCtx.beginPath();
            tempCtx.moveTo(ring[0].x, ring[0].y);
            for (let i = 1; i < ring.length; i++) tempCtx.lineTo(ring[i].x, ring[i].y);
            tempCtx.closePath();
            tempCtx.stroke();
        }

        ctx.fillStyle = fillInColor;
        ctx.beginPath();
        for (const ring of contours) {
            if (ring.length < 3) continue;
            ctx.moveTo(ring[0].x, ring[0].y);
            for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
            ctx.closePath();
        }
        ctx.fill("evenodd");

        ctx.globalCompositeOperation = "destination-out";
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = fillOutColor;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = "source-over";
    } else {
        // Outward expansion or normal fill:
        ctx.fillStyle = fillInColor;
        ctx.beginPath();
        for (const ring of contours) {
            if (ring.length < 3) continue;
            ctx.moveTo(ring[0].x, ring[0].y);
            for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
            ctx.closePath();
        }
        ctx.fill("evenodd");

        if (offsetDistance > 0.01) {
            ctx.strokeStyle = fillInColor;
            ctx.lineWidth = offsetDistance * 2;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            for (const ring of contours) {
                if (ring.length < 2) continue;
                ctx.beginPath();
                ctx.moveTo(ring[0].x, ring[0].y);
                for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
                ctx.closePath();
                ctx.stroke();
            }
        }
    }

    if (lineWidth > 0 && Math.abs(offsetDistance) < 0.01) {
        ctx.strokeStyle = fillInColor;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (const ring of contours) {
            if (ring.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(ring[0].x, ring[0].y);
            for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i].x, ring[i].y);
            ctx.closePath();
            ctx.stroke();
        }
    }

    ctx.restore();
}

export function processVectorMask(
    sourceCanvas: HTMLCanvasElement,
    pipeline: VectorMaskPipelineOptions = {}
) {
    const resultCanvas = document.createElement("canvas");
    resultCanvas.width = sourceCanvas.width;
    resultCanvas.height = sourceCanvas.height;

    const thresholdCfg = typeof pipeline.threshold === "object" && pipeline.threshold !== null ? pipeline.threshold : {};
    const traceCfg = typeof pipeline.trace === "object" && pipeline.trace !== null ? pipeline.trace : {};
    const offsetCfg = typeof pipeline.offset === "object" && pipeline.offset !== null ? pipeline.offset : {};
    const simplifyCfg = typeof pipeline.simplify === "object" && pipeline.simplify !== null ? pipeline.simplify : {};
    const smoothCfg = typeof pipeline.smooth === "object" && pipeline.smooth !== null ? pipeline.smooth : {};
    const featherCfg = typeof pipeline.feather === "object" && pipeline.feather !== null ? pipeline.feather : {};
    const drawoptions = { ...pipeline.drawoptions };

    // 0. Threshold Stage
    const thresholdLevel = thresholdCfg.value ?? 128;
    const thresholdEnabled =
        pipeline.threshold !== false &&
        pipeline.threshold !== null &&
        (thresholdCfg.enabled ?? true) &&
        thresholdLevel > 0;

    // 1. Trace Stage
    const minBlobPixels = traceCfg.minBlobPixels ?? 0;
    const traceEnabled =
        pipeline.trace !== false &&
        pipeline.trace !== null &&
        (traceCfg.enabled ?? true) &&
        minBlobPixels >= 0;

    // 2. Simplify Stage
    const epsilon = simplifyCfg.epsilon ?? 1.5;
    const simplifyEnabled =
        pipeline.simplify !== false &&
        pipeline.simplify !== null &&
        (simplifyCfg.enabled ?? true) &&
        epsilon > 0;

    // 3. Smooth Stage
    const iterations = smoothCfg.iterations ?? 2;
    const smoothEnabled =
        Boolean(pipeline.smooth) &&
        (smoothCfg.enabled ?? true) &&
        iterations > 0;

    // 4. Offset Stage
    const offsetDistance = offsetCfg.distance ?? 0;
    const offsetEnabled =
        Boolean(pipeline.offset) &&
        (offsetCfg.enabled ?? true) &&
        Math.abs(offsetDistance) > 0.01;

    if (offsetEnabled) {
        drawoptions.offsetDistance = offsetDistance;
    }

    // 5. Feather Stage
    const featherRadius = featherCfg.radius ?? 0;
    const featherEnabled =
        Boolean(pipeline.feather) &&
        (featherCfg.enabled ?? true) &&
        featherRadius > 0;

    if (featherEnabled) {
        drawoptions.featherRadius = featherRadius;
    }

    const ranStages = {
        trace: traceEnabled,
        simplify: false,
        smooth: false,
        offset: offsetEnabled,
        feather: featherEnabled,
    };

    if (thresholdEnabled) {
        if (!traceEnabled) {
            const thresholdCanvas = getThresholdedMask(sourceCanvas, thresholdLevel);
            return { contours: [], ranStages, resultCanvas: thresholdCanvas };
        }

        let contours = traceMaskContours(sourceCanvas, thresholdLevel, minBlobPixels);

        if (simplifyEnabled) {
            contours = contours.map((c) => simplifyPath(c, epsilon));
            ranStages.simplify = true;
        }

        if (smoothEnabled) {
            contours = contours.map((c) => smoothPath(c, iterations));
            ranStages.smooth = true;
        }

        drawVectorMask(resultCanvas.getContext("2d")!, contours, drawoptions);

        return { contours, ranStages, resultCanvas };
    }

    return { contours: [], ranStages, resultCanvas: sourceCanvas };
}