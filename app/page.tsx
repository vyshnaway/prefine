"use client";

// ============================================================================
// IMPORTS
// ============================================================================

import NavTable, { deriveTaskStatus } from "./components/NavTable";
import ButtonBar from "./components/ButtonBar";
import Inspector from "./components/Inspector";
import HeaderToolbar from "./components/HeaderToolbar";
import PreviewWorkspace from "./components/PreviewWorkspace";
import TeamSidebar from "./components/TeamSidebar";
import { useCatalogSelection } from "./hooks/useCatalogSelection";
import { useTeamManagement } from "./hooks/useTeamManagement";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ApiResponse_folder,
  MetaFile,
  ImgData,
  ImgJsonBlob,
  ApiRequest_export,
  PERSONA,
  DEFAULT_INSPECTOR_ISSUE_TAGS,
  PERSONALSIT,
  FileToolbarSettings,
  UserAccount,
  RoleDefinition,
} from "./types";
import { DEFAULT_USERS, DEFAULT_ROLES } from "./lib/pocketbase";
import {
  PersistedToolbarSettings,
  TOOLBAR_DEFAULTS,
  resolveFileToolbarSettings,
} from "./components/HeaderToolbar/states";
import LoginModal from "./components/Auth/LoginModal";
import { useAuth } from "./lib/auth-context";

// ============================================================================
// HELPER HOOK: FolderNavigation
// ----------------------------------------------------------------------------
// Provides prev/next image navigation plus an autoplay timer that cycles
// through the current image list. Internal state is mirrored into refs so
// the interval callback always reads fresh values without needing to be
// torn down and restarted on every render (only `isAutoplay` /
// `autoplayInterval` changes restart the timer).
// ============================================================================

function FolderNavigation(
  images: MetaFile[],
  originalImage: ImgData | null,
  onSelectImage?: (name: string) => void,
  isAutoplay: boolean = false,
  setIsAutoplay?: (val: boolean) => void,
  autoplayInterval: number = 1000,
) {
  // --- Refs mirroring the latest props ---------------------------------
  // Keep mutable refs so the interval callback always reads the latest
  // values without needing to restart the interval on every render.
  const imagesRef = useRef(images);
  const originalImageRef = useRef(originalImage);
  const onSelectImageRef = useRef(onSelectImage);

  imagesRef.current = images;
  originalImageRef.current = originalImage;
  onSelectImageRef.current = onSelectImage;

  // --- Manual navigation -------------------------------------------------

  /** Select the image immediately before the current one (wraps around). */
  const handlePrevImage = () => {
    if (!onSelectImage || images.length === 0) return;
    const currentIdx = images.findIndex((img) => img.name === originalImage?.metadata.name);
    const prevIdx = currentIdx > 0 ? currentIdx - 1 : images.length - 1;
    onSelectImage(images[prevIdx].name);
  };

  /** Select the image immediately after the current one (wraps around). */
  const handleNextImage = () => {
    if (!onSelectImage || images.length === 0) return;
    const currentIdx = images.findIndex((img) => img.name === originalImage?.metadata.name);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % images.length : 0;
    onSelectImage(images[nextIdx].name);
  };

  // --- Autoplay timer ------------------------------------------------------
  // Only restart the interval when isAutoplay or autoplayInterval changes.
  // The callback reads everything else from refs so stale closures are
  // avoided.
  useEffect(() => {
    if (!isAutoplay) return;

    const interval = setInterval(() => {
      const selectFn = onSelectImageRef.current;
      if (!selectFn) return;

      const currentImages = imagesRef.current;
      if (currentImages.length === 0) return;

      const currentIdx = currentImages.findIndex(
        (img) => img.name === originalImageRef.current?.metadata.name,
      );
      const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % currentImages.length : 0;
      selectFn(currentImages[nextIdx].name);
    }, autoplayInterval);

    return () => clearInterval(interval);
  }, [isAutoplay, autoplayInterval]);

  return {
    isAutoplay,
    setIsAutoplay,
    handlePrevImage,
    handleNextImage,
    hasMultipleImages: images.length > 1,
  };
}

