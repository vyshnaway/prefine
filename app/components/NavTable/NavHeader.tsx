import React, { useRef, useEffect, useState } from "react";
import { Folder, Search, X, Home, ArrowLeft, RefreshCw, ChevronDown } from "lucide-react";
import { ApiResponse_folder } from "@/app/types";

interface NavHeaderProps {
  folderData: ApiResponse_folder;
  currentFolderPath: string;
  currentFolderBasename: string;
  parentFolderPath: string;
  parentFolderBasename: string;
  isRootDir: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSelectFolder: (folderPath: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function NavHeader({
  folderData,
  currentFolderPath,
  currentFolderBasename,
  parentFolderPath,
  parentFolderBasename,
  isRootDir,
  searchQuery,
  onSearchQueryChange,
  onSelectFolder,
  onRefresh,
  isRefreshing = false,
}: NavHeaderProps) {
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState<boolean>(false);
  const folderDropdownRef = useRef<HTMLDivElement>(null);

  // Close folder dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(e.target as Node)) {
        setIsFolderDropdownOpen(false);
      }
    };
    if (isFolderDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFolderDropdownOpen]);

  return (
    <div className="p-2 border-b border-[#2b2b2b] bg-[#141414] flex flex-col gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {isSearching ? (
          <div className="relative flex-1 flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search files..."
              autoFocus
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-md pl-2 pr-7 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#0096ff]"
            />
            <button
              type="button"
              onClick={() => {
                onSearchQueryChange("");
                setIsSearching(false);
              }}
              className="absolute right-1.5 p-0.5 text-gray-400 hover:text-white rounded"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onSelectFolder("")}
              className="p-1.5 text-[#808080] hover:text-white hover:bg-[#2b2b2b] rounded-md transition-colors cursor-pointer shrink-0"
              title="Go to root catalog"
            >
              <Home className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onSelectFolder(parentFolderPath)}
              className={`p-1.5 text-[#808080] hover:text-white hover:bg-[#2b2b2b] rounded-md transition-colors cursor-pointer shrink-0 ${
                isRootDir ? "opacity-50 cursor-not-allowed" : ""
              }`}
              title={`Go to parent: ${parentFolderBasename || "/"}`}
              disabled={isRootDir}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>

            {/* Beautified Custom Folder Dropdown */}
            <div className="relative flex-1 min-w-0" ref={folderDropdownRef}>
              <button
                type="button"
                onClick={() => setIsFolderDropdownOpen((prev) => !prev)}
                className={`w-full flex items-center justify-between gap-1.5 bg-[#1a1a1a] hover:bg-[#222222] border ${
                  isFolderDropdownOpen
                    ? "border-[#0096ff] ring-1 ring-[#0096ff]/30"
                    : "border-[#2d2d2d] hover:border-[#3d3d3d]"
                } rounded-md px-2.5 py-1 text-xs text-gray-200 font-semibold cursor-pointer transition-all shadow-xs min-w-0`}
                title={`Current Folder: ${currentFolderBasename || "/"}`}
              >
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  {isRootDir ? (
                    <Home className="h-3.5 w-3.5 text-amber-500/40 shrink-0 fill-amber-500/10" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 text-amber-500/90 shrink-0 fill-amber-500/10" />
                  )}
                  <span className="truncate text-xs font-semibold text-gray-200">
                    {currentFolderBasename || "/"}
                  </span>
                </div>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform duration-200 ${
                    isFolderDropdownOpen ? "rotate-180 text-[#0096ff]" : ""
                  }`}
                />
              </button>

              {/* Dropdown Menu Popover */}
              {isFolderDropdownOpen && !isRootDir && (
                <div className="absolute left-0 top-[calc(100%+4px)] w-full min-w-[200px] max-h-64 bg-[#181818]/95 backdrop-blur-md border border-[#333333] rounded-lg shadow-2xl py-1 z-50 overflow-y-auto custom-scrollbar flex flex-col divide-y divide-[#262626]/60">
                  <div className="flex flex-col py-0.5">
                    {folderData.siblingFolders.map((f, idx) => {
                      const fPath = f?.parent ?? "";
                      const fName = f?.basename ?? fPath;
                      const isCurrent = fPath === currentFolderPath;

                      return (
                        <button
                          key={fPath || idx}
                          type="button"
                          onClick={() => {
                            onSelectFolder(fPath);
                            setIsFolderDropdownOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[#252525] cursor-pointer ${
                            isCurrent
                              ? "bg-[#0096ff]/15 text-[#0096ff] font-bold"
                              : "text-gray-300 font-medium"
                          }`}
                        >
                          <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0 fill-amber-500/10" />
                          <span className="truncate flex-1 font-mono text-[11px]">{fName}</span>
                          {isCurrent && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0096ff] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsSearching(true)}
              className="p-1.5 text-[#808080] hover:text-white hover:bg-[#2b2b2b] rounded-md transition-colors cursor-pointer shrink-0"
              title="Search files"
            >
              <Search className="h-3.5 w-3.5" />
            </button>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className={`p-1.5 text-[#808080] hover:text-white hover:bg-[#2b2b2b] rounded-md transition-colors cursor-pointer shrink-0 ${
                  isRefreshing ? "opacity-50 cursor-not-allowed" : ""
                }`}
                title="Refresh folder data"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-[#0096ff]" : ""}`}
                />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
