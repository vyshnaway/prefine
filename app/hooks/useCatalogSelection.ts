import { useState, useCallback } from "react";
import { MetaFile, ApiResponse_folder } from "@/app/types";
import { deriveTaskStatus } from "@/app/lib/task-status";

export function useCatalogSelection(
  metafileList: MetaFile[],
  folderData: ApiResponse_folder
) {
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [selectedFolderPaths, setSelectedFolderPaths] = useState<string[]>([]);

  const handleToggleSelectFileName = useCallback((name: string) => {
    setSelectedFileNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }, []);

  const handleToggleSelectFolderPath = useCallback((path: string) => {
    setSelectedFolderPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  }, []);

  const handleSelectAllFiles = useCallback(() => {
    const allNames = metafileList.map((m) => m.name);
    setSelectedFileNames(allNames);
  }, [metafileList]);

  const handleClearSelectedFiles = useCallback(() => {
    setSelectedFileNames([]);
  }, []);

  const handleSelectFlaggedFiles = useCallback(() => {
    const flagged = metafileList
      .filter((m) => {
        const s = deriveTaskStatus(m);
        return s === "progressing" || s === "commented";
      })
      .map((m) => m.name);
    setSelectedFileNames(flagged);
  }, [metafileList]);

  const handleSelectUnassignedFiles = useCallback(() => {
    const unassigned = metafileList
      .filter((m) => {
        const s = deriveTaskStatus(m);
        return s === "unassigned" || (!m.assignedTo && !m.assignedToName && s !== "completed");
      })
      .map((m) => m.name);
    setSelectedFileNames(unassigned);
  }, [metafileList]);

  const handleInvertSelectedFiles = useCallback(() => {
    const allNames = metafileList.map((m) => m.name);
    setSelectedFileNames((prev) => allNames.filter((name) => !prev.includes(name)));
  }, [metafileList]);

  const handleSelectAllFolders = useCallback(() => {
    const allPaths = (folderData.childrenFolders || []).map((f) => f.parent);
    setSelectedFolderPaths(allPaths);
  }, [folderData.childrenFolders]);

  const handleClearSelectedFolders = useCallback(() => {
    setSelectedFolderPaths([]);
  }, []);

  const handleSelectFlaggedFolders = useCallback(() => {
    const flagged = (folderData.childrenFolders || [])
      .filter((f) => {
        const m = folderData.metafolders?.[f.basename];
        const status = m?.status || (m?.assignedTo ? "assigned" : "unassigned");
        return status === "progressing" || status === "commented" || Boolean(m?.assignedTo || m?.assignedToName);
      })
      .map((f) => f.parent);
    setSelectedFolderPaths(flagged);
  }, [folderData.childrenFolders, folderData.metafolders]);

  const handleSelectUnassignedFolders = useCallback(() => {
    const unassigned = (folderData.childrenFolders || [])
      .filter((f) => {
        const m = folderData.metafolders?.[f.basename];
        const status = m?.status || (m?.assignedTo ? "assigned" : "unassigned");
        return status === "unassigned" && !m?.assignedTo && !m?.assignedToName;
      })
      .map((f) => f.parent);
    setSelectedFolderPaths(unassigned);
  }, [folderData.childrenFolders, folderData.metafolders]);

  const handleInvertSelectedFolders = useCallback(() => {
    const allPaths = (folderData.childrenFolders || []).map((f) => f.parent);
    setSelectedFolderPaths((prev) => allPaths.filter((path) => !prev.includes(path)));
  }, [folderData.childrenFolders]);

  return {
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
  };
}
