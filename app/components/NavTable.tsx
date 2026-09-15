"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MetaFile, ApiResponse_folder, UserAccount } from "@/app/types";
import { useAuth } from "@/app/lib/auth-context";
import { deriveTaskStatus } from "@/app/lib/task-status";
import { deriveFolderTaskStatus, getAssigneeColorStyle } from "./NavTable/utils";
import NavHeader from "./NavTable/NavHeader";
import NavListTable from "./NavTable/NavListTable";
import NavSelectionBar from "./NavTable/NavSelectionBar";

export { deriveTaskStatus, deriveFolderTaskStatus, getAssigneeColorStyle };

export interface NavTableProps {
  metafileList: MetaFile[];
  folderData: ApiResponse_folder;
  selectedImageName: string;
  onSelectImage: (id: string) => void;
  onSelectFolder: (folderPath: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  sidebarWidth: number;
  onSidebarWidthChange?: (width: number) => void;
  minSidebarWidth?: number;
  selectedFileNames?: string[];
  onToggleSelectFileName?: (name: string) => void;
  selectedFolderPaths?: string[];
  onToggleSelectFolderPath?: (path: string) => void;
  onSelectAllFiles?: () => void;
  onClearSelectedFiles?: () => void;
  onSelectFlaggedFiles?: () => void;
  onSelectUnassignedFiles?: () => void;
  onInvertSelectedFiles?: () => void;
  onSelectAllFolders?: () => void;
  onClearSelectedFolders?: () => void;
  onSelectFlaggedFolders?: () => void;
  onSelectUnassignedFolders?: () => void;
  onInvertSelectedFolders?: () => void;
  listOnly?: boolean;
  flipResizeHandle?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  disableCollapse?: boolean;
  users?: UserAccount[];
}

export default function NavTable({
  metafileList,
  folderData,
  selectedImageName,
  onSelectImage,
  onSelectFolder,
  searchQuery,
  onSearchQueryChange,
  sidebarWidth,
  onSidebarWidthChange,
  minSidebarWidth = 240,
  selectedFileNames = [],
  onToggleSelectFileName,
  selectedFolderPaths = [],
  onToggleSelectFolderPath,
  onSelectAllFiles,
  onClearSelectedFiles,
  onSelectFlaggedFiles,
  onSelectUnassignedFiles,
  onInvertSelectedFiles,
  onSelectAllFolders,
  onClearSelectedFolders,
  onSelectFlaggedFolders,
  onSelectUnassignedFolders,
  onInvertSelectedFolders,
  flipResizeHandle = false,
  listOnly = false,
  onRefresh,
  isRefreshing = false,
  isCollapsed: propIsCollapsed = false,
  onToggleCollapse,
  disableCollapse = false,
  users = [],
}: NavTableProps) {
  const [localIsCollapsed, setLocalIsCollapsed] = useState<boolean>(false);
  const isNavCollapsed = !disableCollapse && (propIsCollapsed ?? localIsCollapsed);
  const setIsNavCollapsed = onToggleCollapse ?? setLocalIsCollapsed;

  const [localSidebarWidth, setLocalSidebarWidth] = useState<number>(240);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [selectionTargetMode, setSelectionTargetMode] = useState<"files" | "folders" | "both">("both");

  const resolvedSidebarWidth = sidebarWidth ?? localSidebarWidth;
  const setSidebarWidth = onSidebarWidthChange ?? setLocalSidebarWidth;
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(450);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (flipResizeHandle) {
        // Standard persona (left side): moving mouse to the right (positive deltaX) expands the width
        const deltaX = e.clientX - startXRef.current;
        const minWidth = minSidebarWidth;
        const maxWidth = Math.max(minSidebarWidth, Math.floor(window.innerWidth * 0.3));
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + deltaX));
        setSidebarWidth(Math.round(newWidth));
      } else {
        // Admin persona (right side): moving mouse to the left (negative deltaX) expands the width
        const deltaX = e.clientX - startXRef.current;
        const minWidth = Math.floor(window.innerWidth * 0.3);
        const maxWidth = Math.floor(window.innerWidth * 0.5);
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current - deltaX));
        setSidebarWidth(Math.round(newWidth));
      }
    },
    [flipResizeHandle, minSidebarWidth, setSidebarWidth]
  );

  useEffect(() => {
    const handleMouseUp = () => {
      stopResizing();
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, handleMouseMove, stopResizing]);

  const handleWidthResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = resolvedSidebarWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  const currentFolderPath = folderData.currentFolder.parent;
  const currentFolderBasename = folderData.currentFolder.basename;
  const parentFolderPath = folderData.parentFolder.parent;
  const parentFolderBasename = folderData.parentFolder.basename;
  const isRootDir = currentFolderPath === "";

  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const activeUserId = user?.id;
  const activeUserName = user?.name?.toLowerCase().trim();

  // Filter folders: If not admin, only show folders assigned to the user OR unassigned folders
  const filteredFolders = (folderData.childrenFolders || []).filter((f) => {
    const matchesSearch = (f.basename ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (isAdmin) return true;

    const folderMeta = folderData.metafolders?.[f.basename];
    if (!folderMeta || !folderMeta.assignedTo) {
      return true; // Unassigned folder
    }
    return (
      folderMeta.assignedTo === activeUserId ||
      (activeUserName && folderMeta.assignedToName?.toLowerCase().trim() === activeUserName)
    );
  });

  // Filter files: If not admin, only show files assigned to the user OR unassigned files
  const authorizedMetafileList = metafileList.filter((m) => {
    if (isAdmin) return true;
    if (!m.assignedTo && !m.assignedToName) {
      return true; // Unassigned file
    }
    return (
      m.assignedTo === activeUserId ||
      (activeUserName && m.assignedToName?.toLowerCase().trim() === activeUserName)
    );
  });

  // Mode-aware Selection Actions
  const handleSelectAllByMode = () => {
    if (selectionTargetMode === "files" || selectionTargetMode === "both") {
      onSelectAllFiles?.();
    }
    if (selectionTargetMode === "folders" || selectionTargetMode === "both") {
      if (onSelectAllFolders) {
        onSelectAllFolders();
      } else if (onToggleSelectFolderPath) {
        filteredFolders.forEach((f) => {
          if (!selectedFolderPaths.includes(f.parent)) {
            onToggleSelectFolderPath(f.parent);
          }
        });
      }
    }
  };

  const handleSelectUnassignedByMode = () => {
    if (selectionTargetMode === "files" || selectionTargetMode === "both") {
      onSelectUnassignedFiles?.();
    }
    if (selectionTargetMode === "folders" || selectionTargetMode === "both") {
      if (onSelectUnassignedFolders) {
        onSelectUnassignedFolders();
      } else if (onToggleSelectFolderPath) {
        filteredFolders.forEach((f) => {
          const m = folderData.metafolders?.[f.basename];
          const folderStatus = deriveFolderTaskStatus(m);
          const isUnassigned = folderStatus === "unassigned" && !m?.assignedTo && !m?.assignedToName;
          const isSelected = selectedFolderPaths.includes(f.parent);
          if (isUnassigned && !isSelected) {
            onToggleSelectFolderPath(f.parent);
          } else if (!isUnassigned && isSelected && selectionTargetMode === "folders") {
            onToggleSelectFolderPath(f.parent);
          }
        });
      }
    }
  };

  const handleSelectFlaggedByMode = () => {
    if (selectionTargetMode === "files" || selectionTargetMode === "both") {
      onSelectFlaggedFiles?.();
    }
    if (selectionTargetMode === "folders" || selectionTargetMode === "both") {
      if (onSelectFlaggedFolders) {
        onSelectFlaggedFolders();
      } else if (onToggleSelectFolderPath) {
        filteredFolders.forEach((f) => {
          const m = folderData.metafolders?.[f.basename];
          const folderStatus = deriveFolderTaskStatus(m);
          const isFlagged =
            folderStatus === "progressing" ||
            folderStatus === "commented" ||
            Boolean(m?.assignedTo || m?.assignedToName);
          const isSelected = selectedFolderPaths.includes(f.parent);
          if (isFlagged && !isSelected) {
            onToggleSelectFolderPath(f.parent);
          } else if (!isFlagged && isSelected && selectionTargetMode === "folders") {
            onToggleSelectFolderPath(f.parent);
          }
        });
      }
    }
  };

  const handleInvertByMode = () => {
    if (selectionTargetMode === "files" || selectionTargetMode === "both") {
      onInvertSelectedFiles?.();
    }
    if (selectionTargetMode === "folders" || selectionTargetMode === "both") {
      if (onInvertSelectedFolders) {
        onInvertSelectedFolders();
      } else if (onToggleSelectFolderPath) {
        filteredFolders.forEach((f) => {
          onToggleSelectFolderPath(f.parent);
        });
      }
    }
  };

  const handleClearByMode = () => {
    if (selectionTargetMode === "files") {
      onClearSelectedFiles
        ? onClearSelectedFiles()
        : selectedFileNames.forEach((f) => onToggleSelectFileName?.(f));
    } else if (selectionTargetMode === "folders") {
      if (onClearSelectedFolders) {
        onClearSelectedFolders();
      } else if (onToggleSelectFolderPath) {
        selectedFolderPaths.forEach((p) => onToggleSelectFolderPath(p));
      }
    } else {
      onClearSelectedFiles?.();
      if (onClearSelectedFolders) {
        onClearSelectedFolders();
      }
    }
  };

  return (
    <>
      {isNavCollapsed ? (
        <div
          onClick={() => setIsNavCollapsed(false)}
          className="w-3 h-full bg-[#1b1b1b] hover:bg-[#252525] border-r border-[#2d2d2d] cursor-pointer flex items-center justify-center transition-colors group/expand shrink-0 self-stretch z-20"
          title="Click to expand catalog navigator"
        >
          <div className="w-1 h-24 rounded-full bg-[#3a3a3a] group-hover/expand:bg-[#0096ff] transition-colors" />
        </div>
      ) : (
        <aside
          aria-label="Catalog Navigator"
          style={{ width: `${resolvedSidebarWidth}px` }}
          className={`relative flex flex-col ${flipResizeHandle ? "border-r" : "border-l"
            } border-[#2b2b2b] bg-[#181818] h-full shrink-0 select-none overflow-hidden`}
        >
          {/* Drag Resize Handle */}
          <div
            onMouseDown={handleWidthResizeStart}
            className={`absolute top-0 ${flipResizeHandle ? "right-0" : "left-0"
              } w-0.5 h-full cursor-ew-resize hover:bg-[#0096ff] transition-colors z-10`}
          />

          {/* Left Collapse Handle Tab (Disabled in Admin persona) */}
          {!disableCollapse && (
            <button
              type="button"
              onClick={() => setIsNavCollapsed(true)}
              title="Collapse catalog navigator"
              className="absolute top-0 left-0 bottom-0 w-3 hover:bg-[#252525]/50 cursor-pointer flex items-center justify-center transition-colors group/expand z-30"
            >
              <div className="h-24 w-1 rounded-full bg-[#3a3a3a] group-hover/collapse:bg-[#0096ff] transition-colors" />
            </button>
          )}

          <div className={`flex flex-col h-full overflow-hidden `}>
            {/* Header: Search & Navigation */}
            <NavHeader
              folderData={folderData}
              currentFolderPath={currentFolderPath}
              currentFolderBasename={currentFolderBasename}
              parentFolderPath={parentFolderPath}
              parentFolderBasename={parentFolderBasename}
              isRootDir={isRootDir}
              searchQuery={searchQuery}
              onSearchQueryChange={onSearchQueryChange}
              onSelectFolder={onSelectFolder}
              onRefresh={onRefresh}
              isRefreshing={isRefreshing}
            />

            {/* List Table: Folders & Files */}
            <div className="flex-1 overflow-y-auto min-h-0 select-none custom-scrollbar p-2">
              <NavListTable
                filteredFolders={filteredFolders}
                folderData={folderData}
                authorizedMetafileList={authorizedMetafileList}
                selectedImageName={selectedImageName}
                selectedFileNames={selectedFileNames}
                selectedFolderPaths={selectedFolderPaths}
                listOnly={listOnly}
                users={users}
                onSelectFolder={onSelectFolder}
                onSelectImage={onSelectImage}
                onToggleSelectFolderPath={onToggleSelectFolderPath}
                onToggleSelectFileName={onToggleSelectFileName}
              />
            </div>

            {/* Bottom Selection Assistance Toolbar */}
            {!flipResizeHandle && (
              <NavSelectionBar
                selectionTargetMode={selectionTargetMode}
                setSelectionTargetMode={setSelectionTargetMode}
                selectedFileNames={selectedFileNames}
                selectedFolderPaths={selectedFolderPaths}
                totalFilesCount={metafileList.length}
                totalFoldersCount={filteredFolders.length}
                listOnly={listOnly}
                onSelectAllByMode={handleSelectAllByMode}
                onInvertByMode={handleInvertByMode}
                onSelectUnassignedByMode={handleSelectUnassignedByMode}
                onSelectFlaggedByMode={handleSelectFlaggedByMode}
                onClearByMode={handleClearByMode}
              />
            )}
          </div>
        </aside>
      )}
    </>
  );
}
