import React from "react";

interface NavSelectionBarProps {
  selectionTargetMode: "files" | "folders" | "both";
  setSelectionTargetMode: (mode: "files" | "folders" | "both") => void;
  selectedFileNames: string[];
  selectedFolderPaths: string[];
  totalFilesCount: number;
  totalFoldersCount: number;
  listOnly?: boolean;
  onSelectAllByMode: () => void;
  onInvertByMode: () => void;
  onSelectUnassignedByMode: () => void;
  onSelectFlaggedByMode: () => void;
  onClearByMode: () => void;
}

export default function NavSelectionBar({
  selectionTargetMode,
  setSelectionTargetMode,
  selectedFileNames,
  selectedFolderPaths,
  totalFilesCount,
  totalFoldersCount,
  listOnly = false,
  onSelectAllByMode,
  onInvertByMode,
  onSelectUnassignedByMode,
  onSelectFlaggedByMode,
  onClearByMode,
}: NavSelectionBarProps) {
  return (
    <div className="h-20 p-2 border-t border-[#2b2b2b] bg-[#141414] flex flex-col gap-2 shrink-0 select-none">
      {/* Mode Switcher [files] [folders] [both] & Stats Count */}
      <div className="flex items-center justify-between gap-2">
        {/* Segmented Switcher */}
        <div className="flex items-center bg-[#0d0d0d] p-0.5 rounded border border-[#2b2b2b]">
          {(["files", "folders", "both"] as const).map((mode) => {
            const isActive = selectionTargetMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSelectionTargetMode(mode)}
                className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded cursor-pointer transition-all ${
                  isActive
                    ? "bg-white text-black shadow-xs font-bold"
                    : "text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]"
                }`}
              >
                {mode}
              </button>
            );
          })}
        </div>

        {/* Selected Count Indicator */}
        <div className="text-[10px] font-mono text-gray-400 text-right truncate">
          {selectionTargetMode === "files" && (
            <span>
              <strong className="text-white">{selectedFileNames.length}</strong> / {totalFilesCount} files
            </span>
          )}
          {selectionTargetMode === "folders" && (
            <span>
              <strong className="text-white">{selectedFolderPaths.length}</strong> / {totalFoldersCount} folders
            </span>
          )}
          {selectionTargetMode === "both" && (
            <span>
              <strong className="text-white">{selectedFileNames.length}</strong> files •{" "}
              <strong className="text-white">{selectedFolderPaths.length}</strong> folders
            </span>
          )}
        </div>
      </div>

      {!listOnly && (
        <div className="w-full flex items-center gap-1">
          {[
            {
              text: "All",
              handle: onSelectAllByMode,
            },
            {
              text: "Invert",
              handle: onInvertByMode,
            },
            {
              text: "Unassigned",
              handle: onSelectUnassignedByMode,
            },
            {
              text: "Flagged",
              handle: onSelectFlaggedByMode,
            },
            {
              text: "Clear",
              handle: onClearByMode,
            },
          ].map((btn, i) => {
            return (
              <button
                key={i}
                type="button"
                onClick={btn.handle}
                className="bg-[#202020] hover:bg-[#282828] text-gray-300 hover:text-white border border-[#333] hover:border-[#0096ff] rounded text-[10px] font-bold transition-all text-center cursor-pointer truncate w-full py-1 px-1"
                title={`${btn.text} (${selectionTargetMode})`}
              >
                {btn.text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
