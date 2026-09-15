import React, { useRef, useEffect } from "react";
import { ImgData, ImgJsonBlob } from "../../types";
import { useCanvasRender } from "./canvas";
import { PERSONA } from "../../types";
import { BrushMode } from "../HeaderToolbar/PersonaSettings_Paint";

const RIGHT_DOUBLE_CLICK_MS = 400;
const RIGHT_DOUBLE_CLICK_DIST_PX = 6;

interface ImageWorkspaceProps {
  persona: PERSONA;
  brushMode: BrushMode;
  brushSize: number;
  brushColor: string;
  maskOpacity: number;
  brushOpacity: number;
  imageOpacity: number;
  brushHardness: number;
  originalImage: ImgData | null;
  thresholdValue: number;
  thresholdValueEnabled?: boolean;
  maskVisibility: boolean;
  imageVisibility: boolean;
  simplifyEpsilon: number;
  simplifyEpsilonEnabled?: boolean;
  swapMouseClicks: boolean;
  smoothIterations: number;
  smoothIterationsEnabled?: boolean;
  contourOffset?: number;
  contourOffsetEnabled?: boolean;
  feather?: number;
  featherEnabled?: boolean;
  traceMinBlobPixels: number;
  traceMinBlobPixelsEnabled?: boolean;
  splineCurviness?: number;
  onRegisterGetMergedDataUrl?: (fn: () => Promise<string>) => void;
  onRegisterGetLayersJsonBlob?: (fn: () => ImgJsonBlob) => void;
  onRegisterClearLayer?: (fn: (layerKey?: "repair" | "color" | "object" | "image") => void) => void;
  onRegisterUndo?: (fn: () => void) => void;
  onRegisterRedo?: (fn: () => void) => void;
  onHistoryStatusChange?: (status: { canUndo: boolean; canRedo: boolean }) => void;
}

