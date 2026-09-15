import React, { useState } from "react";
import {
  ChevronLeftIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronRightIcon,
  Upload,
  Play,
  Pause,
  Flag,
  AlertTriangle,
  Loader2,
  SaveAllIcon,
} from "lucide-react";

interface FolderNavBarProps {
  onPrevFolder: () => void;
  onNextFolder: () => void;
  onPrevImage: () => void;
  onNextImage: () => void;
  onExport: () => void;
  onSaveLayers: () => void;
  onClearIssues: () => void;
  isAutoplay: boolean;
  onToggleAutoplay: () => void;
  autoplayInterval: number;
  onAutoplayIntervalChange: (interval: number) => void;
  hasMultipleFolders: boolean;
  hasMultipleImages: boolean;
  hasActiveImage: boolean;
  activeImageIssues: string[];
  activeImageName: string;
  sidebarWidth: number;
  minSidebarWidth?: number;
  isSidebarCollapsed: boolean;
  inspectorWidth: number;
  isInspectorCollapsed: boolean;
  isExporting: boolean;
  isSavingLayers?: boolean;
}

export default function ButtonBar({
  onPrevFolder,
  onNextFolder,
  onPrevImage,
  onNextImage,
  onExport,
  onSaveLayers,
  onClearIssues,
  isAutoplay,
  onToggleAutoplay,
  autoplayInterval,
  onAutoplayIntervalChange,
  hasMultipleFolders = false,
  hasMultipleImages = false,
  hasActiveImage = false,
  activeImageIssues = [],
  activeImageName = "",
  sidebarWidth = 240,
  minSidebarWidth = 240,
  isSidebarCollapsed = false,
  inspectorWidth = 335,
  isInspectorCollapsed = false,
  isExporting = false,
  isSavingLayers = false,
}: FolderNavBarProps) {
  const hasIssues = activeImageIssues.length > 0;
  const canAct = hasActiveImage && !isExporting;

  return (
    <div className="w-full z-20 flex items-center justify-between bg-[#1c1c1c] border-t border-[#2d2d2d] rounded-none overflow-hidden shadow-md select-none shrink-0 h-12">
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee-custom {
          display: inline-flex;
          gap: 2rem;
          animation: marquee-scroll 12s linear infinite;
        }
        .animate-marquee-custom:hover {
          animation-play-state: paused;
        }
      `}} />

      {/* LEFT COLUMN: Combined Autoplay Buttons (Matches NavPanal width) */}
      <div
        className="h-full flex items-center overflow-hidden shrink-0 transition-all duration-75 border-r border-[#2d2d2d]"
        style={{ width: isSidebarCollapsed ? "12px" : `${Math.max(sidebarWidth, minSidebarWidth)}px` }}
      >
        <div className="w-full h-full flex items-center">
          {/* 1. Autoplay Play/Pause Toggle Button */}
          <button
            type="button"
            onClick={onToggleAutoplay}
            disabled={!hasActiveImage}
            className={`h-full border-r border-[#2d2d2d] flex-1 flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none select-none text-xs font-bold ${isAutoplay
              ? "bg-[#0096ff] text-white hover:bg-[#0082e6]"
              : "text-[#c0c0c0] hover:bg-[#252525]"
              }`}
            title={isAutoplay ? "Pause Autoplay Loop" : "Play Autoplay Loop"}
          >
            <span>Autoplay</span>
            {isAutoplay ? (
              <Pause className="h-3.5 w-3.5 fill-current text-white shrink-0 ml-1.5" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current text-[#0096ff] shrink-0 ml-1.5" />
            )}
          </button>

          {/* 2. Autoplay Speed Input (Micro-stepper) */}
          <div className="h-full flex-1 flex items-center justify-center shrink-0 px-2">
            <div className="flex items-center bg-[#111111] border border-[#2d2d2d] rounded-md overflow-hidden h-7 select-none shadow-inner">
              {/* Decrement Button */}
              <button
                type="button"
                onClick={() => {
                  const currentVal = autoplayInterval / 1000;
                  const newVal = Math.max(0.2, Math.round((currentVal - 0.1) * 10) / 10);
                  onAutoplayIntervalChange(newVal * 1000);
                }}
                className="h-full px-2 text-[#808080] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer text-xs font-bold font-mono"
                title="Decrease speed"
              >
                -
              </button>

              {/* Divider */}
              <div className="h-3.5 w-px bg-[#2d2d2d]" />

              {/* Stepper Value Input */}
              <div className="flex items-center justify-center pl-1 bg-transparent">
                <input
                  type="number"
                  min="0.2"
                  max="10"
                  step="0.1"
                  value={autoplayInterval / 1000}
                  onChange={(e) => onAutoplayIntervalChange(Math.round(Number(e.target.value) * 1000))}
                  className="w-8 text-center text-[11px] font-mono font-bold text-gray-300 bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  title="Autoplay speed in seconds (0.2s - 10s)"
                />
                <span className="text-[10px] text-gray-500 font-mono pr-1.5 select-none font-bold">s</span>
              </div>

              {/* Increment Button */}
              <button
                type="button"
                onClick={() => {
                  const currentVal = autoplayInterval / 1000;
                  const newVal = Math.min(10, Math.round((currentVal + 0.1) * 10) / 10);
                  onAutoplayIntervalChange(newVal * 1000);
                }}
                className="h-full px-2 text-[#808080] hover:text-white hover:bg-[#202020] transition-colors cursor-pointer text-xs font-bold font-mono"
                title="Increase speed"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE COLUMN: Image/Folder navigation (Matches Main Workspace / Canvas area) */}
      <div className="h-full flex-1 min-w-0 flex items-center justify-center bg-[#333333]">
        {/* 3. Previous Folder */}
        <button
          type="button"
          onClick={onPrevFolder}
          disabled={!hasMultipleFolders}
          className="h-full border-r border-[#2d2d2d] flex-[0.8] flex items-center justify-center gap-1.5 text-xs font-bold text-[#c0c0c0] hover:text-white hover:bg-[#252525] disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer select-none"
          title="Navigate to Previous Folder"
        >
          <ChevronsLeftIcon className="h-4 w-4 text-gray-400 shrink-0" />
        </button>

        {/* 4. Previous Image */}
        <button
          type="button"
          onClick={onPrevImage}
          disabled={!hasMultipleImages}
          className="h-full border-r border-[#2d2d2d] flex-[0.8] flex items-center justify-center gap-1.5 text-xs font-bold text-[#c0c0c0] hover:text-white hover:bg-[#252525] disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer select-none"
          title="Select Previous Image in Folder"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        </button>

        {/* 5. Active Filename Display (with marquee overflow) */}
        <div className="h-full bg-[#444444] w-76.75 flex items-center overflow-hidden shrink-0 select-text relative">
          <div className="w-full overflow-hidden whitespace-nowrap px-3 text-xs font-mono font-semibold text-gray-400">
            {activeImageName ? (
              activeImageName.length > 28 ? (
                <div className="animate-marquee-custom">
                  <span>{activeImageName}</span>
                  <span aria-hidden="true" className="text-[#0096ff] font-bold px-1">//</span>
                  <span>{activeImageName}</span>
                </div>
              ) : (
                <div className="w-full text-center truncate">{activeImageName}</div>
              )
            ) : (
              <span className="text-gray-600 italic text-center block w-full">No active file</span>
            )}
          </div>
        </div>

        {/* 6. Next Image */}
        <button
          type="button"
          onClick={onNextImage}
          disabled={!hasMultipleImages}
          className="h-full border-l border-r border-[#2d2d2d] flex-[0.8] flex items-center justify-center gap-1.5 text-xs font-bold text-[#c0c0c0] hover:text-white hover:bg-[#252525] disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer select-none"
        >
          <ChevronRightIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        </button>

        {/* 6. Next Folder */}
        <button
          type="button"
          onClick={onNextFolder}
          disabled={!hasMultipleFolders}
          className="h-full flex-[0.8] flex items-center justify-center gap-1.5 text-xs font-bold text-[#c0c0c0] hover:text-white hover:bg-[#252525] disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer select-none"
          title="Navigate to Next Folder"
        >
          <ChevronsRightIcon className="h-4 w-4 text-gray-400 shrink-0" />
        </button>
      </div>

      {/* RIGHT COLUMN: Save Sidecar & Checked/Export (Matches Right Sidebar width) */}
      <div
        className="h-full flex items-center overflow-hidden shrink-0 transition-all duration-75 border-l border-[#2d2d2d]"
        style={{ width: isInspectorCollapsed ? "220px" : `${inspectorWidth}px` }}
      >
        <div className="w-full h-full flex items-center">
          {/* 7. Save Layer Data to Sidecar */}
          <div className="h-full border-r border-[#2d2d2d] flex-1 relative flex items-stretch justify-stretch">
            <button
              type="button"
              onClick={onSaveLayers}
              disabled={!hasActiveImage || isSavingLayers}
              className="w-full h-full flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer select-none text-[#c0c0c0] hover:text-white hover:bg-[#252525] disabled:opacity-20 disabled:pointer-events-none"
              title="Save current mask and brush layers to sidecar file (.json)"
            >
              {isSavingLayers ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#0096ff]" />
              ) : (
                <SaveAllIcon className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              )}
              <span>{isSavingLayers ? "..." : "Save"}</span>
            </button>
          </div>

          {/* 8. Dynamic Action Button */}
          <button
            type="button"
            onClick={hasIssues ? onClearIssues : onExport}
            disabled={!canAct}
            className={`h-full flex-1 flex items-center justify-center gap-1.5 text-xs font-bold transition-all cursor-pointer select-none ${hasIssues
                ? "bg-red-500/20 hover:bg-red-500/30 text-red-400 border-l border-red-500/30 shadow-xs"
                : "bg-[#0096ff] hover:bg-[#0082e6] text-white shadow-sm"
              } disabled:opacity-25 disabled:pointer-events-none`}
            title={
              hasIssues
                ? `Click to clear ${activeImageIssues.length} issue(s) and mark as resolved`
                : "All issues clear: Export processed output image"
            }
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : hasIssues ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400 fill-red-400/20" />
            ) : (
              <Upload className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {isExporting
                ? "Exporting..."
                : hasIssues
                  ? "Resolve"
                  : "Export"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