/** Normalize a folder path to forward slashes with no leading/trailing slashes. */
function normalizeFolderPath(value?: string) {
  if (!value) return "";
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

// ============================================================================
// MAIN COMPONENT: App
// ============================================================================

export default function App() {
  const { isLoginModalOpen, closeLoginModal, role, user, isAuthenticated } = useAuth();
  const isAdmin = role === "admin" || user?.role === "admin";

  // --------------------------------------------------------------------
  // STATE: selection & navigation
  // --------------------------------------------------------------------
  const [selectedFileName, setSelectedImageId] = useState<string>("");
  const [availableFolderPaths, setAvailableFolderPaths] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [parentFolder, setParentFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Shared Date Range Filter State (Header Toolbar & TeamSidebar)
  const [isDateFilterEnabled, setIsDateFilterEnabled] = useState(true);
  const [includeNullDates, setIncludeNullDates] = useState(true);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // --------------------------------------------------------------------
  // STATE: remote data
  // --------------------------------------------------------------------
  const [activeImageLayers, setActiveImageLayers] = useState<ImgJsonBlob | null>(null);
  const [folderData, setFolderData] = useState<ApiResponse_folder>({
    metafiles: {},
    siblingFolders: [],
    childrenFolders: [],
    parentFolder: { basename: "", parent: "" },
    currentFolder: { basename: "", parent: "" },
  });

  // --------------------------------------------------------------------
  // STATE: async/UI flags
  // --------------------------------------------------------------------
  const [isDetectingObject, setIsDetectingObject] = useState<boolean>(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);
  const [isRefreshingFolder, setIsRefreshingFolder] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  /** Metafiles sorted alphanumerically for stable, natural-order display. */
  const metafileList: MetaFile[] = Object.keys(folderData.metafiles)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((key) => folderData.metafiles[key]);

  /**
   * Refetch folder catalog data for currentFolder.
   */
  const loadStorageImages = useCallback(async () => {
    try {
      setIsRefreshingFolder(true);
      const params = new URLSearchParams();
      if (currentFolder) params.set("folder", currentFolder);
      if (searchQuery) params.set("search", searchQuery);
      if (isDateFilterEnabled && startDate) {
        params.set("startDate", startDate);
      }
      if (isDateFilterEnabled && endDate) {
        params.set("endDate", endDate);
      }
      if (isDateFilterEnabled) {
        params.set("includeNullDates", String(includeNullDates));
      }
      const query = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`/api/folder${query}`);
      if (!res.ok) {
        throw new Error(`Storage API returned ${res.status}`);
      }

      const payload = (await res.json()) as ApiResponse_folder;
      setFolderData(payload);

      const apiCurrentPath = normalizeFolderPath(payload.currentFolder?.parent || "");
      const parentFolderPath = payload.parentFolder?.parent ?? null;

      if (apiCurrentPath !== currentFolder) {
        setCurrentFolder(apiCurrentPath);
      }

      const siblings =
        currentFolder !== "" ? payload.siblingFolders : payload.childrenFolders;
      setAvailableFolderPaths((siblings || []).map((folder) => folder.parent));
      setParentFolder(parentFolderPath);

      const sortedNames = Object.keys(payload.metafiles).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      );

      if (sortedNames.length > 0) {
        if (!selectedFileName || !payload.metafiles[selectedFileName]) {
          setSelectedImageId(sortedNames[0]);
        }
      } else {
        setSelectedImageId("");
      }
    } catch (error) {
      console.error("Failed to load storage images:", error);
      setFolderData({
        metafiles: {},
        currentFolder: { basename: "", parent: "" },
        parentFolder: { basename: "", parent: "" },
        siblingFolders: [],
        childrenFolders: [],
      });
      setAvailableFolderPaths([]);
      setParentFolder(null);
      setCurrentFolder("");
    } finally {
      setIsRefreshingFolder(false);
    }
  }, [currentFolder, searchQuery, selectedFileName, isDateFilterEnabled, startDate, endDate, includeNullDates]);

  const prevBatchProcessingRef = useRef<boolean>(false);
  const loadStorageImagesRef = useRef(loadStorageImages);
  loadStorageImagesRef.current = loadStorageImages;

  // --------------------------------------------------------------------
  // HOOKS: Catalog selection & Team management
  // --------------------------------------------------------------------
  const {
    selectedFileNames,
    setSelectedFileNames,
    selectedFolderPaths,
    setSelectedFolderPaths,
    handleToggleSelectFileName,
    handleToggleSelectFolderPath,
    handleSelectAllFiles,
    handleClearSelectedFiles,
    handleSelectFlaggedFiles,
    handleSelectUnassignedFiles,
    handleInvertSelectedFiles,
    handleSelectAllFolders,
    handleClearSelectedFolders,
    handleSelectFlaggedFolders,
    handleSelectUnassignedFolders,
    handleInvertSelectedFolders,
  } = useCatalogSelection(metafileList, folderData);

  const {
    users,
    setUsers,
    roles,
    setRoles,
    selectedUserId,
    setSelectedUserId,
    selectedUserIds,
    setSelectedUserIds,
    isTeamSidebarCollapsed,
    setIsTeamSidebarCollapsed,
    teamSidebarWidth,
    setTeamSidebarWidth,
    handleSelectUser,
    handleToggleSelectUser,
    handleAddUser,
    handleUpdateUser,
    handleDeleteUser,
    handleAddRole,
    handleUpdateRole,
  } = useTeamManagement(loadStorageImagesRef.current);

  /**
   * Poll /api/ingestion to keep INGESTION_STATUS synced.
   * Auto-refetches folder data when batch processing completes.
   */
  useEffect(() => {
    let isMounted = true;

    const checkIngestionStatus = async () => {
      try {
        const res = await fetch("/api/ingestion");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.ingestionStatus === "boolean") {
            const wasProcessing = prevBatchProcessingRef.current;
            const nowProcessing = data.ingestionStatus;

            setIsBatchProcessing(nowProcessing);
            prevBatchProcessingRef.current = nowProcessing;

            // When an active batch ingestion operation completes, refetch folder data immediately
            if (wasProcessing && !nowProcessing) {
              loadStorageImagesRef.current();
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch ingestion status:", err);
      }
    };

    // Check immediately on mount or state change
    checkIngestionStatus();

    const intervalTime = isBatchProcessing ? 6_000 : 60_000;
    const interval = setInterval(checkIngestionStatus, intervalTime);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isBatchProcessing]);

  /**
   * Triggers background batch processing of masks across STORAGE_PATH via FastAPI.
   */
  const handleTriggerBatchAutomation = async () => {
    try {
      setIsBatchProcessing(true);
      prevBatchProcessingRef.current = true;
      const res = await fetch("/api/ingestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: undefined,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(errorText || `Batch processing failed: status ${res.status}`);
      }

      const data = await res.json();
      console.log("Batch automation response:", data);
    } catch (error) {
      console.error("Batch automation error:", error);
      alert(error instanceof Error ? error.message : "Failed to start batch processing");
      setIsBatchProcessing(false);
      prevBatchProcessingRef.current = false;
    }
  };

  // --------------------------------------------------------------------
  // STATE: toolbar settings (file-level + layout)
  // --------------------------------------------------------------------
  const [toolbar, setToolbar] = useState<PersistedToolbarSettings>(() => ({
    ...TOOLBAR_DEFAULTS,
    persona: isAdmin ? PERSONA.ADMIN : PERSONA.IMAGE,
  }));
  const isSyncingFileSettingsRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Keep initial/active persona aligned with user role on each opening/login:
   * If user is admin -> PERSONA.ADMIN, otherwise -> PERSONA.IMAGE
   */
  useEffect(() => {
    setToolbar((prev) => ({
      ...prev,
      persona: isAdmin ? PERSONA.ADMIN : PERSONA.IMAGE,
    }));
  }, [isAdmin, user?.id]);

  /** Sync toolbar settings when the active image metadata changes (per-file toolbar sidecar). */
  useEffect(() => {
    if (!selectedFileName || !folderData.metafiles[selectedFileName]) return;

    const fileToolbar = resolveFileToolbarSettings(folderData.metafiles[selectedFileName].toolbar);
    isSyncingFileSettingsRef.current = true;
    setToolbar((prev) => ({
      ...prev,
      ...fileToolbar,
    }));
  }, [selectedFileName, folderData.metafiles[selectedFileName]?.toolbar]);

  /** Persist file toolbar settings to backend folder sidecar whenever file settings change. */
  const persistFileToolbar = useCallback(
    (folder: string, basename: string, settings: FileToolbarSettings) => {
      if (!basename) return;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const currentMeta = folderData.metafiles[basename];
          const newAssignedTo = user?.id || currentMeta?.assignedTo;
          const newAssignedToName = user?.name || currentMeta?.assignedToName;

          await fetch("/api/metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folder,
              basename,
              metadata: {
                ...currentMeta,
                name: basename,
                toolbar: settings,
                assignedTo: newAssignedTo,
                assignedToName: newAssignedToName,
                status: newAssignedTo ? "assigned" : (currentMeta?.status || "unassigned"),
              },
            }),
          });
        } catch (err) {
          console.error("Failed to persist file toolbar settings:", err);
        }
      }, 300);
    },
    [folderData.metafiles, user?.id, user?.name],
  );

  /** Helper to update file-level toolbar setting and trigger auto-save for current file. */
  const updateFileToolbar = useCallback(
    (updater: (prev: PersistedToolbarSettings) => PersistedToolbarSettings) => {
      setToolbar((prev) => {
        const next = updater(prev);
        const fileSettings: FileToolbarSettings = {
          brushMode: next.brushMode,
          brushSize: next.brushSize,
          brushHardness: next.brushHardness,
          brushOpacity: next.brushOpacity,
          brushColor: next.brushColor,
          swapMouseClicks: next.swapMouseClicks,
          maskOpacity: next.maskOpacity,
          imageOpacity: next.imageOpacity,
          thresholdValue: next.thresholdValue,
          thresholdValueEnabled: next.thresholdValueEnabled,
          traceMinBlobPixels: next.traceMinBlobPixels,
          traceMinBlobPixelsEnabled: next.traceMinBlobPixelsEnabled,
          simplifyEpsilon: next.simplifyEpsilon,
          simplifyEpsilonEnabled: next.simplifyEpsilonEnabled,
          smoothIterations: next.smoothIterations,
          smoothIterationsEnabled: next.smoothIterationsEnabled,
          contourOffset: next.contourOffset,
          contourOffsetEnabled: next.contourOffsetEnabled,
          feather: next.feather,
          featherEnabled: next.featherEnabled,
          imageVisibility: next.imageVisibility,
          maskVisibility: next.maskVisibility,
          splineCurviness: next.splineCurviness,
        };

        if (selectedFileName) {
          // Optimistically update local folderData metadata with user ownership
          setFolderData((prevFolder) => {
            if (!prevFolder.metafiles[selectedFileName]) return prevFolder;
            const currentEntry = prevFolder.metafiles[selectedFileName];
            const newAssignedTo = user?.id || currentEntry.assignedTo;
            const newAssignedToName = user?.name || currentEntry.assignedToName;

            return {
              ...prevFolder,
              metafiles: {
                ...prevFolder.metafiles,
                [selectedFileName]: {
                  ...currentEntry,
                  toolbar: fileSettings,
                  assignedTo: newAssignedTo,
                  assignedToName: newAssignedToName,
                  status: newAssignedTo ? "assigned" : currentEntry.status,
                },
              },
            };
          });

          persistFileToolbar(currentFolder, selectedFileName, fileSettings);
        }

        return next;
      });
    },
    [selectedFileName, currentFolder, persistFileToolbar, user?.id, user?.name],
  );

  // Destructure settings for convenience.
  const {
    persona,
    brushMode,
    brushSize,
    brushHardness,
    imageVisibility,
    maskVisibility,
    brushOpacity,
    brushColor,
    swapMouseClicks,
    thresholdValue,
    thresholdValueEnabled,
    traceMinBlobPixels,
    traceMinBlobPixelsEnabled,
    simplifyEpsilon,
    simplifyEpsilonEnabled,
    smoothIterations,
    smoothIterationsEnabled,
    contourOffset,
    contourOffsetEnabled,
    feather,
    featherEnabled,
    maskOpacity,
    imageOpacity,
    isAutoplay,
    autoplayInterval,
    isCatalogCollapsed,
    isInspectorCollapsed,
    sidebarWidth,
    inspectorWidth,
  } = toolbar;

  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerWidth : 1400
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [personaSelectorWidth, setPersonaSelectorWidth] = useState<number>(240);

  const effectiveSidebarWidth =
    persona === PERSONA.ADMIN
      ? Math.max(
        Math.floor(windowWidth * 0.3),
        Math.min(
          Math.floor(windowWidth * 0.5),
          sidebarWidth && sidebarWidth !== personaSelectorWidth
            ? sidebarWidth
            : Math.max(Math.floor(windowWidth * 0.3), Math.floor((windowWidth - (isTeamSidebarCollapsed ? 48 : teamSidebarWidth)) / 2))
        )
      )
      : Math.max(personaSelectorWidth, Math.min(Math.max(personaSelectorWidth, Math.floor(windowWidth * 0.3)), sidebarWidth || personaSelectorWidth));

  // repair-persona always uses white visually, but stored color is preserved.
  const effectiveBrushColor = persona === PERSONA.REPAIR ? "#ffffff" : brushColor;

  // --------------------------------------------------------------------
  // REFS: cross-component "pull" callbacks
  // ----------------------------------------------------------------------
  // Child components register getter functions here so the parent can pull
  // the latest canvas state on demand (e.g. at export time) without forcing
  // re-renders on every canvas stroke.
  // --------------------------------------------------------------------
  const getMergedDataUrlFnRef = useRef<(() => Promise<string>) | null>(null);
  const handleRegisterGetMergedDataUrl = useCallback((fn: () => Promise<string>) => {
    getMergedDataUrlFnRef.current = fn;
  }, []);

  const getLayersJsonBlobFnRef = useRef<(() => ImgJsonBlob) | null>(null);
  const handleRegisterGetLayersJsonBlob = useCallback((fn: () => ImgJsonBlob) => {
    getLayersJsonBlobFnRef.current = fn;
  }, []);

  const clearLayerFnRef = useRef<((layerKey?: "repair" | "color" | "object" | "image") => void) | null>(null);
  const handleRegisterClearLayer = useCallback(
    (fn: (layerKey?: "repair" | "color" | "object" | "image") => void) => {
      clearLayerFnRef.current = fn;
    },
    [],
  );

  const handleClearActiveLayer = useCallback(() => {
    clearLayerFnRef.current?.();
  }, []);

  const undoFnRef = useRef<(() => void) | null>(null);
  const redoFnRef = useRef<(() => void) | null>(null);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  const handleRegisterUndo = useCallback((fn: () => void) => {
    undoFnRef.current = fn;
  }, []);

  const handleRegisterRedo = useCallback((fn: () => void) => {
    redoFnRef.current = fn;
  }, []);

  const handleHistoryStatusChange = useCallback((status: { canUndo: boolean; canRedo: boolean }) => {
    setCanUndo(status.canUndo);
    setCanRedo(status.canRedo);
  }, []);

  const handleUndo = useCallback(() => {
    undoFnRef.current?.();
  }, []);

  const handleRedo = useCallback(() => {
    redoFnRef.current?.();
  }, []);

  // --------------------------------------------------------------------
  // DERIVED VALUES
  // --------------------------------------------------------------------

  /** The currently selected image, combining metadata + fetched layer data. */
  const activeImageData: ImgData | null =
    selectedFileName && folderData.metafiles[selectedFileName] && activeImageLayers
      ? {
        folder: currentFolder || "",
        metadata: folderData.metafiles[selectedFileName],
        jsonblob: activeImageLayers,
      }
      : null;

  /** Prev/next image navigation + autoplay, driven by the current metafile list. */
  const folderNav = FolderNavigation(
    metafileList,
    activeImageData,
    handleSelectImage,
    isAutoplay,
    (val) => setToolbar((prev) => ({ ...prev, isAutoplay: val })),
    autoplayInterval,
  );

  // --------------------------------------------------------------------
  // HANDLERS: folder navigation
  // --------------------------------------------------------------------

  /** Move to the previous folder in the sibling/children folder list (wraps). */
  const handlePrevFolder = () => {
    const idx = availableFolderPaths.indexOf(currentFolder);
    const prevIdx =
      idx >= 0 ? (idx - 1 + availableFolderPaths.length) % availableFolderPaths.length : 0;
    const nextFolder = availableFolderPaths[prevIdx] || "";
    setCurrentFolder(nextFolder);
  };

  /** Move to the next folder in the sibling/children folder list (wraps). */
  const handleNextFolder = () => {
    const idx = availableFolderPaths.indexOf(currentFolder);
    const nextIdx = idx >= 0 ? (idx + 1) % availableFolderPaths.length : 0;
    const nextFolder = availableFolderPaths[nextIdx] || "";
    setCurrentFolder(nextFolder);
  };

  /** Update the active folder from a Sidebar folder-tree selection. */
  const handleSelectFolder = (folder: string) => {
    setCurrentFolder(normalizeFolderPath(folder));
  };

  // --------------------------------------------------------------------
  // HANDLERS: image selection
  // --------------------------------------------------------------------

  /** Set the currently selected image by filename. */
  function handleSelectImage(name: string) {
    setSelectedImageId(name);
  }

  // --------------------------------------------------------------------
  // HANDLERS: object detection (AI mask generation)
  // --------------------------------------------------------------------

  /**
   * Requests an auto-generated object mask for the active image from the
   * backend and merges the result into the active image's layer stack.
   */
  const handleDetectObject = async () => {
    if (!activeImageData) return;
    try {
      setIsDetectingObject(true);
      const res = await fetch("/api/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent: activeImageData.folder || ".",
          basename: activeImageData.metadata.name,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `Server returned status ${res.status}`);
      }

      const data = await res.json();
      if (data.ok && data.mask) {
        setActiveImageLayers((prev) => (prev ? { ...prev, object: data.mask } : prev));
      }
    } catch (error) {
      console.error("Regeneration failed:", error);
      alert(error instanceof Error ? error.message : "Failed to detect object layer.");
    } finally {
      setIsDetectingObject(false);
    }
  };

  // --------------------------------------------------------------------
  // HANDLERS: metadata (issues / comments)
  // --------------------------------------------------------------------

  /**
   * Persists updated issue tags and/or a comment for the active image, then
   * optimistically syncs the change into local folder state.
   *
   * @param issues - New issue tag list; `null`/omitted keeps the existing tags.
   * @param comment - New comment text; omitted keeps the existing comment.
   */
  const handleUpdateImageMetadata = async (
    issues: null | string[] = [],
    comment?: string,
  ) => {
    const metadata = activeImageData?.metadata;
    if (!metadata) return;

    const resolvedIssues = issues || metadata.issues;
    const resolvedComment = comment !== undefined ? comment : metadata.comment;
    const basename = metadata.name;

    try {
      const currentFileToolbar: FileToolbarSettings = {
        brushMode: toolbar.brushMode,
        brushSize: toolbar.brushSize,
        brushHardness: toolbar.brushHardness,
        brushOpacity: toolbar.brushOpacity,
        brushColor: toolbar.brushColor,
        swapMouseClicks: toolbar.swapMouseClicks,
        maskOpacity: toolbar.maskOpacity,
        imageOpacity: toolbar.imageOpacity,
        thresholdValue: toolbar.thresholdValue,
        thresholdValueEnabled: toolbar.thresholdValueEnabled,
        traceMinBlobPixels: toolbar.traceMinBlobPixels,
        traceMinBlobPixelsEnabled: toolbar.traceMinBlobPixelsEnabled,
        simplifyEpsilon: toolbar.simplifyEpsilon,
        simplifyEpsilonEnabled: toolbar.simplifyEpsilonEnabled,
        smoothIterations: toolbar.smoothIterations,
        smoothIterationsEnabled: toolbar.smoothIterationsEnabled,
        contourOffset: toolbar.contourOffset,
        contourOffsetEnabled: toolbar.contourOffsetEnabled,
        feather: toolbar.feather,
        featherEnabled: toolbar.featherEnabled,
        imageVisibility: toolbar.imageVisibility,
        maskVisibility: toolbar.maskVisibility,
        splineCurviness: toolbar.splineCurviness,
      };

      const existingMeta = folderData.metafiles[basename];
      const newAssignedTo = user?.id || existingMeta?.assignedTo;
      const newAssignedToName = user?.name || existingMeta?.assignedToName;

      const res = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: currentFolder,
          basename: basename,
          metadata: {
            ...existingMeta,
            name: basename,
            issues: resolvedIssues,
            comment: resolvedComment,
            toolbar: currentFileToolbar,
            assignedTo: newAssignedTo,
            assignedToName: newAssignedToName,
            status: newAssignedTo ? "assigned" : (existingMeta?.status || "unassigned"),
            priority: existingMeta?.priority,
          } as MetaFile,
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        setFolderData((prev) => {
          const nextMetafiles = { ...prev.metafiles };
          if (nextMetafiles[basename]) {
            nextMetafiles[basename] = {
              ...nextMetafiles[basename],
              ...(data?.metadata || {}),
              issues: resolvedIssues,
              comment: resolvedComment,
              toolbar: currentFileToolbar,
              assignedTo: newAssignedTo,
              assignedToName: newAssignedToName,
              status: newAssignedTo ? "assigned" : nextMetafiles[basename].status,
            };
          }
          return {
            ...prev,
            metafiles: nextMetafiles,
          };
        });
      }
    } catch (err) {
      console.error("Failed to update image metadata:", err);
    }
  };

  /** 2-Step Atomic Bulk Assignment: Step 1 = Folders (round-robin), Step 2 = Files (round-robin) */
  const handleAssignBatch = async (payload: {
    folderAssignments: { folderPath: string; assigneeId: string; assigneeName: string }[];
    fileAssignments: { folder: string; file: string; assigneeId: string; assigneeName: string; priority?: "low" | "medium" | "high"; status?: string }[];
  }) => {
    // Guard: Prevent task assignment to archived/disabled users
    const activeUserIds = new Set(users.filter((u) => !u.disabled && !u.isArchived).map((u) => u.id));
    const folderAssignments = payload.folderAssignments.filter((fa) => !fa.assigneeId || activeUserIds.has(fa.assigneeId));
    const fileAssignments = payload.fileAssignments.filter((fa) => !fa.assigneeId || activeUserIds.has(fa.assigneeId));

    if (folderAssignments.length === 0 && fileAssignments.length === 0) {
      console.warn("Assignment skipped: target user(s) are archived or disabled.");
      return;
    }

    // Optimistic UI updates for current folder
    setFolderData((prev) => {
      const nextMetafiles = { ...prev.metafiles };
      const nextMetafolders = { ...(prev.metafolders || {}) };

      // Update current folder files if assigned
      fileAssignments.forEach((fa) => {
        if (fa.folder === currentFolder && nextMetafiles[fa.file]) {
          nextMetafiles[fa.file] = {
            ...nextMetafiles[fa.file],
            assignedTo: fa.assigneeId,
            assignedToName: fa.assigneeName,
            status: (fa.status as any) || "assigned",
            priority: fa.priority || "medium",
          };
        }
      });

      // Update subfolders in current view if assigned
      folderAssignments.forEach((fa) => {
        const folderBase = fa.folderPath.split(/[/\\]/).filter(Boolean).pop() || fa.folderPath;
        if (nextMetafolders[folderBase]) {
          nextMetafolders[folderBase] = {
            ...nextMetafolders[folderBase],
            assignedTo: fa.assigneeId,
            assignedToName: fa.assigneeName,
          };
        }
      });

      return {
        ...prev,
        metafiles: nextMetafiles,
        metafolders: nextMetafolders,
      };
    });

    try {
      // Step 1: Send Folder Assignments
      if (folderAssignments.length > 0) {
        await fetch("/api/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folder: currentFolder,
            folderAssignments,
          }),
        });
      }

      // Step 2: Send File Assignments (grouped by folder)
      if (fileAssignments.length > 0) {
        const filesByFolder: Record<string, typeof fileAssignments> = {};
        fileAssignments.forEach((fa) => {
          const f = fa.folder || currentFolder;
          if (!filesByFolder[f]) filesByFolder[f] = [];
          filesByFolder[f].push(fa);
        });

        for (const [folderKey, list] of Object.entries(filesByFolder)) {
          await fetch("/api/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folder: folderKey,
              assignments: list.map((fa) => ({
                file: fa.file,
                assigneeId: fa.assigneeId,
                assigneeName: fa.assigneeName,
                priority: fa.priority || "medium",
                status: fa.status || "assigned",
              })),
            }),
          });
        }
      }

      // Reload current folder view for 100% accurate synced catalog data
      const folderRes = await fetch(`/api/folder?folder=${encodeURIComponent(currentFolder)}`);
      if (folderRes.ok) {
        const freshData = (await folderRes.json()) as ApiResponse_folder;
        setFolderData(freshData);
      }
    } catch (err) {
      console.error("Failed to execute batch assignments:", err);
    }
  };

  /** Bulk assign task and priority to an array of files or entire folder to a team member. */
  const handleAssignTasks = async (
    targetFiles: string[],
    assigneeId: string,
    assigneeName: string,
    priority: "low" | "medium" | "high",
    status: any,
    targetFolder?: string
  ) => {
    // 1. Folder assignment: If targetFolder is specified and targetFiles is empty, perform recursive folder assignment
    if (targetFolder !== undefined && targetFiles.length === 0) {
      await handleAssignBatch({
        folderAssignments: [{ folderPath: targetFolder, assigneeId, assigneeName }],
        fileAssignments: [],
      });
      return;
    }

    const folderToUse = targetFolder !== undefined ? targetFolder : currentFolder;
    let filesToAssign = [...targetFiles];
    if (filesToAssign.length === 0 && folderToUse === currentFolder) {
      filesToAssign = Object.keys(folderData.metafiles);
    }

    if (filesToAssign.length > 0) {
      await handleAssignBatch({
        folderAssignments: [],
        fileAssignments: filesToAssign.map((file) => ({
          folder: folderToUse,
          file,
          assigneeId,
          assigneeName,
          priority,
          status,
        })),
      });
    }
  };

  // --------------------------------------------------------------------
  // HANDLERS: export
  // --------------------------------------------------------------------

  /**
   * Exports the active image's edited layers to the backend:
   *  1. Pulls the latest per-layer data URLs from the canvas (object/erase/paint).
   *  2. Pulls a flattened composite preview image.
   *  3. Builds the export payload and POSTs it to /api/export.
   *  4. Syncs any updated file sizes back into local state.
   */
  const handleExport = async () => {
    try {
      setIsExporting(true);
      if (!activeImageData) return;
      setToolbar({ ...toolbar, persona: PERSONA.COLOR })

      // 1. Fetch updated jsonblob containing data URLs from ALL canvas layers
      const currentLayersBlob: ImgJsonBlob = getLayersJsonBlobFnRef.current
        ? getLayersJsonBlobFnRef.current()
        : activeImageData.jsonblob;

      // 2. Build the payload in the shape the API actually expects
      const currentFileToolbar: FileToolbarSettings = {
        brushMode: toolbar.brushMode,
        brushSize: toolbar.brushSize,
        brushHardness: toolbar.brushHardness,
        brushOpacity: toolbar.brushOpacity,
        brushColor: toolbar.brushColor,
        swapMouseClicks: toolbar.swapMouseClicks,
        maskOpacity: toolbar.maskOpacity,
        imageOpacity: toolbar.imageOpacity,
        thresholdValue: toolbar.thresholdValue,
        thresholdValueEnabled: toolbar.thresholdValueEnabled,
        traceMinBlobPixels: toolbar.traceMinBlobPixels,
        traceMinBlobPixelsEnabled: toolbar.traceMinBlobPixelsEnabled,
        simplifyEpsilon: toolbar.simplifyEpsilon,
        simplifyEpsilonEnabled: toolbar.simplifyEpsilonEnabled,
        smoothIterations: toolbar.smoothIterations,
        smoothIterationsEnabled: toolbar.smoothIterationsEnabled,
        contourOffset: toolbar.contourOffset,
        contourOffsetEnabled: toolbar.contourOffsetEnabled,
        feather: toolbar.feather,
        featherEnabled: toolbar.featherEnabled,
        imageVisibility: toolbar.imageVisibility,
        maskVisibility: toolbar.maskVisibility,
        splineCurviness: toolbar.splineCurviness,
      };

      const newAssignedTo = user?.id || activeImageData.metadata.assignedTo;
      const newAssignedToName = user?.name || activeImageData.metadata.assignedToName;

      const exportPayload: ApiRequest_export = {
        folder: activeImageData.folder,
        basename: activeImageData.metadata.name,
        new_erase: currentLayersBlob.repair,
        new_paint: currentLayersBlob.color,
        metadata: {
          ...activeImageData.metadata,
          toolbar: currentFileToolbar,
          assignedTo: newAssignedTo,
          assignedToName: newAssignedToName,
        },
      };

      // 4. Send to backend API
      const exportEndpoint = "/api/export";
      const res = await fetch(exportEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportPayload),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Export HTTP ${res.status}: ${res.statusText} - ${errorText}`);
      }

      const data = await res.json().catch(() => null);

      // 5. Update local state metadata with status & file size changes
      if (activeImageData.metadata?.name) {
        const imageName = activeImageData.metadata.name;
        const nowIso = new Date().toISOString();
        const updatedSizes = data?.filesizes || data?.sizes || activeImageData.metadata.filesizes;

        setFolderData((prev) => ({
          ...prev,
          metafiles: {
            ...prev.metafiles,
            [imageName]: {
              ...prev.metafiles[imageName],
              status: "completed",
              assignedTo: newAssignedTo,
              assignedToName: newAssignedToName,
              exportedAt: nowIso,
              filesizes: updatedSizes,
            },
          },
        }));
      }

      return data?.message || `Exported successfully to API (${exportEndpoint})`;
    } catch (error) {
      console.error("Export failed:", error);
      alert(error instanceof Error ? error.message : "Failed to export image.");
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Saves the current active layer data (object, repair, color) directly to the sidecar JSON.
   */
  const [isSavingLayers, setIsSavingLayers] = useState(false);
  const handleSaveLayers = async () => {
    if (!activeImageData) return;
    try {
      setIsSavingLayers(true);
      const currentLayersBlob: ImgJsonBlob = getLayersJsonBlobFnRef.current
        ? getLayersJsonBlobFnRef.current()
        : activeImageData.jsonblob;

      const res = await fetch("/api/sidecar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent: activeImageData.folder || ".",
          basename: activeImageData.metadata.name,
          layers: {
            object: currentLayersBlob.object,
            repair: currentLayersBlob.repair,
            color: currentLayersBlob.color,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to save layer sidecar: status ${res.status}`);
      }

      // Update active image layer state locally
      setActiveImageLayers(currentLayersBlob);

      // Claim ownership on layer save
      if (activeImageData.metadata?.name) {
        const imageName = activeImageData.metadata.name;
        const newAssignedTo = user?.id || activeImageData.metadata.assignedTo;
        const newAssignedToName = user?.name || activeImageData.metadata.assignedToName;

        setFolderData((prev) => ({
          ...prev,
          metafiles: {
            ...prev.metafiles,
            [imageName]: {
              ...prev.metafiles[imageName],
              assignedTo: newAssignedTo,
              assignedToName: newAssignedToName,
              status: newAssignedTo ? "assigned" : prev.metafiles[imageName]?.status,
            },
          },
        }));

        fetch("/api/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folder: activeImageData.folder,
            basename: imageName,
            metadata: {
              ...activeImageData.metadata,
              assignedTo: newAssignedTo,
              assignedToName: newAssignedToName,
              status: newAssignedTo ? "assigned" : (activeImageData.metadata.status || "unassigned"),
            },
          }),
        }).catch((err) => console.warn("Failed to sync ownership on save layers:", err));
      }
    } catch (err) {
      console.error("Failed to save layers to sidecar:", err);
      alert(err instanceof Error ? err.message : "Failed to save layers");
    } finally {
      setIsSavingLayers(false);
    }
  };

  // --------------------------------------------------------------------
  // EFFECTS: data fetching
  // --------------------------------------------------------------------

  /**
   * Loads the folder listing (subfolders + image metafiles) whenever the
   * current folder or search query changes. Also resolves the "true"
   * current/parent folder from the API response (in case of redirects) and
   * auto-selects the first image when the current selection becomes invalid.
   */
  useEffect(() => {
    loadStorageImages();
  }, [currentFolder, searchQuery, loadStorageImages]);

  /**
   * Fetches the full layer stack (image, object, erase, paint) for the
   * currently selected file whenever the selection or folder changes.
   */
  useEffect(() => {
    if (!selectedFileName) {
      setActiveImageLayers(null);
      return;
    }

    let isMounted = true;

    const fetchLayers = async () => {
      try {
        const res = await fetch("/api/file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            basename: selectedFileName,
            parent: currentFolder,
          }),
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.ok && data.layers) {
            setActiveImageLayers(data.layers);
          }
        }
      } catch (err) {
        console.error("Failed to fetch image layers:", err);
      }
    };

    fetchLayers();

    return () => {
      isMounted = false;
    };
  }, [selectedFileName, currentFolder]);

  // --------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------

  return (
    <div className="h-screen w-screen bg-[#121212] text-[#e0e0e0] font-sans selection:bg-[#0096ff] selection:text-white flex flex-col overflow-hidden">
      {/* Header Toolbar: persona, brush settings, trace/simplify controls */}
      <HeaderToolbar
        activePersona={persona}
        personaList={PERSONALSIT}
        imageOpacity={imageOpacity}
        onImageOpacityChange={(val) => updateFileToolbar((prev) => ({ ...prev, imageOpacity: val }))}
        maskOpacity={maskOpacity}
        onMaskOpacityChange={(val) => updateFileToolbar((prev) => ({ ...prev, maskOpacity: val }))}
        thresholdValue={thresholdValue}
        thresholdValueEnabled={thresholdValueEnabled}
        onThresholdValueChange={(val) => updateFileToolbar((prev) => ({ ...prev, thresholdValue: val }))}
        onThresholdValueEnabledChange={(val) =>
          updateFileToolbar((prev) => ({ ...prev, thresholdValueEnabled: val }))
        }
        traceMinBlobPixels={traceMinBlobPixels}
        traceMinBlobPixelsEnabled={traceMinBlobPixelsEnabled}
        onTraceMinBlobPixelsChange={(val) =>
          updateFileToolbar((prev) => ({ ...prev, traceMinBlobPixels: val }))
        }
        onTraceMinBlobPixelsEnabledChange={(val) =>
          updateFileToolbar((prev) => ({ ...prev, traceMinBlobPixelsEnabled: val }))
        }
        simplifyEpsilon={simplifyEpsilon}
        simplifyEpsilonEnabled={simplifyEpsilonEnabled}
        onSimplifyEpsilonChange={(val) => updateFileToolbar((prev) => ({ ...prev, simplifyEpsilon: val }))}
        onSimplifyEpsilonEnabledChange={(val) =>
          updateFileToolbar((prev) => ({ ...prev, simplifyEpsilonEnabled: val }))
        }
        smoothIterations={smoothIterations}
        smoothIterationsEnabled={smoothIterationsEnabled}
        onSmoothIterationsChange={(val) =>
          updateFileToolbar((prev) => ({ ...prev, smoothIterations: val }))
        }
        onSmoothIterationsEnabledChange={(val) =>
          updateFileToolbar((prev) => ({ ...prev, smoothIterationsEnabled: val }))
        }
        contourOffset={contourOffset}
        contourOffsetEnabled={contourOffsetEnabled}
        onContourOffsetChange={(val) => updateFileToolbar((prev) => ({ ...prev, contourOffset: val }))}
        onContourOffsetEnabledChange={(val) =>
          updateFileToolbar((prev) => ({ ...prev, contourOffsetEnabled: val }))
        }
        feather={feather}
        featherEnabled={featherEnabled}
        onFeatherChange={(val) => updateFileToolbar((prev) => ({ ...prev, feather: val }))}
        onFeatherEnabledChange={(val) =>
          updateFileToolbar((prev) => ({ ...prev, featherEnabled: val }))
        }
        onPersonaChange={(p) => updateFileToolbar((prev) => ({ ...prev, persona: p }))}
        activeImage={activeImageData}
        onDetectingObject={handleDetectObject}
        isDetectingObject={isDetectingObject}
        brushMode={brushMode}
        onBrushModeChange={(mode) => updateFileToolbar((prev) => ({ ...prev, brushMode: mode }))}
        swapMouseClicks={swapMouseClicks}
        onSwapMouseClicksChange={(val) => updateFileToolbar((prev) => ({ ...prev, swapMouseClicks: val }))}
        brushSize={brushSize}
        onBrushSizeChange={(size) => updateFileToolbar((prev) => ({ ...prev, brushSize: size }))}
        brushHardness={brushHardness}
        onBrushHardnessChange={(hardness) =>
          updateFileToolbar((prev) => ({ ...prev, brushHardness: hardness }))
        }
        brushColor={effectiveBrushColor}
        onBrushColorChange={(color) => updateFileToolbar((prev) => ({ ...prev, brushColor: color }))}
        brushOpacity={brushOpacity}
        onBrushOpacityChange={(opacity) => updateFileToolbar((prev) => ({ ...prev, brushOpacity: opacity }))}
        maskVisibility={maskVisibility}
        onMaskVisibilityChange={(val) => updateFileToolbar((prev) => ({ ...prev, maskVisibility: val }))}
        imageVisibility={imageVisibility}
        onImageVisibilityChange={(val) => updateFileToolbar((prev) => ({ ...prev, imageVisibility: val }))}
        splineCurviness={toolbar.splineCurviness ?? 0.5}
        onSplineCurvinessChange={(val) => updateFileToolbar((prev) => ({ ...prev, splineCurviness: val }))}
        onClearLayer={handleClearActiveLayer}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        folderData={folderData}
        currentFolder={currentFolder}
        onTriggerBatchAutomation={handleTriggerBatchAutomation}
        isBatchProcessing={isBatchProcessing}
        onPersonaSelectorWidthMeasured={setPersonaSelectorWidth}
        isDateFilterEnabled={isDateFilterEnabled}
        setIsDateFilterEnabled={setIsDateFilterEnabled}
        includeNullDates={includeNullDates}
        setIncludeNullDates={setIncludeNullDates}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
      />

      {/* Main Content Layout: sidebar catalog + workspace + inspector */}
      <div className="w-full flex-1 min-h-0 flex flex-col lg:flex-row items-stretch transition-all duration-300 overflow-hidden">
        {/* Left Edge Catalog Sidebar: Dedicated Admin vs Standard Persona Sidebar */}
        {persona !== PERSONA.ADMIN && (

          <NavTable
            metafileList={metafileList}
            folderData={folderData}
            selectedImageName={selectedFileName}
            onSelectImage={handleSelectImage}
            onSelectFolder={handleSelectFolder}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            sidebarWidth={effectiveSidebarWidth}
            minSidebarWidth={personaSelectorWidth}
            onSidebarWidthChange={(w) => setToolbar((prev) => ({ ...prev, sidebarWidth: w }))}
            selectedFileNames={selectedFileNames}
            onToggleSelectFileName={handleToggleSelectFileName}
            selectedFolderPaths={selectedFolderPaths}
            onToggleSelectFolderPath={handleToggleSelectFolderPath}
            onSelectAllFiles={handleSelectAllFiles}
            onClearSelectedFiles={handleClearSelectedFiles}
            onSelectFlaggedFiles={handleSelectFlaggedFiles}
            onSelectUnassignedFiles={handleSelectUnassignedFiles}
            onInvertSelectedFiles={handleInvertSelectedFiles}
            listOnly={true}
            flipResizeHandle={true}
            onRefresh={loadStorageImages}
            isRefreshing={isRefreshingFolder}
            isCollapsed={isCatalogCollapsed}
            onToggleCollapse={(c) => setToolbar((prev) => ({ ...prev, isCatalogCollapsed: c }))}
            users={users}
          />
        )}

        {/* Main Workspace Viewport / Admin Dashboard */}
        <main className="flex-1 min-w-0 flex flex-col w-full self-stretch bg-[#151515]">
          <div
            id="workspace-container"
            className="items-center w-full relative transition-all duration-200 min-h-0 bg-[#181818] border border-[#2d2d2d] rounded-none shadow-xs flex-1 flex justify-between overflow-hidden h-full"
          >
            {/* Main Workspace Canvas / Preview */}
            <PreviewWorkspace
              persona={persona}
              brushMode={brushMode}
              imageOpacity={imageOpacity}
              brushSize={brushSize}
              maskOpacity={maskOpacity}
              thresholdValue={thresholdValue}
              thresholdValueEnabled={thresholdValueEnabled}
              traceMinBlobPixels={traceMinBlobPixels}
              traceMinBlobPixelsEnabled={traceMinBlobPixelsEnabled}
              simplifyEpsilon={simplifyEpsilon}
              simplifyEpsilonEnabled={simplifyEpsilonEnabled}
              smoothIterations={smoothIterations}
              smoothIterationsEnabled={smoothIterationsEnabled}
              contourOffset={contourOffset}
              contourOffsetEnabled={contourOffsetEnabled}
              feather={feather}
              featherEnabled={featherEnabled}
              originalImage={activeImageData}
              brushHardness={brushHardness}
              swapMouseClicks={swapMouseClicks}
              brushColor={effectiveBrushColor}
              brushOpacity={brushOpacity}
              imageVisibility={imageVisibility}
              maskVisibility={maskVisibility}
              splineCurviness={toolbar.splineCurviness ?? 0.5}
              onRegisterGetMergedDataUrl={handleRegisterGetMergedDataUrl}
              onRegisterGetLayersJsonBlob={handleRegisterGetLayersJsonBlob}
              onRegisterClearLayer={handleRegisterClearLayer}
              onRegisterUndo={handleRegisterUndo}
              onRegisterRedo={handleRegisterRedo}
              onHistoryStatusChange={handleHistoryStatusChange}
            />

            {persona === PERSONA.ADMIN && (
              <NavTable
                metafileList={metafileList}
                folderData={folderData}
                selectedImageName={selectedFileName}
                onSelectImage={handleSelectImage}
                onSelectFolder={handleSelectFolder}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                sidebarWidth={effectiveSidebarWidth}
                onSidebarWidthChange={(w) => setToolbar((prev) => ({ ...prev, sidebarWidth: w }))}
                selectedFileNames={selectedFileNames}
                onToggleSelectFileName={handleToggleSelectFileName}
                selectedFolderPaths={selectedFolderPaths}
                onToggleSelectFolderPath={handleToggleSelectFolderPath}
                onSelectAllFiles={handleSelectAllFiles}
                onClearSelectedFiles={handleClearSelectedFiles}
                onSelectFlaggedFiles={handleSelectFlaggedFiles}
                onSelectUnassignedFiles={handleSelectUnassignedFiles}
                onInvertSelectedFiles={handleInvertSelectedFiles}
                onSelectAllFolders={handleSelectAllFolders}
                onClearSelectedFolders={handleClearSelectedFolders}
                onSelectFlaggedFolders={handleSelectFlaggedFolders}
                onSelectUnassignedFolders={handleSelectUnassignedFolders}
                onInvertSelectedFolders={handleInvertSelectedFolders}
                onRefresh={loadStorageImages}
                isRefreshing={isRefreshingFolder}
                disableCollapse={true}
                users={users}
              />
            )}


            {/* In Admin persona, render TeamSidebar on the right */}
            {persona === PERSONA.ADMIN ? (
              <TeamSidebar
                users={users}
                selectedUserId={selectedUserId}
                selectedUserIds={selectedUserIds}
                onSelectUser={handleSelectUser}
                onToggleSelectUser={handleToggleSelectUser}
                onAddUser={handleAddUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
                roles={roles}
                onAddRole={handleAddRole}
                onUpdateRole={handleUpdateRole}
                folderData={folderData}
                selectedFileName={selectedFileName}
                selectedFileNames={selectedFileNames}
                selectedFolderPaths={selectedFolderPaths}
                onAssignTasks={handleAssignTasks}
                onAssignBatch={handleAssignBatch}
                sidebarWidth={teamSidebarWidth}
                onWidthChange={setTeamSidebarWidth}
                isCollapsed={isTeamSidebarCollapsed}
                onToggleCollapse={setIsTeamSidebarCollapsed}
                isDateFilterEnabled={isDateFilterEnabled}
                setIsDateFilterEnabled={setIsDateFilterEnabled}
                includeNullDates={includeNullDates}
                setIncludeNullDates={setIncludeNullDates}
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
              />
            ) : (
              activeImageData && (
                <Inspector
                  onUpdateMetadata={handleUpdateImageMetadata}
                  onWidthChange={(w) =>
                    setToolbar((prev) => ({ ...prev, inspectorWidth: w }))
                  }
                  onToggleCollapse={(collapsed) =>
                    setToolbar((prev) => ({ ...prev, isInspectorCollapsed: collapsed }))
                  }
                  fileName={selectedFileName}
                  isCollapsed={isInspectorCollapsed}
                  fileMetadata={activeImageData.metadata}
                  inspectorWidth={inspectorWidth}
                  defaultIssueTags={DEFAULT_INSPECTOR_ISSUE_TAGS}
                />
              )
            )}
          </div>
        </main>
      </div>

      {/* Bottom Button Bar: folder/image nav, autoplay, export, issue clearing (Hidden in Admin mode) */}
      {persona !== PERSONA.ADMIN && (
        <ButtonBar
          isExporting={isExporting}
          isSavingLayers={isSavingLayers}
          onPrevFolder={handlePrevFolder}
          onNextFolder={handleNextFolder}
          onPrevImage={folderNav.handlePrevImage}
          onNextImage={folderNav.handleNextImage}
          onExport={handleExport}
          onSaveLayers={handleSaveLayers}
          onClearIssues={() => handleUpdateImageMetadata([])}
          isAutoplay={isAutoplay}
          onToggleAutoplay={() => setToolbar((prev) => ({ ...prev, isAutoplay: !prev.isAutoplay }))}
          autoplayInterval={autoplayInterval}
          onAutoplayIntervalChange={(interval) =>
            setToolbar((prev) => ({ ...prev, autoplayInterval: interval }))
          }
          hasMultipleFolders={
            currentFolder !== "" && currentFolder !== "." && availableFolderPaths.length > 1
          }
          hasMultipleImages={folderNav.hasMultipleImages}
          hasActiveImage={!!activeImageData}
          activeImageIssues={activeImageData?.metadata.issues || []}
          activeImageName={activeImageData?.metadata.name || ""}
          sidebarWidth={effectiveSidebarWidth}
          minSidebarWidth={personaSelectorWidth}
          isSidebarCollapsed={isCatalogCollapsed}
          inspectorWidth={inspectorWidth}
          isInspectorCollapsed={isInspectorCollapsed}
        />
      )}

      {/* Authentication Login Dialog */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={closeLoginModal}
      />
    </div>
  );
}