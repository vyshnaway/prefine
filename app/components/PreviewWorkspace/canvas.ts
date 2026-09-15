import { useState, useRef, useEffect, useCallback } from "react";
import { ImgData, ImgJsonBlob, PERSONA } from "../../types";
import {
  loadImage,
  luminanceToAlphaCanvas,
  drawBrushStrokeOnCanvas,
  fillBrushShapeOnCanvas,
  invertImage,
  getThresholdedMask,
  getCardinalSplinePoints,
} from "./helper";
import { BrushMode } from "../HeaderToolbar/PersonaSettings_Paint";
import { processVectorMask, VectorMaskPipelineOptions } from "@/app/lib/vectorize";

/**
 * The five offscreen canvases that make up an image's layer stack, plus
 * scratch canvases for masking. Held as one grouped object (see
 * LayerCacheEntry below) instead of separate useRef calls, since none of
 * these are ever attached to JSX — they're pure internal mutable state,
 * only ever read/written imperatively.
 */
interface LayerCanvases {
  image: HTMLCanvasElement | null;     // image layer   : holds the original image
  object: HTMLCanvasElement | null;    // object layer  : holds the object
  repair: HTMLCanvasElement | null;    // erase layer   : holds the erase brush strokes
  vector: HTMLCanvasElement | null;    // vector layer  : holds the vector brush strokes
  color: HTMLCanvasElement | null;     // paint layer   : holds the paint brush strokes
}

/**
 * One cached image's layer canvases, plus a record of what server-side
 * source string (and swapMouseClicks flag, for mask layers) each layer
 * was last painted from. The source record is what lets the populate
 * effect tell "this layer's server data changed, must repaint" apart
 * from "user already has local edits on this canvas, leave it alone".
 */
interface HistorySnapshot {
  layerKey: EditableLayerKey;
  imageData: ImageData;
}

type EditablePersonaLayerKey = "repair" | "color";

interface HistoryStack {
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
}

interface LayerCacheEntry {
  canvases: LayerCanvases;
  sourceKeys: Partial<Record<EditableLayerKey, string>>;
  history: Record<EditablePersonaLayerKey, HistoryStack>;
}

const MAX_UNDO_PER_PERSONA = 5;

function createEmptyLayerHistory(): Record<EditablePersonaLayerKey, HistoryStack> {
  return {
    repair: { undoStack: [], redoStack: [] },
    color: { undoStack: [], redoStack: [] },
  };
}

const EDGE_VISIBLE_RATIO = 0.1;
const ABSOLUTE_MIN_ZOOM = 0.02;
const ABSOLUTE_MAX_ZOOM = 20;

type EditableLayerKey = keyof LayerCanvases;

function createEmptyLayerCanvases(): LayerCanvases {
  const makeCanvas = (): HTMLCanvasElement | null =>
    typeof document !== "undefined" ? document.createElement("canvas") : null;

  return {
    image: makeCanvas(),
    object: makeCanvas(),
    repair: makeCanvas(),
    vector: makeCanvas(),
    color: makeCanvas(),
  };
}

/**
 * Stable per-image cache key. Uses folder + filename rather than the
 * `imageData` object itself, since App builds a fresh object literal for
 * `activeImageData` on every render — an object-identity key would never
 * hit the cache twice for what is actually the same image.
 */
function getImageKey(data: ImgData | null): string | null {
  if (!data) return null;
  return `${data.folder || ""}::${data.metadata.name}`;
}

/**
 * Resolves whether a pointer action should erase or paint, given which
 * physical button was pressed and whether the user has swapped the
 * left/right click meaning. Shared by pointer-down/move/up so the
 * left-vs-right + swap convention lives in exactly one place.
 */
function resolveIsErase(isRightClick: boolean, swapMouseClicks: boolean): boolean {
  return isRightClick ? !swapMouseClicks : swapMouseClicks;
}

