import React from "react";
import { AlertTriangle, Archive, UserX } from "lucide-react";
import { UserAccount } from "@/app/types";

interface ArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  usersToArchive: UserAccount[];
  getActiveTaskCountForUser: (userId: string) => number;
  onConfirmArchive: () => void;
}

export default function ArchiveModal({
  isOpen,
  onClose,
  usersToArchive,
  getActiveTaskCountForUser,
  onConfirmArchive,
}: ArchiveModalProps) {
  if (!isOpen || usersToArchive.length === 0) return null;

  const totalActiveTasksToArchive = usersToArchive.reduce(
    (sum, u) => sum + getActiveTaskCountForUser(u.id),
    0
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-[#181818] border border-[#333] rounded-lg w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-3.5 border-b border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-amber-500" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Archive Team Member{usersToArchive.length > 1 ? "s" : ""}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs cursor-pointer p-1"
          >
            ✕
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <p className="text-xs text-gray-300">
            Are you sure you want to archive{" "}
            <strong className="text-white">
              {usersToArchive.length === 1
                ? usersToArchive[0].name
                : `${usersToArchive.length} selected members`}
            </strong>
            ? They will lose access to the platform and can be restored anytime from the Archived
            tab.
          </p>

          {/* Active Tasks Warning Alert */}
          {totalActiveTasksToArchive > 0 ? (
            <div className="p-2.5 bg-amber-950/30 border border-amber-800/60 rounded-md flex items-start gap-2 text-[11px] text-amber-200/90 leading-tight">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300 block mb-0.5">
                  Notice: {totalActiveTasksToArchive} Active Task
                  {totalActiveTasksToArchive === 1 ? "" : "s"} Assigned
                </span>
                Archiving will automatically unassign all pending files & folders back to the team
                pool.
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-[#141414] border border-[#262626] rounded-md text-[11px] text-gray-400 flex items-center gap-2">
              <UserX className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span>No pending active tasks found assigned to these members.</span>
            </div>
          )}

          {/* Actions Footer */}
          <div className="h-6 flex items-center justify-end gap-2.5 pt-2 border-t border-[#262626]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-xs text-gray-400 hover:text-white hover:bg-[#222] rounded transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmArchive}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded shadow-xs transition-colors cursor-pointer"
            >
              Confirm & Archive
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
