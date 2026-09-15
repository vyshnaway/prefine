import React from "react";
import { Folder, FileImage } from "lucide-react";
import { MetaFile, ApiResponse_folder, UserAccount } from "@/app/types";
import { deriveTaskStatus } from "@/app/lib/task-status";
import { getAssigneeColorStyle, deriveFolderTaskStatus } from "./utils";

interface NavListTableProps {
  filteredFolders: Array<{ basename: string; parent: string }>;
  folderData: ApiResponse_folder;
  authorizedMetafileList: MetaFile[];
  selectedImageName: string;
  selectedFileNames: string[];
  selectedFolderPaths: string[];
  listOnly?: boolean;
  users?: UserAccount[];
  onSelectFolder: (folderPath: string) => void;
  onSelectImage: (id: string) => void;
  onToggleSelectFolderPath?: (path: string) => void;
  onToggleSelectFileName?: (name: string) => void;
}

export default function NavListTable({
  filteredFolders,
  folderData,
  authorizedMetafileList,
  selectedImageName,
  selectedFileNames,
  selectedFolderPaths,
  listOnly = false,
  users = [],
  onSelectFolder,
  onSelectImage,
  onToggleSelectFolderPath,
  onToggleSelectFileName,
}: NavListTableProps) {
  if (filteredFolders.length === 0 && authorizedMetafileList.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500 gap-2 select-none">
        <Folder className="h-10 w-10 text-gray-600 stroke-[1.5]" />
        <span className="text-xs">No catalog assets found</span>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-fixed text-left text-xs border-collapse">
        <thead>
          {!listOnly && (
            <tr className="border-b border-[#2d2d2d] text-gray-400 text-[10px] uppercase tracking-wider bg-[#161616] sticky top-0 z-10">
              <th className="py-2 px-1.5 w-[50%]">File / Folder</th>
              <th className="py-2 px-1.5 w-[20%]">Assignee</th>
              <th className="py-2 px-1 w-[20%] text-center">Status</th>
              <th className="py-2 px-1 text-center w-[10%]">Sel</th>
            </tr>
          )}
        </thead>
        <tbody className="divide-y divide-[#202020]">
          {/* Subfolders */}
          {filteredFolders.map((f, idx) => {
            const folderPath = f.parent;
            const isFolderChecked = selectedFolderPaths.includes(folderPath);
            const folderMeta = folderData.metafolders?.[f.basename || ""];

            return (
              <tr
                key={f.parent || idx}
                onClick={() => onSelectFolder(folderPath)}
                className={`hover:bg-[#202020] transition-colors cursor-pointer group ${isFolderChecked ? "bg-[#0096ff]/15 text-white" : "text-gray-300"
                  }`}
              >
                <td className="py-2 px-1.5 font-medium truncate">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-5 w-5 shrink-0 rounded border border-[#2d2d2d] bg-[#111] overflow-hidden flex items-center justify-center">
                      <Folder className="h-2.5 w-2.5 text-amber-500 fill-amber-500/20" />
                    </div>
                    <div className="flex flex-col min-w-0 truncate">
                      <span className="truncate font-semibold text-gray-200 text-xs">
                        {f.basename || f.parent}
                      </span>
                      <span className="text-[8px] font-mono text-gray-500 truncate">
                        {folderMeta
                          ? `${folderMeta.filesCount} files • ${folderMeta.foldersCount} folders`
                          : "Folder"}
                      </span>
                    </div>
                  </div>
                </td>
                {!listOnly && (
                  <>
                    <td className="py-2 px-1.5 truncate">
                      {(() => {
                        const resolvedName =
                          folderMeta?.assignedToName ||
                          (folderMeta?.assignedTo
                            ? users.find((u) => u.id === folderMeta.assignedTo)?.name ||
                              users.find((u) => u.id === folderMeta.assignedTo)?.email
                            : undefined);

                        if (resolvedName) {
                          const style = getAssigneeColorStyle(resolvedName);
                          return (
                            <span
                              style={{
                                backgroundColor: style.bg,
                                color: style.text,
                                borderColor: style.border,
                              }}
                              className="text-[9px] px-1.5 py-0.5 rounded border font-medium truncate block shadow-xs text-center"
                              title={resolvedName}
                            >
                              {resolvedName}
                            </span>
                          );
                        }

                        return (
                          <span
                            style={{
                              backgroundColor: "#222222",
                              color: "#888888",
                              borderColor: "#555555",
                            }}
                            className="text-[9px] px-1.5 py-0.5 rounded border font-medium truncate block shadow-xs text-center"
                          >
                            unassigned
                          </span>
                        );
                      })()}
                    </td>
                    {/* Folder Status */}
                    <td className="py-2 px-1 text-center truncate">
                      {(() => {
                        const currentStatus = deriveFolderTaskStatus(folderMeta);
                        return (
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded border font-medium truncate block ${currentStatus === "completed"
                                ? "bg-[#1c281e] text-emerald-300/90 border-emerald-900/60"
                                : currentStatus === "commented"
                                  ? "bg-[#252020] text-rose-300/90 border-rose-900/60"
                                  : currentStatus === "progressing"
                                    ? "bg-[#282218] text-amber-300/90 border-amber-900/60"
                                    : currentStatus === "assigned"
                                      ? "bg-[#182230] text-sky-300/90 border-sky-900/60"
                                      : "bg-[#1f1f1f] text-gray-400 border-[#2f2f2f]"
                              }`}
                          >
                            {currentStatus}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                      <div
                        onClick={() => onToggleSelectFolderPath?.(folderPath)}
                        className={`w-5 h-5 mx-auto rounded-full flex items-center justify-center transition-all cursor-pointer ${isFolderChecked
                            ? "bg-[#0096ff] border-2 border-[#0096ff] ring-2 ring-[#0096ff]/30 shadow-xs"
                            : "bg-[#141414] border-2 border-[#3a3a3a] group-hover:border-[#0096ff]"
                          }`}
                        title={
                          isFolderChecked
                            ? "Selected (Click to deselect)"
                            : "Click bubble to select folder"
                        }
                      />
                    </td>
                  </>
                )}
              </tr>
            );
          })}

          {/* Images */}
          {authorizedMetafileList.map((metaEntry) => {
            const stem = metaEntry.name;
            const isSelected = selectedImageName === stem;
            const isChecked = selectedFileNames.includes(stem);

            return (
              <tr
                key={stem}
                onClick={() => onSelectImage(stem)}
                className={`hover:bg-[#202020] transition-colors cursor-pointer group ${isSelected
                    ? "bg-[#0096ff]/20 text-white font-medium"
                    : isChecked
                      ? "bg-[#0096ff]/10 text-gray-200"
                      : "text-gray-300"
                  }`}
              >
                {/* Filename & Dimensions */}
                <td className="py-2 px-1.5 min-w-0">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-5 w-5 shrink-0 rounded border border-[#2d2d2d] bg-[#111] overflow-hidden flex items-center justify-center">
                      {metaEntry.thumbnail ? (
                        <img
                          src={metaEntry.thumbnail}
                          alt={stem}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="max-h-full max-w-full object-contain pointer-events-none"
                        />
                      ) : (
                        <FileImage className="h-2.5 w-2.5 text-gray-500" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0 truncate">
                      <span className="truncate font-semibold text-gray-200 text-xs" title={stem}>
                        {stem}
                      </span>
                      <span className="text-[8px] font-mono text-gray-500 truncate">
                        {metaEntry.width}×{metaEntry.height}
                      </span>
                    </div>
                  </div>
                </td>

                {!listOnly && (
                  <>
                    {/* Assignee */}
                    <td className="py-2 px-1.5 truncate">
                      {(() => {
                        const resolvedName =
                          metaEntry.assignedToName ||
                          (metaEntry.assignedTo
                            ? users.find((u) => u.id === metaEntry.assignedTo)?.name ||
                              users.find((u) => u.id === metaEntry.assignedTo)?.email
                            : undefined);

                        if (resolvedName) {
                          const style = getAssigneeColorStyle(resolvedName);
                          return (
                            <span
                              style={{
                                 backgroundColor: style.bg,
                                 color: style.text,
                                 borderColor: style.border,
                              }}
                              className="text-[9px] px-1.5 py-0.5 rounded border font-medium truncate block shadow-xs text-center"
                              title={resolvedName}
                            >
                              {resolvedName}
                            </span>
                          );
                        }

                        return (
                          <span
                            style={{
                              backgroundColor: "#222222",
                              color: "#888888",
                              borderColor: "#555555",
                            }}
                            className="text-[9px] px-1.5 py-0.5 rounded border font-medium truncate block shadow-xs text-center"
                          >
                            unassigned
                          </span>
                        );
                      })()}
                    </td>

                    {/* Status */}
                    <td className="py-2 px-1 text-center truncate">
                      {(() => {
                        const currentStatus = deriveTaskStatus(metaEntry);
                        return (
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded border font-medium truncate block ${currentStatus === "completed"
                                ? "bg-[#1c281e] text-emerald-300/90 border-emerald-900/60"
                                : currentStatus === "commented"
                                  ? "bg-[#252020] text-rose-300/90 border-rose-900/60"
                                  : currentStatus === "progressing"
                                    ? "bg-[#282218] text-amber-300/90 border-amber-900/60"
                                    : currentStatus === "assigned"
                                      ? "bg-[#182230] text-sky-300/90 border-sky-900/60"
                                      : "bg-[#1f1f1f] text-gray-400 border-[#2f2f2f]"
                              }`}
                          >
                            {currentStatus}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Checkbox Bubble */}
                    <td className="py-2 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                      <div
                        onClick={() => onToggleSelectFileName?.(stem)}
                        className={`w-5 h-5 mx-auto rounded-full flex items-center justify-center transition-all cursor-pointer ${isChecked
                            ? "bg-[#0096ff] border-2 border-[#0096ff] ring-2 ring-[#0096ff]/30 shadow-xs"
                            : "bg-[#141414] border-2 border-[#3a3a3a] group-hover:border-[#0096ff]"
                          }`}
                        title={
                          isChecked
                            ? "Selected (Click to deselect)"
                            : "Click bubble to select file"
                        }
                      >
                        {isChecked && (
                          <div className="w-1.5 h-1.5 rounded-full bg-transparent group-hover:bg-[#0096ff]/50 transition-colors" />
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