export function useCanvasRender({
  imageData,
  persona,
  brushMode,
  brushSize,
  maskVisibility,
  imageVisibility,
  brushOpacity,
  brushHardness,
  brushColor,
  thresholdValue,
  thresholdEnabled = true,
  traceMinBlobPixels,
  traceEnabled = true,
  simplifyEpsilon,
  simplifyEnabled = true,
  smoothIterations,
  smoothEnabled = true,
  contourOffset = 0,
  contourOffsetEnabled = false,
  feather = 0,
  featherEnabled = false,
  imageOpacity,
  maskOpacity,
  swapMouseClicks,
  splineCurviness = 0.5,
}: {
  imageData: ImgData | null;
  persona: PERSONA;
  brushMode: BrushMode;
  maskVisibility: boolean;
  imageVisibility: boolean;
  brushSize: number;
  brushOpacity: number;
  brushHardness: number;
  brushColor: string;
  thresholdValue: number;
  thresholdEnabled?: boolean;
  traceMinBlobPixels: number;
  traceEnabled?: boolean;
  simplifyEpsilon: number;
  simplifyEnabled?: boolean;
  smoothIterations: number;
  smoothEnabled?: boolean;
  contourOffset?: number;
  contourOffsetEnabled?: boolean;
  feather?: number;
  featherEnabled?: boolean;
  imageOpacity: number;
  maskOpacity: number;
  swapMouseClicks: boolean;
  splineCurviness?: number;
}) {

  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  const cursorCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const shapePreviewRef = useRef<{ x: number; y: number }[]>([]);
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);

  const objectLayerVersionRef = useRef(0);

  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [isMidClick, setIsMidClick] = useState<boolean>(false);
  const startPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const prevPersonaRef = useRef<PERSONA>(persona);
  const lastImageNameRef = useRef<string | null>(null);


  const vectorMaskCacheRef = useRef<{
    key: string;
    canvas: HTMLCanvasElement;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const canvas_main = useRef<HTMLCanvasElement | null>(null);
  const canvas_layers = useRef<LayerCanvases>(createEmptyLayerCanvases());

  // Per-image cache, keyed by folder+filename (see getImageKey). This is
  // what makes switching between images/tabs non-destructive: each
  // image's five layer canvases — and any brush/lasso/polygon edits
  // already painted onto them — stay alive here for the lifetime of the
  // component, instead of being torn down and re-fetched from the
  // server's jsonblob every time the selection changes.
  const layersCacheRef = useRef<Map<string, LayerCacheEntry>>(new Map());


  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };



  const getPanBounds = useCallback((zoomVal: number) => {
    const container = containerRef.current;
    const imgCanvas = canvas_layers.current.image;
    if (!container || !imgCanvas || !imgCanvas.width || !imgCanvas.height) {
      return { maxX: Infinity, maxY: Infinity };
    }

    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;

    const maxX = (0.5 - EDGE_VISIBLE_RATIO) * displayWidth + (imgCanvas.width * zoomVal) / 2;
    const maxY = (0.5 - EDGE_VISIBLE_RATIO) * displayHeight + (imgCanvas.height * zoomVal) / 2;

    return { maxX: Math.max(maxX, 0), maxY: Math.max(maxY, 0) };
  }, []);
  const getMinZoom = useCallback(() => {
    const container = containerRef.current;
    const imgCanvas = canvas_layers.current.image;
    if (!container || !imgCanvas || !imgCanvas.width || !imgCanvas.height) {
      return ABSOLUTE_MIN_ZOOM;
    }

    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;

    const minZoomX = (EDGE_VISIBLE_RATIO * displayWidth) / imgCanvas.width;
    const minZoomY = (EDGE_VISIBLE_RATIO * displayHeight) / imgCanvas.height;

    return Math.max(minZoomX, minZoomY, ABSOLUTE_MIN_ZOOM);
  }, []);
  const getCanvasCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const container = containerRef.current;
    const imgCanvas = canvas_layers.current.image;
    if (!container || !imgCanvas) return null;

    const rect = container.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;

    const worldX = (clientX - centerX - pan.x) / zoom;
    const worldY = (clientY - centerY - pan.y) / zoom;

    return {
      x: worldX + imgCanvas.width / 2,
      y: worldY + imgCanvas.height / 2,
    };
  }, [pan, zoom]);


  const clampPan = useCallback((p: { x: number; y: number }, zoomVal: number) => {
    const { maxX, maxY } = getPanBounds(zoomVal);
    return {
      x: Math.min(Math.max(p.x, -maxX), maxX),
      y: Math.min(Math.max(p.y, -maxY), maxY),
    };
  }, [getPanBounds]);
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = Math.min(Math.max(zoom * zoomFactor, getMinZoom()), ABSOLUTE_MAX_ZOOM);

    // World-space point currently under the cursor, then re-solve pan so
    // that same point stays under the cursor at the new zoom level.
    const worldX = (cursorX - centerX - pan.x) / zoom;
    const worldY = (cursorY - centerY - pan.y) / zoom;

    const nextPan = clampPan(
      {
        x: cursorX - centerX - nextZoom * worldX,
        y: cursorY - centerY - nextZoom * worldY,
      },
      nextZoom
    );

    setPan(nextPan);
    setZoom(nextZoom);
  }, [zoom, pan, getMinZoom, clampPan]);


  const tempCompositeMaskRef = useRef<HTMLCanvasElement | null>(null);
  const compositeMaskCacheRef = useRef<{
    key: string;
    canvas: HTMLCanvasElement;
  } | null>(null);

  // Shared by the live preview and export. Takes renderPersona explicitly
  // (instead of closing over the `persona` prop) so export can force
  // PERSONA.COLOR compositing regardless of what persona the user is
  // currently editing in — same pipeline, just a different persona input.
  // lineWidthZoom controls the vector-outline stroke width divisor: the
  // live preview passes the viewport `zoom` so outlines look consistent
  // on screen; export passes 1 since there's no "zoom" concept for a
  // saved image.
  const compositePersonaLayers = useCallback((
    ctx: CanvasRenderingContext2D,
    renderPersona: PERSONA,
    imgW: number,
    imgH: number,
    lineWidthZoom: number,
  ) => {
    const resolvedImageOpacity =
      renderPersona === PERSONA.IMAGE || renderPersona === PERSONA.COLOR || renderPersona === PERSONA.ADMIN ? 1
        : !imageVisibility ? 0
          : imageOpacity;

    if (canvas_layers.current.image) {
      ctx.save();
      ctx.globalAlpha = resolvedImageOpacity;
      ctx.drawImage(canvas_layers.current.image, 0, 0);
      ctx.restore();
    }

    if (renderPersona !== PERSONA.IMAGE) {
      const resolvedMaskOpacity =
        (!maskVisibility && renderPersona === PERSONA.OBJECT) ? 0
          : (renderPersona === PERSONA.COLOR || renderPersona === PERSONA.ADMIN ? 1 : maskOpacity);

      if (canvas_layers.current.object) {
        ctx.save();
        ctx.globalAlpha = resolvedMaskOpacity;

        if (!tempCompositeMaskRef.current) {
          tempCompositeMaskRef.current = document.createElement("canvas");
        }
        const maskCanvas = tempCompositeMaskRef.current;
        if (maskCanvas.width !== imgW || maskCanvas.height !== imgH) {
          maskCanvas.width = imgW;
          maskCanvas.height = imgH;
        }

        const maskctx = maskCanvas.getContext("2d")!;
        maskctx.clearRect(0, 0, imgW, imgH);
        maskctx.drawImage(canvas_layers.current.object, 0, 0);
        if (renderPersona !== PERSONA.OBJECT && canvas_layers.current.repair) {
          maskctx.drawImage(canvas_layers.current.repair, 0, 0);
        }

        let sublevelMask = maskCanvas;
        if (renderPersona === PERSONA.VECTOR || renderPersona === PERSONA.COLOR) {
          const vectorCacheKey = `${imageData?.folder || ""}::${imageData?.metadata.name || ""}::${thresholdValue}::${thresholdEnabled}::${traceMinBlobPixels}::${traceEnabled}::${contourOffset}::${contourOffsetEnabled}::${simplifyEpsilon}::${simplifyEnabled}::${smoothIterations}::${smoothEnabled}::${feather}::${featherEnabled}::${swapMouseClicks}::${isMidClick}::${objectLayerVersionRef.current}::${imgW}x${imgH}`;

          if (vectorMaskCacheRef.current && vectorMaskCacheRef.current.key === vectorCacheKey) {
            sublevelMask = vectorMaskCacheRef.current.canvas;
          } else {
            sublevelMask = processVectorMask(
              maskCanvas, {
              threshold: {
                enabled: thresholdEnabled,
                value: thresholdValue,
              },
              trace: {
                enabled: traceEnabled,
                minBlobPixels: traceEnabled ? traceMinBlobPixels : 0,
              },
              offset: {
                enabled: contourOffsetEnabled,
                distance: contourOffset,
              },
              simplify: {
                enabled: simplifyEnabled,
                epsilon: simplifyEpsilon,
              },
              smooth: {
                enabled: smoothEnabled,
                iterations: smoothIterations,
              },
              feather: {
                enabled: featherEnabled,
                radius: feather,
              },
              drawoptions: {
                fillInColor: "#000000",
                fillOutColor: "#ffffff",
                lineWidth: 2 / lineWidthZoom,
              },
            }
            ).resultCanvas;
            vectorMaskCacheRef.current = { key: vectorCacheKey, canvas: sublevelMask };
          }
        }

        const alphaCanvas = luminanceToAlphaCanvas(sublevelMask, isMidClick);
        ctx.drawImage(alphaCanvas, 0, 0);
        ctx.restore();
      }

      if ((renderPersona === PERSONA.COLOR || renderPersona === PERSONA.ADMIN) && canvas_layers.current.color) {
        ctx.drawImage(canvas_layers.current.color, 0, 0);
      }
    }
  }, [
    imageVisibility, imageOpacity, maskVisibility, maskOpacity, isMidClick,
    swapMouseClicks, thresholdValue, thresholdEnabled, traceMinBlobPixels,
    traceEnabled, contourOffset, contourOffsetEnabled, simplifyEpsilon, simplifyEnabled,
    smoothIterations, smoothEnabled, feather, featherEnabled, imageData,
  ]);


  const createMergedDataUrl = useCallback(async (): Promise<string> => {
    const imgCanvas = canvas_layers.current.image;
    if (!imgCanvas) return "";

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = imgCanvas.width;
    exportCanvas.height = imgCanvas.height;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return "";

    // Force COLOR-persona compositing regardless of the user's current
    // editing persona, using the same pipeline the live preview uses —
    // full mask/vector/color composite at native image resolution, not a
    // capture of the (possibly panned/zoomed, DPR-scaled) screen canvas.
    compositePersonaLayers(ctx, PERSONA.COLOR, imgCanvas.width, imgCanvas.height, 1);

    return exportCanvas.toDataURL("image/png");
  }, [compositePersonaLayers]);
  const getLayersJsonBlob = useCallback((): ImgJsonBlob => {
    const exportLayer = (layerCanvas: HTMLCanvasElement | null, fallback: string = "") => {
      if (!layerCanvas || layerCanvas.width === 0 || layerCanvas.height === 0) {
        return fallback;
      }
      return layerCanvas.toDataURL("image/png");
    };

    return {
      image: exportLayer(canvas_layers.current.image, imageData?.jsonblob.image || ""),
      object: exportLayer(canvas_layers.current.object, imageData?.jsonblob.object || ""),
      repair: exportLayer(canvas_layers.current.repair, imageData?.jsonblob.repair || ""),
      color: exportLayer(canvas_layers.current.color, imageData?.jsonblob.color || ""),
    };
  }, [imageData]);


  const drawBrushStroke = useCallback((
    targetCanvas: HTMLCanvasElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
    isErase: boolean
  ) => {
    drawBrushStrokeOnCanvas(targetCanvas, from, to, brushSize, {
      brushColor,
      brushOpacity,
      brushHardness,
      isErase,
      eraseToBlack: persona === PERSONA.REPAIR,
    });
    if (persona === PERSONA.REPAIR) {
      objectLayerVersionRef.current += 1;
    }
  }, [brushSize, brushColor, brushOpacity, brushHardness, persona]);
  const fillShape = useCallback((points: { x: number; y: number }[], isErase: boolean) => {
    const targetLayer =
      persona === PERSONA.REPAIR
        ? canvas_layers.current.repair
        : canvas_layers.current.color;

    const shapePoints = brushMode === "spline" ? getCardinalSplinePoints(points, splineCurviness, true) : points;

    fillBrushShapeOnCanvas(targetLayer, shapePoints, {
      brushColor,
      brushOpacity,
      brushHardness,
      isErase,
      eraseToBlack: persona === PERSONA.REPAIR,
    });
    if (persona === PERSONA.REPAIR) {
      objectLayerVersionRef.current += 1;
    }
  }, [persona, brushMode, brushColor, brushOpacity, brushHardness, splineCurviness]);
  const pendingUndoSnapshotRef = useRef<HistorySnapshot | null>(null);
  const [historyVersion, setHistoryVersion] = useState<number>(0);

  const getPersonaLayerKey = useCallback((p: PERSONA): EditablePersonaLayerKey | null => {
    if (p === PERSONA.REPAIR) return "repair";
    if (p === PERSONA.COLOR) return "color";
    return null;
  }, []);

  const commitPendingUndoSnapshot = useCallback(() => {
    if (!pendingUndoSnapshotRef.current) return;
    const key = getImageKey(imageData);
    if (!key) {
      pendingUndoSnapshotRef.current = null;
      return;
    }
    let entry = layersCacheRef.current.get(key);
    if (!entry) {
      entry = { canvases: createEmptyLayerCanvases(), sourceKeys: {}, history: createEmptyLayerHistory() };
      layersCacheRef.current.set(key, entry);
    }
    if (!entry.history) {
      entry.history = createEmptyLayerHistory();
    }
    const layerKey = pendingUndoSnapshotRef.current.layerKey as EditablePersonaLayerKey;
    if (layerKey === "repair" || layerKey === "color") {
      const personaHist = entry.history[layerKey] || { undoStack: [], redoStack: [] };
      personaHist.undoStack.push(pendingUndoSnapshotRef.current);
      if (personaHist.undoStack.length > MAX_UNDO_PER_PERSONA) {
        personaHist.undoStack.shift();
      }
      personaHist.redoStack = [];
      entry.history[layerKey] = personaHist;
    }
    pendingUndoSnapshotRef.current = null;
    setHistoryVersion((v) => v + 1);
  }, [imageData]);

  const pushUndoSnapshotDirect = useCallback(
    (targetKey: EditableLayerKey) => {
      if (targetKey !== "repair" && targetKey !== "color") return;
      const targetCanvas = canvas_layers.current[targetKey];
      if (!targetCanvas || targetCanvas.width === 0 || targetCanvas.height === 0) return;
      const ctx = targetCanvas.getContext("2d");
      if (!ctx) return;

      const snap = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
      const key = getImageKey(imageData);
      if (!key) return;

      let entry = layersCacheRef.current.get(key);
      if (!entry) {
        entry = { canvases: createEmptyLayerCanvases(), sourceKeys: {}, history: createEmptyLayerHistory() };
        layersCacheRef.current.set(key, entry);
      }
      if (!entry.history) {
        entry.history = createEmptyLayerHistory();
      }
      const personaHist = entry.history[targetKey] || { undoStack: [], redoStack: [] };
      personaHist.undoStack.push({ layerKey: targetKey, imageData: snap });
      if (personaHist.undoStack.length > MAX_UNDO_PER_PERSONA) {
        personaHist.undoStack.shift();
      }
      personaHist.redoStack = [];
      entry.history[targetKey] = personaHist;
      setHistoryVersion((v) => v + 1);
    },
    [imageData]
  );

  const undo = useCallback(() => {
    const activeLayerKey = getPersonaLayerKey(persona);
    if (!activeLayerKey) return;

    const key = getImageKey(imageData);
    if (!key) return;
    const entry = layersCacheRef.current.get(key);
    if (!entry || !entry.history || !entry.history[activeLayerKey]) return;

    const personaHist = entry.history[activeLayerKey];
    if (personaHist.undoStack.length === 0) return;

    const snapshotToRestore = personaHist.undoStack.pop()!;
    const targetCanvas = entry.canvases[activeLayerKey];
    if (!targetCanvas) return;

    const ctx = targetCanvas.getContext("2d");
    if (!ctx) return;

    const currentSnapshot = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    personaHist.redoStack.push({ layerKey: activeLayerKey, imageData: currentSnapshot });
    if (personaHist.redoStack.length > MAX_UNDO_PER_PERSONA) {
      personaHist.redoStack.shift();
    }

    if (targetCanvas.width !== snapshotToRestore.imageData.width || targetCanvas.height !== snapshotToRestore.imageData.height) {
      targetCanvas.width = snapshotToRestore.imageData.width;
      targetCanvas.height = snapshotToRestore.imageData.height;
    }
    ctx.putImageData(snapshotToRestore.imageData, 0, 0);

    if (activeLayerKey === "repair") {
      objectLayerVersionRef.current += 1;
    }

    setHistoryVersion((v) => v + 1);
  }, [imageData, persona, getPersonaLayerKey]);

  const redo = useCallback(() => {
    const activeLayerKey = getPersonaLayerKey(persona);
    if (!activeLayerKey) return;

    const key = getImageKey(imageData);
    if (!key) return;
    const entry = layersCacheRef.current.get(key);
    if (!entry || !entry.history || !entry.history[activeLayerKey]) return;

    const personaHist = entry.history[activeLayerKey];
    if (personaHist.redoStack.length === 0) return;

    const snapshotToRestore = personaHist.redoStack.pop()!;
    const targetCanvas = entry.canvases[activeLayerKey];
    if (!targetCanvas) return;

    const ctx = targetCanvas.getContext("2d");
    if (!ctx) return;

    const currentSnapshot = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
    personaHist.undoStack.push({ layerKey: activeLayerKey, imageData: currentSnapshot });
    if (personaHist.undoStack.length > MAX_UNDO_PER_PERSONA) {
      personaHist.undoStack.shift();
    }

    if (targetCanvas.width !== snapshotToRestore.imageData.width || targetCanvas.height !== snapshotToRestore.imageData.height) {
      targetCanvas.width = snapshotToRestore.imageData.width;
      targetCanvas.height = snapshotToRestore.imageData.height;
    }
    ctx.putImageData(snapshotToRestore.imageData, 0, 0);

    if (activeLayerKey === "repair") {
      objectLayerVersionRef.current += 1;
    }

    setHistoryVersion((v) => v + 1);
  }, [imageData, persona, getPersonaLayerKey]);

  const currentKey = getImageKey(imageData);
  const currentEntry = currentKey ? layersCacheRef.current.get(currentKey) : null;
  const activeLayerKey = getPersonaLayerKey(persona);

  const canUndo = Boolean(
    activeLayerKey && currentEntry?.history?.[activeLayerKey]?.undoStack && currentEntry.history[activeLayerKey].undoStack.length > 0
  );
  const canRedo = Boolean(
    activeLayerKey && currentEntry?.history?.[activeLayerKey]?.redoStack && currentEntry.history[activeLayerKey].redoStack.length > 0
  );

  const closePolygon = useCallback((isErase: boolean = false) => {
    if (brushMode !== "polygon" && brushMode !== "spline") return;
    if (!(persona === PERSONA.REPAIR || persona === PERSONA.COLOR)) return;

    if (polygonPoints.length >= 3) {
      let pts = [...polygonPoints];
      // Pop duplicate trailing vertex created by the 2nd click of a double click
      if (pts.length > 3) {
        const last = pts[pts.length - 1];
        const prevLast = pts[pts.length - 2];
        if (Math.hypot(last.x - prevLast.x, last.y - prevLast.y) < 4) {
          pts.pop();
        }
      }

      if (pts.length >= 3) {
        const targetKey: EditableLayerKey = persona === PERSONA.REPAIR ? "repair" : "color";
        if (pendingUndoSnapshotRef.current) {
          commitPendingUndoSnapshot();
        } else {
          pushUndoSnapshotDirect(targetKey);
        }
        fillShape(pts, isErase);
        setPolygonPoints([]);
        shapePreviewRef.current = [];
      }
    }
  }, [brushMode, persona, polygonPoints, fillShape, commitPendingUndoSnapshot, pushUndoSnapshotDirect]);

  // Global Keyboard Shortcuts for Undo/Redo & Polygon/Spline Commit (Enter) / Cancel (Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (e.key === "Enter" || e.key === "NumpadEnter") {
        if ((brushMode === "polygon" || brushMode === "spline") && polygonPoints.length >= 3) {
          e.preventDefault();
          closePolygon(false);
          return;
        }
      }

      if (e.key === "Escape") {
        if ((brushMode === "polygon" || brushMode === "spline") && polygonPoints.length > 0) {
          e.preventDefault();
          setPolygonPoints([]);
          shapePreviewRef.current = [];
          return;
        }
      }

      const isMac = typeof navigator !== "undefined" && Boolean(navigator.platform && navigator.platform.toUpperCase().indexOf("MAC") >= 0);
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && (e.key === "z" || e.key === "Z")) {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if (modifier && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, brushMode, polygonPoints, closePolygon]);

  const clearLayer = useCallback((layerKey?: EditableLayerKey) => {
    const targetKey = layerKey || (persona === PERSONA.REPAIR ? "repair" : persona === PERSONA.COLOR ? "color" : null);
    if (!targetKey) return;

    const layerCanvas = canvas_layers.current[targetKey];
    if (!layerCanvas || layerCanvas.width === 0 || layerCanvas.height === 0) return;

    const ctx = layerCanvas.getContext("2d");
    if (!ctx) return;

    pushUndoSnapshotDirect(targetKey);

    ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
    if (targetKey === "repair" || targetKey === "object") {
      objectLayerVersionRef.current += 1;
    }
  }, [persona, pushUndoSnapshotDirect]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.shiftKey) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsMidClick(true);
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    const coords = getCanvasCoords(e);
    if (!coords) return;

    cursorCoordsRef.current = coords;
    const isEraseAction = resolveIsErase(e.button === 2, swapMouseClicks);

    if (persona === PERSONA.REPAIR || persona === PERSONA.COLOR) {
      const targetKey: EditableLayerKey = persona === PERSONA.REPAIR ? "repair" : "color";
      const targetCanvas = canvas_layers.current[targetKey];
      if (targetCanvas && targetCanvas.width > 0 && targetCanvas.height > 0) {
        const ctx = targetCanvas.getContext("2d");
        if (ctx && !pendingUndoSnapshotRef.current) {
          const snap = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
          pendingUndoSnapshotRef.current = { layerKey: targetKey, imageData: snap };
        }
      }

      isDrawingRef.current = true;
      lastPointRef.current = coords;

      if (brushMode === "brush") {
        const targetLayer =
          persona === PERSONA.REPAIR
            ? canvas_layers.current.repair
            : canvas_layers.current.color;
        if (targetLayer) {
          drawBrushStroke(targetLayer, coords, coords, isEraseAction);
        }
      } else if (brushMode === "lasso") {
        lassoPointsRef.current = [coords];
        shapePreviewRef.current = lassoPointsRef.current;
      } else if (brushMode === "polygon" || brushMode === "spline") {
        if (polygonPoints.length >= 3) {
          const firstPt = polygonPoints[0];
          const dist = Math.hypot(coords.x - firstPt.x, coords.y - firstPt.y);
          if (dist < 12 / zoom) {
            closePolygon(isEraseAction);
            return;
          }
        }
        setPolygonPoints((prev) => {
          const next = [...prev, coords];
          shapePreviewRef.current = next;
          return next;
        });
      }
    }
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (coords) {
      cursorCoordsRef.current = coords;
    }

    if (isMidClick) {
      const rawPan = {
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y,
      };
      setPan(clampPan(rawPan, zoom));
      return;
    }

    if (isDrawingRef.current && coords) {
      const isEraseAction = resolveIsErase(e.buttons === 2, swapMouseClicks);

      if (brushMode === "brush" && lastPointRef.current) {
        const targetLayer =
          persona === PERSONA.REPAIR
            ? canvas_layers.current.repair
            : canvas_layers.current.color;
        if (targetLayer) {
          drawBrushStroke(targetLayer, lastPointRef.current, coords, isEraseAction);
          lastPointRef.current = coords;
        }
      } else if (brushMode === "lasso") {
        lassoPointsRef.current.push(coords);
        shapePreviewRef.current = lassoPointsRef.current;
      }
    }
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMidClick) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setIsMidClick(false);
      return;
    }

    if (isDrawingRef.current) {
      const isEraseAction = resolveIsErase(e.button === 2, swapMouseClicks);

      if (brushMode === "lasso" && lassoPointsRef.current.length > 2) {
        fillShape(lassoPointsRef.current, isEraseAction);
        lassoPointsRef.current = [];
        shapePreviewRef.current = [];
      }

      commitPendingUndoSnapshot();

      isDrawingRef.current = false;
      lastPointRef.current = null;
    }
  };
  const handlePointerLeave = () => {
    cursorCoordsRef.current = null;
    if (isDrawingRef.current && brushMode === "lasso") {
      lassoPointsRef.current = [];
      shapePreviewRef.current = [];
      isDrawingRef.current = false;
    }
  };


  const activeRenderKeyRef = useRef<string | null>(null);

  // Render Main Viewport Loop
  const renderMainCanvas = useCallback(() => {
    const mainCanvas = canvas_main.current;
    const container = containerRef.current;
    if (!mainCanvas || !container) return;

    const currentKey = getImageKey(imageData);
    // Don't render until the active layers match the current selected image
    if (currentKey && activeRenderKeyRef.current !== currentKey) {
      return;
    }

    const ctx = mainCanvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = container.clientWidth;
    const displayHeight = container.clientHeight;

    if (mainCanvas.width !== displayWidth * dpr || mainCanvas.height !== displayHeight * dpr) {
      mainCanvas.width = displayWidth * dpr;
      mainCanvas.height = displayHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const baseImgCanvas = canvas_layers.current.image;

    if (baseImgCanvas && baseImgCanvas.width > 0) {
      const imgW = baseImgCanvas.width;
      const imgH = baseImgCanvas.height;

      ctx.save();
      // Center + Pan + Zoom transform
      ctx.translate(displayWidth / 2 + pan.x, displayHeight / 2 + pan.y);
      ctx.scale(zoom, zoom);
      ctx.translate(-imgW / 2, -imgH / 2);

      compositePersonaLayers(ctx, persona, imgW, imgH, zoom);

      const cursor = cursorCoordsRef.current;

      // --- LASSO PREVIEW ---
      if (brushMode === "lasso" && lassoPointsRef.current.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "#0096ff";
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);

        ctx.moveTo(lassoPointsRef.current[0].x, lassoPointsRef.current[0].y);
        for (let i = 1; i < lassoPointsRef.current.length; i++) {
          ctx.lineTo(lassoPointsRef.current[i].x, lassoPointsRef.current[i].y);
        }

        // Elastic line back to cursor if currently dragging
        if (isDrawingRef.current && cursor) {
          ctx.lineTo(cursor.x, cursor.y);
        }

        ctx.stroke();
        ctx.restore();
      }

      // --- POLYGON PREVIEW ---
      if (brushMode === "polygon" && polygonPoints.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "#00ffcc";
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);

        ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
        for (let i = 1; i < polygonPoints.length; i++) {
          ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
        }

        // Draw rubber-band line to active cursor position
        if (cursor) {
          ctx.lineTo(cursor.x, cursor.y);
        }

        ctx.stroke();
        ctx.setLineDash([]); // Clean up dash pattern

        // Render placed anchor points
        polygonPoints.forEach((pt) => {
          ctx.beginPath();
          ctx.fillStyle = "#00ffcc";
          ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.restore();
      }

      // --- SPLINE PREVIEW ---
      if (brushMode === "spline" && polygonPoints.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "#ff00ff";
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);

        const pts = cursor ? [...polygonPoints, cursor] : polygonPoints;
        if (pts.length > 1) {
          const splinePts = getCardinalSplinePoints(pts, splineCurviness, false);
          ctx.moveTo(splinePts[0].x, splinePts[0].y);
          for (let i = 1; i < splinePts.length; i++) {
            ctx.lineTo(splinePts[i].x, splinePts[i].y);
          }
        }

        ctx.stroke();
        ctx.setLineDash([]);

        polygonPoints.forEach((pt) => {
          ctx.beginPath();
          ctx.fillStyle = "#ff00ff";
          ctx.arc(pt.x, pt.y, 4 / zoom, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.restore();
      }

      if (cursor && (persona === PERSONA.REPAIR || persona === PERSONA.COLOR)) {
        // --- BRUSH CURSOR RING PREVIEW ---
        if (brushMode === "brush") {
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = persona === PERSONA.REPAIR ? "#ff4d4d" : "#00ffcc";
          ctx.lineWidth = 1.5 / zoom;
          ctx.arc(cursor.x, cursor.y, brushSize / 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // --- POLYGON/LASSO/SPLINE CURSOR CROSS PREVIEW ---
        if (brushMode === "polygon" || brushMode === "lasso" || brushMode === "spline") {
          ctx.save();
          const halfSize = brushSize / 2;

          ctx.beginPath();
          ctx.strokeStyle = persona === PERSONA.REPAIR ? "#ff4d4d" : "#00ffcc";
          ctx.lineWidth = 1.5 / zoom;

          // Vertical line
          ctx.moveTo(cursor.x, cursor.y - halfSize);
          ctx.lineTo(cursor.x, cursor.y + halfSize);

          // Horizontal line
          ctx.moveTo(cursor.x - halfSize, cursor.y);
          ctx.lineTo(cursor.x + halfSize, cursor.y);

          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.restore();
    }

    ctx.restore();
  }, [
    pan, zoom, polygonPoints, brushMode, brushSize, persona,
    compositePersonaLayers,
  ]);




  // 1. Switch to (or populate) the active image's cached layer set.
  //
  // On every run: look up this image's entry in layersCacheRef by
  // folder+filename. If it exists, canvas_layers.current is simply
  // repointed at it — any strokes drawn on those canvas elements during
  // a previous visit are still there, since draws mutate the canvas
  // element in place and the Map keeps that element alive across tab
  // switches. If it doesn't exist yet, a fresh entry is created and
  // cached before populating.
  //
  // Per layer, populate is only re-run when that layer's server source
  // string (or, for mask layers, swapMouseClicks) has actually changed
  // since it was last painted — tracked via entry.sourceKeys. This is
  // what lets a fresh object mask pushed in by App's handleDetectObject
  // (same image, new imageData.jsonblob.object) get picked up even for
  // an already-cached image, while leaving the repair/color layers —
  // which only ever change via local brush edits, never from the server
  // — untouched.
  useEffect(() => {
    if (!imageData?.jsonblob) return;
    const key = getImageKey(imageData);
    if (!key) return;

    let isMounted = true;

    const MAX_CACHE_ENTRIES = 15;
    let entry = layersCacheRef.current.get(key);
    if (!entry) {
      if (layersCacheRef.current.size >= MAX_CACHE_ENTRIES) {
        // Evict oldest entry (first key in insertion-ordered Map)
        const oldestKey = layersCacheRef.current.keys().next().value;
        if (oldestKey) {
          const oldEntry = layersCacheRef.current.get(oldestKey);
          if (oldEntry?.canvases) {
            Object.values(oldEntry.canvases).forEach((c) => {
              if (c) {
                c.width = 0;
                c.height = 0;
              }
            });
          }
          layersCacheRef.current.delete(oldestKey);
        }
      }
      entry = { canvases: createEmptyLayerCanvases(), sourceKeys: {}, history: createEmptyLayerHistory() };
      layersCacheRef.current.set(key, entry);
    } else {
      // Re-insert key to maintain MRU order
      layersCacheRef.current.delete(key);
      layersCacheRef.current.set(key, entry);
    }
    const activeEntry: LayerCacheEntry = entry;

    canvas_layers.current = activeEntry.canvases;

    const { image, object, repair, color } = imageData.jsonblob;
    const rawWidth = imageData.metadata.width;
    const rawHeight = imageData.metadata.height;

    // Downscale target: in Admin persona downscale preview to max 1440p (1440px), otherwise 2K (2048px)
    const MAX_DIMENSION = persona === PERSONA.ADMIN ? 1440 : 2048;
    const maxEdge = Math.max(rawWidth || 0, rawHeight || 0);
    const scale = maxEdge > MAX_DIMENSION ? MAX_DIMENSION / maxEdge : 1;
    const width = rawWidth ? Math.round(rawWidth * scale) : 0;
    const height = rawHeight ? Math.round(rawHeight * scale) : 0;

    const populateLayer = async (
      layerKey: EditableLayerKey,
      src?: string,
    ) => {
      const layerCanvas = activeEntry.canvases[layerKey];
      if (!layerCanvas) return; // guard against SSR / not-yet-created canvas
      const ctx = layerCanvas.getContext("2d");
      if (!ctx) return;

      if (!src) {
        layerCanvas.width = width || 100;
        layerCanvas.height = height || 100;
        ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        if (layerKey === "object") objectLayerVersionRef.current += 1;
        return;
      }

      try {
        const img = await loadImage(src);
        if (!isMounted) return;

        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;
        const imgMaxEdge = Math.max(naturalW || 0, naturalH || 0);
        const imgScale = imgMaxEdge > MAX_DIMENSION ? MAX_DIMENSION / imgMaxEdge : 1;

        const w = width || Math.round(naturalW * imgScale);
        const h = height || Math.round(naturalH * imgScale);

        layerCanvas.width = w;
        layerCanvas.height = h;
        ctx.clearRect(0, 0, w, h);

        ctx.drawImage(img, 0, 0, w, h);

        if (layerKey === "object") objectLayerVersionRef.current += 1;
      } catch (err) {
        console.error("Failed to populate canvas layer:", err);
      }
    };

    const layerSources: [EditableLayerKey, string | undefined][] = [
      ["image", image],
      ["object", object],
      ["repair", repair],
      ["color", color],
    ];

    const loadAllLayers = async () => {
      const promises = layerSources.map(([layerKey, src]) => {
        const sourceKey = src ?? "";
        if (activeEntry.sourceKeys[layerKey] === sourceKey) return Promise.resolve();
        activeEntry.sourceKeys[layerKey] = sourceKey;
        return populateLayer(layerKey, src);
      });

      await Promise.all(promises);
      if (isMounted) {
        activeRenderKeyRef.current = key;
      }
    };

    loadAllLayers();

    return () => {
      isMounted = false;
    };
  }, [imageData, swapMouseClicks]);

  // 1b. Fit the image to the viewport whenever the selected file changes.
  //
  // Dependency is `imageData?.metadata.name` — not the `imageData` object
  // itself. `imageData` is a fresh object literal built by the parent on
  // every render (see App's `activeImageData`), so depending on the
  // object would re-fit (and stomp the user's pan/zoom) on every
  // unrelated re-render, e.g. moving a brush slider. Keying off the
  // filename means this only fires when the user actually switches
  // images.
  //
  // Pan/zoom are NOT cached per-image the way layer canvases are — every
  // switch re-fits to the container. If you also want pan/zoom restored
  // per tab, that'd be a small addition: store {pan, zoom} in the same
  // LayerCacheEntry and read it back here instead of always re-fitting.
  useEffect(() => {
    if (!imageData) return;

    const prevPersona = prevPersonaRef.current;
    prevPersonaRef.current = persona;

    const isImageChanged = lastImageNameRef.current !== imageData.metadata.name;
    lastImageNameRef.current = imageData.metadata.name;

    const isAdminInvolved = persona === PERSONA.ADMIN || prevPersona === PERSONA.ADMIN;
    const shouldReset = isImageChanged || isAdminInvolved;

    const container = containerRef.current;
    const rawWidth = imageData.metadata.width;
    const rawHeight = imageData.metadata.height;
    if (!container || !rawWidth || !rawHeight) return;

    const MAX_DIMENSION = persona === PERSONA.ADMIN ? 1440 : 2048;
    const maxEdge = Math.max(rawWidth, rawHeight);
    const scale = maxEdge > MAX_DIMENSION ? MAX_DIMENSION / maxEdge : 1;
    const width = Math.round(rawWidth * scale);
    const height = Math.round(rawHeight * scale);

    // Small margin so the image doesn't touch the container's edges.
    const FIT_PADDING = 0.92;
    const fitZoom =
      Math.min(container.clientWidth / width, container.clientHeight / height) *
      FIT_PADDING;

    if (shouldReset) {
      setZoom(Math.min(Math.max(fitZoom, ABSOLUTE_MIN_ZOOM), ABSOLUTE_MAX_ZOOM));
      setPan({ x: 0, y: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData?.metadata.name, persona]);


  // Re-clamp zoom/pan whenever the container's own size changes — e.g.
  // toggling the sidebar/inspector, dragging their resize handles, or
  // resizing the window. Without this, a pan/zoom that was valid for the
  // old container size can leave the image pushed off-center once the
  // container shrinks or grows, since only drag/wheel interactions were
  // re-clamping before.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reclamp = () => {
      setZoom((prevZoom) => {
        const minZoom = getMinZoom();
        const nextZoom = Math.min(Math.max(prevZoom, minZoom), ABSOLUTE_MAX_ZOOM);
        setPan((prevPan) => clampPan(prevPan, nextZoom));
        return nextZoom;
      });
    };

    const resizeObserver = new ResizeObserver(reclamp);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [imageData, getMinZoom, clampPan]);

  // Render loop
  useEffect(() => {
    let animId: number;
    const loop = () => {
      renderMainCanvas();
      animId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animId);
  }, [renderMainCanvas]);

  // Mouse wheel event handler
  useEffect(() => {
    const canvasEl = canvas_main.current;
    if (!canvasEl) return;
    canvasEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvasEl.removeEventListener("wheel", handleWheel);
  }, [handleWheel, imageData]);

  return {
    canvasRef: canvas_main,
    containerRef,
    isPanning: isMidClick,
    closePolygon,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handleContextMenu,
    createMergedDataUrl,
    getLayersJsonBlob,
    clearLayer,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}