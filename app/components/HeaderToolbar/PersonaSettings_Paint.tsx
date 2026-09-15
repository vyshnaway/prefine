import React from "react";
import Slider from "./Slider";
import { Brush, Eraser, Triangle, Circle, PaintRoller, Trash2, Undo2, Redo2, Spline } from "lucide-react";

export type BrushMode = "brush" | "lasso" | "polygon" | "spline";

interface PersonaSettings_Brush__Props {
  brushMode: BrushMode;
  onBrushModeChange: (mode: BrushMode) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  brushHardness: number;
  onBrushHardnessChange: (hardness: number) => void;
  brushOpacity: number;
  onBrushOpacityChange: (opacity: number) => void;
  brushColor: string;
  onBrushColorChange: (color: string) => void;
  swapMouseClicks: boolean;
  onSwapMouseClicksChange: (val: boolean) => void;
  grayscalemode: boolean;
  onClearLayer?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  splineCurviness?: number;
  onSplineCurvinessChange?: (val: number) => void;
}

export default function PersonaSettings_Brush({
  brushMode,
  onBrushModeChange,
  brushSize,
  onBrushSizeChange,
  brushHardness,
  onBrushHardnessChange,
  brushOpacity,
  onBrushOpacityChange,
  brushColor,
  onBrushColorChange,
  swapMouseClicks = false,
  onSwapMouseClicksChange,
  grayscalemode,
  onClearLayer,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  splineCurviness = 0.5,
  onSplineCurvinessChange,
}: PersonaSettings_Brush__Props) {
  return (
    <>
      {/* Column 1: Quick Actions (Top) & Drawing Mode (Bottom) */}
      <div
        className="grid grid-cols-2 grid-rows-2 items-center p-1 rounded-lg select-none gap-1 border border-[#2b2b2b] aspect-video h-full"
        title="Quick Actions: Undo, Redo, Clear Layer, and Swap Clicks"
      >
        {/* Swap Clicks Toggle */}
        <button
          type="button"
          onClick={() => onSwapMouseClicksChange?.(!swapMouseClicks)}
          title="Swap left/right clicks: Swap drawing (paint/erase) mouse controls"
          className="w-full h-full flex items-center justify-center cursor-pointer rounded-md border border-[#2e2e2e] bg-[#191919] hover:bg-[#222222] hover:border-[#444] text-gray-300 hover:text-white transition-all focus:outline-none shadow-xs"
        >
          {swapMouseClicks ? (
            <Eraser className="h-4 w-4 shrink-0 text-amber-400" />
          ) : (
            <PaintRoller className="h-4 w-4 shrink-0 text-sky-400" />
          )}
        </button>

        {/* Clear Layer Button (Repair Persona) OR Color Picker (Color Persona) */}
        {grayscalemode ? (
          <button
            type="button"
            onClick={() => onClearLayer?.()}
            title="Clear Repair / Erase Layer"
            className="w-full h-full flex items-center justify-center cursor-pointer rounded-md border border-[#2e2e2e] bg-[#191919] hover:bg-[#252525] hover:border-red-500/60 text-gray-300 hover:text-red-400 transition-all focus:outline-none shadow-xs"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
          </button>
        ) : (
          <div
            className="w-full h-full relative rounded-md border border-[#2e2e2e] bg-[#191919] hover:bg-[#222222] hover:border-[#444] overflow-hidden cursor-pointer transition-all flex items-center justify-center shadow-xs"
            title="Brush Color"
          >
            <div
              className="w-4 h-4 rounded-full border border-white/20 shadow-xs pointer-events-none z-10"
              style={{ backgroundColor: brushColor }}
            />
            <input
              type="color"
              value={brushColor}
              onChange={(e) => onBrushColorChange?.(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </div>
        )}
        
        {/* Undo Button */}
        <button
          type="button"
          onClick={() => onUndo?.()}
          disabled={!canUndo}
          title="Undo stroke (Ctrl+Z)"
          className={`w-full h-full flex items-center justify-center cursor-pointer rounded-md border border-[#2e2e2e] bg-[#191919] transition-all focus:outline-none shadow-xs ${
            canUndo
              ? "hover:bg-[#222222] text-gray-300 hover:text-white hover:border-[#444]"
              : "opacity-35 cursor-not-allowed text-gray-600 border-[#222]"
          }`}
        >
          <Undo2 className="h-4 w-4 shrink-0" />
        </button>

        {/* Redo Button */}
        <button
          type="button"
          onClick={() => onRedo?.()}
          disabled={!canRedo}
          title="Redo stroke (Ctrl+Y / Ctrl+Shift+Z)"
          className={`w-full h-full flex items-center justify-center cursor-pointer rounded-md border border-[#2e2e2e] bg-[#191919] transition-all focus:outline-none shadow-xs ${
            canRedo
              ? "hover:bg-[#222222] text-gray-300 hover:text-white hover:border-[#444]"
              : "opacity-35 cursor-not-allowed text-gray-600 border-[#222]"
          }`}
        >
          <Redo2 className="h-4 w-4 shrink-0" />
        </button>
      </div>


      <div
        title="Drawing Mode: Paint, erase, or fill a region with a lasso or polygon"

        className="grid grid-cols-2 grid-rows-2 items-center p-1 bg-[#111111] rounded-lg select-none gap-1 border border-[#2b2b2b] aspect-square"
      >
        <button
          type="button"
          onClick={() => onBrushModeChange?.("brush")}
          title="Draw Brush"
          className={`h-full flex items-center justify-center rounded-md cursor-pointer transition-all focus:outline-none ${brushMode === "brush"
            ? "bg-white text-black font-bold shadow-md shadow-white/10"
            : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
            }`}
        >
          <Brush className="h-3.5 w-3.5 shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => onBrushModeChange?.("lasso")}
          title="Lasso Fill"
          className={`h-full flex items-center justify-center rounded-sm cursor-pointer transition-all focus:outline-none ${brushMode === "lasso"
            ? "bg-white text-black font-bold shadow-md shadow-white/10"
            : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
            }`}
        >
          <Circle className="h-3.5 w-3.5 shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => onBrushModeChange?.("polygon")}
          title="Polygon Fill"
          className={`h-full flex items-center justify-center rounded-sm cursor-pointer transition-all focus:outline-none ${brushMode === "polygon"
            ? "bg-white text-black font-bold shadow-md shadow-white/10"
            : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
            }`}
        >
          <Triangle className="h-3.5 w-3.5 shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => onBrushModeChange?.("spline")}
          title="Spline Curve Fill"
          className={`h-full flex items-center justify-center rounded-sm cursor-pointer transition-all focus:outline-none ${brushMode === "spline"
            ? "bg-white text-black font-bold shadow-md shadow-white/10"
            : "text-gray-400 hover:text-gray-200 hover:bg-[#1f1f1f]"
            }`}
        >
          <Spline className="h-3.5 w-3.5 shrink-0" />
        </button>
      </div>

      {/* Column 2: Size & Hardness Sliders */}
      <div className="flex flex-col justify-between h-full py-0.5">
        <Slider
          step={1}
          label="Size"
          min={2}
          max={120}
          value={brushSize}
          onChange={(v) => onBrushSizeChange?.(v)}
          title="Brush Size: Diameter of the paint/eraser brush in pixels."
        />

        <Slider
          label="Hardness"
          min={0.0}
          max={1.0}
          step={0.05}
          value={brushHardness}
          onChange={(v) => onBrushHardnessChange?.(v)}
          title="Brush Hardness: Edge softness of the brush."
        />
      </div>

      {/* Column 3: Opacity & Spline Curviness Sliders */}
      <div className="flex flex-col justify-between h-full py-0.5">
        <Slider
          label="Opacity"
          min={0.05}
          max={1.0}
          step={0.05}
          value={brushOpacity}
          onChange={(v) => onBrushOpacityChange?.(v)}
          title="Brush Opacity: Mask drawing layer opacity level."
        />
          <Slider
            label="Curviness"
            min={0.0}
            max={1.0}
            step={0.05}
            value={splineCurviness}
            onChange={(v) => onSplineCurvinessChange?.(v)}
            title="Spline Curviness: Tension of the Catmull-Rom spline curve (0.0 = sharp, 0.5 = smooth, 1.0 = loose curve)."
            disabled={brushMode !== "spline"}
          />
      </div>
    </>
  );
}