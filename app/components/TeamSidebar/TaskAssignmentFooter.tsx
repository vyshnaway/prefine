import React from "react";
import { UserCheck } from "lucide-react";
import { UserAccount, ApiResponse_folder } from "@/app/types";

interface TaskAssignmentFooterProps {
  selectedUserIds: string[];
  users: UserAccount[];
  selectedFileNames: string[];
  selectedFileName: string;
  selectedFolderPaths: string[];
  folderData: ApiResponse_folder;
  viewTab?: "active" | "archived";
  onAssignBatch?: (payload: {
    folderAssignments: { folderPath: string; assigneeId: string; assigneeName: string }[];
    fileAssignments: {
      folder: string;
      file: string;
      assigneeId: string;
      assigneeName: string;
      priority?: "low" | "medium" | "high";
      status?: string;
    }[];
  }) => Promise<void> | void;
  onAssignTasks?: (
    targetFiles: string[],
    assigneeId: string,
    assigneeName: string,
    priority: "low" | "medium" | "high",
    status: any,
    targetFolder?: string
  ) => void;
}

export default function TaskAssignmentFooter({
  selectedUserIds,
  users,
  selectedFileNames,
  selectedFileName,
  selectedFolderPaths,
  folderData,
  viewTab,
  onAssignBatch,
  onAssignTasks,
}: TaskAssignmentFooterProps) {
  if (viewTab === "archived") return null;
  if (selectedUserIds.length === 0) return null;

  const activeUsers = users.filter((u) => selectedUserIds.includes(u.id) && !u.disabled && !u.isArchived);
  if (activeUsers.length === 0) return null;

  const handleAssign = async () => {
    // If any checkbox selection is active (selectedFileNames or selectedFolderPaths), do NOT include the active image selection
    const hasCheckboxSelection = selectedFileNames.length > 0 || selectedFolderPaths.length > 0;
    const effectiveFiles = hasCheckboxSelection
      ? selectedFileNames
      : selectedFileName
      ? [selectedFileName]
      : [];

    if (effectiveFiles.length === 0 && selectedFolderPaths.length === 0) {
      alert("Please select one or more images/folders in the left sidebar catalog.");
      return;
    }

    // STEP 1: Distribute Folders round-robin across selected users
    const folderAssignments = selectedFolderPaths.map((fPath, idx) => {
      const targetUser = activeUsers[idx % activeUsers.length];
      return {
        folderPath: fPath,
        assigneeId: targetUser.id,
        assigneeName: targetUser.name,
      };
    });

    // STEP 2: Distribute Files round-robin across selected users
    const fileAssignments = effectiveFiles.map((file, idx) => {
      const targetUser = activeUsers[idx % activeUsers.length];
      return {
        folder: folderData.currentFolder.parent || "",
        file,
        assigneeId: targetUser.id,
        assigneeName: targetUser.name,
        priority: "medium" as const,
        status: "assigned",
      };
    });

    if (onAssignBatch) {
      await onAssignBatch({
        folderAssignments,
        fileAssignments,
      });
    } else {
      // Fallback sequential dispatch
      for (const fa of folderAssignments) {
        onAssignTasks?.([], fa.assigneeId, fa.assigneeName, "medium", "assigned", fa.folderPath);
      }
      const chunks: { [userId: string]: { user: UserAccount; files: string[] } } = {};
      activeUsers.forEach((u) => {
        chunks[u.id] = { user: u, files: [] };
      });
      fileAssignments.forEach((fa) => {
        chunks[fa.assigneeId]?.files.push(fa.file);
      });
      Object.values(chunks).forEach(({ user: u, files }) => {
        if (files.length > 0) {
          onAssignTasks?.(files, u.id, u.name, "medium", "assigned");
        }
      });
    }
  };

  return (
    <div className="h-20 p-2 border-t border-[#2b2b2b] bg-[#141414] flex flex-col gap-1.5 shrink-0 select-none">
      <div className="flex items-center justify-between gap-2 min-h-6">
        <span className="text-[10px] text-gray-400 font-medium truncate">
          {activeUsers.length > 1
            ? `Selected (${activeUsers.length} members):`
            : "Selected Assignee:"}
        </span>
        <span className="text-[10px] font-bold text-white flex items-center gap-1 truncate max-w-44">
          <UserCheck className="h-3 w-3 text-[#0096ff] shrink-0" />
          <span className="truncate">
            {activeUsers.length === 1
              ? activeUsers[0].name
              : activeUsers.map((u) => u.name).join(", ")}
          </span>
        </span>
      </div>

      <div className="w-full flex items-center">
        <button
          type="button"
          onClick={handleAssign}
          className="w-full py-1 px-2.5 bg-[#0096ff] hover:bg-[#0082e6] text-white border border-[#0096ff]/60 rounded text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs truncate"
          title="Distribute selected workload evenly across selected members"
        >
          <span className="truncate">
            {activeUsers.length > 1
              ? `Assign Evenly (${activeUsers.length} Members)`
              : `Assign to ${activeUsers[0].name}`}
            {selectedFileNames.length > 0 ? ` • ${selectedFileNames.length} items` : ""}
            {selectedFolderPaths.length > 0 ? ` • ${selectedFolderPaths.length} folders` : ""}
          </span>
        </button>
      </div>
    </div>
  );
}
