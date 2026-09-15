import React from "react";
import { Users, Archive, Check } from "lucide-react";
import { UserAccount } from "@/app/types";

export interface UserTaskStats {
  completed: number;
  total: number;
  active: number;
}

interface UserRosterListProps {
  filteredUsers: UserAccount[];
  viewTab: "active" | "archived";
  selectedUserId: string;
  selectedUserIds: string[];
  onSelectUser: (userId: string) => void;
  onToggleSelectUser?: (userId: string) => void;
  getUserTaskStats: (userId: string) => UserTaskStats;
}

export default function UserRosterList({
  filteredUsers,
  viewTab,
  selectedUserId,
  selectedUserIds,
  onSelectUser,
  onToggleSelectUser,
  getUserTaskStats,
}: UserRosterListProps) {
  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 flex flex-col gap-2">
      {filteredUsers.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-xs flex flex-col items-center justify-center gap-2">
          {viewTab === "active" ? (
            <>
              <Users className="h-6 w-6 text-gray-600" />
              <span>No active team members found</span>
            </>
          ) : (
            <>
              <Archive className="h-6 w-6 text-gray-600" />
              <span>No archived members</span>
            </>
          )}
        </div>
      ) : (
        filteredUsers.map((u) => {
          const isSelected =
            selectedUserIds.length > 0
              ? selectedUserIds.includes(u.id)
              : u.id === selectedUserId;
          const stats = getUserTaskStats(u.id);
          const isArchived = u.disabled || u.isArchived;

          return (
            <div
              key={u.id}
              onClick={() => onSelectUser(u.id)}
              className={`group relative p-2.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                isSelected
                  ? isArchived
                    ? "bg-amber-500/10 border-amber-500/60 text-white shadow-xs"
                    : "bg-[#0096ff]/15 border-[#0096ff] text-white shadow-xs"
                  : isArchived
                  ? "bg-[#141414] border-[#222] opacity-70 hover:opacity-100 hover:bg-[#181818] text-gray-400"
                  : "bg-[#1a1a1a] border-[#262626] hover:border-[#3a3a3a] hover:bg-[#202020] text-gray-300"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Profile Circle acting as interactive Checkbox for Multi-Selection */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onToggleSelectUser) {
                      onToggleSelectUser(u.id);
                    } else {
                      onSelectUser(u.id);
                    }
                  }}
                  className={`relative w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? isArchived
                        ? "bg-amber-500 text-black ring-2 ring-amber-500/50 shadow-xs"
                        : "bg-[#0096ff] text-white ring-2 ring-[#0096ff]/50 shadow-xs"
                      : "bg-[#242424] text-gray-300 border border-[#333] group-hover:border-[#0096ff]/60"
                  }`}
                  title={
                    isSelected
                      ? "Selected (Click circle to remove from multi-select)"
                      : "Click circle to multi-select"
                  }
                >
                  {isSelected ? (
                    <Check className="h-4 w-4 text-white stroke-[2.5]" />
                  ) : (
                    <>
                      <span className="group-hover:hidden">
                        {u.name.substring(0, 2).toUpperCase()}
                      </span>
                      <Check className="h-3.5 w-3.5 text-gray-400 hidden group-hover:block" />
                    </>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold truncate ${
                        isArchived ? "line-through text-gray-400" : "text-white"
                      }`}
                    >
                      {u.name}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded uppercase font-semibold shrink-0 bg-[#242424] text-gray-300 border border-[#383838]">
                      {u.role}
                    </span>
                    {isArchived && (
                      <span className="text-[8px] px-1 py-0.2 rounded font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                        Archived
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500 truncate block font-mono">
                    {u.email}
                  </span>
                </div>
              </div>

              {/* Task Badges: Completed / Total Assigned */}
              <div className="text-right shrink-0 flex flex-col items-end pl-2">
                <div className="flex items-center gap-1 font-mono text-xs">
                  <span
                    className="font-bold text-emerald-400"
                    title={`${stats.completed} completed task(s)`}
                  >
                    {stats.completed}
                  </span>
                  <span className="text-gray-500 font-semibold">/</span>
                  <span
                    className="font-bold text-gray-200"
                    title={`${stats.total} total assigned task(s)`}
                  >
                    {stats.total}
                  </span>
                </div>
                <span className="text-[9px] text-gray-400 font-medium block whitespace-nowrap">
                  completed / assigned
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