export default function PreviewWorkspace({
  persona,
  brushMode,
  brushSize,
  brushColor,
  maskOpacity,
  brushOpacity,
  imageOpacity,
  brushHardness,
  thresholdValue,
  thresholdValueEnabled = true,
  maskVisibility,
  imageVisibility,
  simplifyEpsilon,
  simplifyEpsilonEnabled = true,
  smoothIterations,
  smoothIterationsEnabled = true,
  contourOffset = 0,
  contourOffsetEnabled = false,
  feather = 0,
  featherEnabled = false,
  traceMinBlobPixels,
  traceMinBlobPixelsEnabled = true,
  splineCurviness = 0.5,
  originalImage: imageData,
  swapMouseClicks = false,
  onRegisterGetMergedDataUrl,
  onRegisterGetLayersJsonBlob,
  onRegisterClearLayer,
  onRegisterUndo,
  onRegisterRedo,
  onHistoryStatusChange,
}: ImageWorkspaceProps) {

  const maskEditor = useCanvasRender({
    imageData,
    persona,
    brushMode,
    brushSize,
    brushOpacity,
    brushHardness,
    brushColor,
    maskOpacity,
    thresholdValue,
    thresholdEnabled: thresholdValueEnabled,
    traceMinBlobPixels,
    traceEnabled: traceMinBlobPixelsEnabled,
    simplifyEpsilon,
    simplifyEnabled: simplifyEpsilonEnabled,
    smoothIterations,
    smoothEnabled: smoothIterationsEnabled,
    contourOffset,
    contourOffsetEnabled,
    feather,
    featherEnabled,
    imageOpacity,
    maskVisibility,
    imageVisibility,
    swapMouseClicks,
    splineCurviness,
  });

  const {
    canvasRef,
    containerRef,
    isPanning,
    handlePointerDown: onPointerDown,
    handlePointerMove: onPointerMove,
    handlePointerUp: onPointerUp,
    handlePointerLeave: onPointerLeave,
    handleContextMenu: onContextMenu,
    closePolygon,
    createMergedDataUrl,
    getLayersJsonBlob,
    clearLayer,
    undo,
    redo,
    canUndo,
    canRedo,
  } = maskEditor;

  // Hand the parent fresh getters whenever the underlying functions
  // change identity, so export/merge actions triggered from outside this
  // component (e.g. App's handleExport) always read current canvas state
  // instead of a stale closure.
  useEffect(() => {
    onRegisterGetMergedDataUrl?.(createMergedDataUrl);
  }, [onRegisterGetMergedDataUrl, createMergedDataUrl]);

  useEffect(() => {
    onRegisterGetLayersJsonBlob?.(getLayersJsonBlob);
  }, [onRegisterGetLayersJsonBlob, getLayersJsonBlob]);

  useEffect(() => {
    onRegisterClearLayer?.(clearLayer);
  }, [onRegisterClearLayer, clearLayer]);

  useEffect(() => {
    onRegisterUndo?.(undo);
  }, [onRegisterUndo, undo]);

  useEffect(() => {
    onRegisterRedo?.(redo);
  }, [onRegisterRedo, redo]);

  useEffect(() => {
    onHistoryStatusChange?.({ canUndo, canRedo });
  }, [onHistoryStatusChange, canUndo, canRedo]);

  const lastRightDownRef = useRef<{ time: number; x: number; y: number } | null>(null);

  /* Pointer Event Handlers */
  const handlePointerDownInternal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2) {
      const now = performance.now();
      const last = lastRightDownRef.current;
      const isDoubleRightClick =
        !!last &&
        now - last.time < RIGHT_DOUBLE_CLICK_MS &&
        Math.abs(e.clientX - last.x) < RIGHT_DOUBLE_CLICK_DIST_PX &&
        Math.abs(e.clientY - last.y) < RIGHT_DOUBLE_CLICK_DIST_PX;

      if (isDoubleRightClick) {
        // Right double-click → close with the erase mask (flipped if
        // swapMouseClicks is on, same convention the brush/lasso tools use
        // elsewhere for which physical button means what).
        closePolygon(!swapMouseClicks);
        lastRightDownRef.current = null; // don't let a 3rd click chain into another double-click
        // This click closed the polygon — don't also let it fall through
        // to onPointerDown below, which would otherwise read it as the
        // first vertex of a brand-new polygon.
        return;
      } else {
        lastRightDownRef.current = { time: now, x: e.clientX, y: e.clientY };
      }
    }
    onPointerDown(e);
  };
  const handlePointerUpInternal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    onPointerUp(e);
  };
  const handlePointerMoveInternal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    onPointerMove(e);
  };
  const handlePointerLeaveInternal = () => {
    // Uses the dedicated leave handler (clears cursor + resets any
    // in-progress lasso), not onPointerUp — leaving the canvas mid-drag
    // isn't a mouse-up, and shouldn't be treated like a completed stroke.
    onPointerLeave();
  };
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // Guard even though native dblclick shouldn't fire for the right
    // button in the first place — some browsers have been known to.
    if (e.button !== 0) return;

    // Left double-click → close with the paint mask (flipped if
    // swapMouseClicks is on).
    closePolygon(swapMouseClicks);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 select-none flex-1 min-h-0 w-full h-full p-2 bg-[#181818]">
      {imageData ? (
        <div
          ref={containerRef}
          onContextMenu={onContextMenu}
          className="relative flex-1 w-full overflow-hidden rounded-md border border-[#2d2d2d] flex items-center justify-center min-h-0"
          style={{
            backgroundImage: `
                  linear-gradient(45deg, #262626 25%, transparent 25%),
                  linear-gradient(-45deg, #262626 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #262626 75%),
                  linear-gradient(-45deg, transparent 75%, #262626 75%)
                `,
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
            backgroundColor: "#1b1b1b",
          }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDownInternal}
            onPointerMove={handlePointerMoveInternal}
            onPointerUp={handlePointerUpInternal}
            onDoubleClick={handleCanvasDoubleClick}
            onPointerLeave={handlePointerLeaveInternal}
            className={`w-full h-full touch-none ${isPanning
              ? "cursor-grabbing"
              : persona === PERSONA.REPAIR || persona === PERSONA.COLOR
                ? "cursor-none"
                : "cursor-default"
              }`}
          />
        </div>
      ) : (
        "No Items"
      )}
    </div>
  );
}