import React, { useRef } from "react";
import { Tag, ChevronDown, Check, Edit2, Plus, Users, Archive, RotateCcw, Search } from "lucide-react";
import { RoleDefinition, UserAccount } from "@/app/types";

interface TeamHeaderControlsProps {
  roles: RoleDefinition[];
  roleFilter: string;
  setRoleFilter: (role: string) => void;
  users: UserAccount[];
  activeUsersList: UserAccount[];
  archivedUsersList: UserAccount[];
  isRoleMenuOpen: boolean;
  setIsRoleMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  roleDropdownRef: React.RefObject<HTMLDivElement | null>;
  isAdmin: boolean;
  handleOpenEditRole: (role: RoleDefinition, e: React.MouseEvent) => void;
  handleOpenCreateRole: () => void;
  viewTab: "active" | "archived";
  setViewTab: (tab: "active" | "archived") => void;
  handleOpenCreateUser: () => void;
  handleOpenEditUser: (user: UserAccount, e: React.MouseEvent) => void;
  selectedUser: UserAccount | undefined;
  selectedUserIds: string[];
  isPreparingArchive: boolean;
  onPrepareArchive: () => void;
  onRestoreUsers: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export default function TeamHeaderControls({
  roles,
  roleFilter,
  setRoleFilter,
  users,
  activeUsersList,
  archivedUsersList,
  isRoleMenuOpen,
  setIsRoleMenuOpen,
  roleDropdownRef,
  isAdmin,
  handleOpenEditRole,
  handleOpenCreateRole,
  viewTab,
  setViewTab,
  handleOpenCreateUser,
  handleOpenEditUser,
  selectedUser,
  selectedUserIds,
  isPreparingArchive,
  onPrepareArchive,
  onRestoreUsers,
  searchQuery,
  setSearchQuery,
}: TeamHeaderControlsProps) {
  return (
    <div className="p-2.5 border-b border-[#262626] bg-[#141414] flex flex-col gap-2">
      {/* Rich Descriptive Role Dropdown */}
      <div className="relative w-full" ref={roleDropdownRef}>
        {/* Trigger Button */}
        <button
          type="button"
          onClick={() => setIsRoleMenuOpen((prev) => !prev)}
          className="w-full bg-[#111] hover:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] focus:border-[#0096ff] rounded px-2.5 py-1.5 text-xs text-left flex items-center justify-between transition-all cursor-pointer shadow-xs"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Tag className="h-3.5 w-3.5 text-[#0096ff] shrink-0" />
            <span className="font-bold text-white truncate">
              {roleFilter === "all"
                ? `All Roles (${users.length})`
                : roles.find((r) => r.id === roleFilter)?.name || roleFilter}
            </span>
          </div>
          <ChevronDown
            className={`h-3.5 w-3.5 text-gray-400 shrink-0 transition-transform duration-150 ${
              isRoleMenuOpen ? "rotate-180 text-[#0096ff]" : ""
            }`}
          />
        </button>

        {/* Expanded Rich Descriptive Role Menu */}
        {isRoleMenuOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-[#181818] border border-[#333] rounded-lg shadow-2xl z-50 p-1.5 flex flex-col gap-1 max-h-80 overflow-y-auto custom-scrollbar backdrop-blur-md">
            {/* Option: All Roles */}
            <div
              onClick={() => {
                setRoleFilter("all");
                setIsRoleMenuOpen(false);
              }}
              className={`p-2 rounded-md transition-all cursor-pointer flex items-center justify-between ${
                roleFilter === "all"
                  ? "bg-[#0096ff]/20 border border-[#0096ff]/50 text-white"
                  : "hover:bg-[#242424] text-gray-300"
              }`}
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white">All Roles</span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    ({users.length} members)
                  </span>
                </div>
                <span className="text-[10px] text-gray-400">
                  View all team members across all assignments
                </span>
              </div>
              {roleFilter === "all" && (
                <Check className="h-3.5 w-3.5 text-[#0096ff] shrink-0" />
              )}
            </div>

            <div className="h-px bg-[#262626] my-0.5" />

            {/* Specific Roles with full descriptions */}
            {roles.map((r) => {
              const isCurrent = roleFilter === r.id;
              const count = users.filter((u) => u.role === r.id).length;

              return (
                <div
                  key={r.id}
                  onClick={() => {
                    setRoleFilter(r.id);
                    setIsRoleMenuOpen(false);
                  }}
                  className={`p-2 rounded-md transition-all cursor-pointer flex items-start justify-between group/role ${
                    isCurrent
                      ? "bg-[#0096ff]/20 border border-[#0096ff]/50 text-white"
                      : "hover:bg-[#242424] text-gray-300"
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate">
                        {r.name}
                      </span>
                      <span className="text-[9px] px-1 py-0.2 rounded font-mono uppercase font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                        {count} {count === 1 ? "member" : "members"}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
                      {r.description || "No description provided."}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    {/* Edit Role Trigger (Admin only) */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsRoleMenuOpen(false);
                          handleOpenEditRole(r, e);
                        }}
                        className="p-1 hover:bg-[#333] text-gray-400 hover:text-white rounded transition-colors opacity-70 group-hover/role:opacity-100"
                        title={`Edit "${r.name}"`}
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                    {isCurrent && (
                      <Check className="h-3.5 w-3.5 text-[#0096ff]" />
                    )}
                  </div>
                </div>
              );
            })}

            {isAdmin && (
              <>
                <div className="h-px bg-[#262626] my-0.5" />
                {/* + Create New Role Option at the bottom of the dropdown list */}
                <button
                  type="button"
                  onClick={() => {
                    setIsRoleMenuOpen(false);
                    handleOpenCreateRole();
                  }}
                  className="p-2 bg-[#202020] hover:bg-[#282828] border border-[#333] hover:border-[#0096ff] text-gray-200 hover:text-white rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-0.5"
                >
                  <Plus className="h-3.5 w-3.5 text-[#0096ff]" />
                  <span>+ Create New Role</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Active vs Archived Segmented Tabs */}
      <div className="grid grid-cols-2 bg-[#101010] p-0.5 rounded-md border border-[#262626]">
        <button
          type="button"
          onClick={() => setViewTab("active")}
          className={`py-1 text-[11px] font-bold rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            viewTab === "active"
              ? "bg-[#222] text-white shadow-xs border border-[#333]"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Users className="h-3 w-3" />
          <span>Active </span>
        </button>
        <button
          type="button"
          onClick={() => setViewTab("archived")}
          className={`py-1 text-[11px] font-bold rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            viewTab === "archived"
              ? "bg-[#222] text-amber-400 shadow-xs border border-[#333]"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          <Archive className="h-3 w-3" />
          <span>Archived ({archivedUsersList.length})</span>
        </button>
      </div>

      {/* [Add Member] [Edit Member] [Archive/Restore Member] in a single row */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={!isAdmin}
          onClick={handleOpenCreateUser}
          className="py-1.5 px-2 bg-[#202020] hover:bg-[#282828] text-gray-200 border border-[#333] hover:border-[#0096ff] rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title={isAdmin ? "Add New Member" : "Admin privileges required"}
        >
          <Plus className="h-3 w-3 text-[#0096ff]" />
          <span>Add</span>
        </button>

        <button
          type="button"
          disabled={!selectedUser || selectedUserIds.length > 1 || !isAdmin}
          onClick={(e) =>
            selectedUser && selectedUserIds.length <= 1 && handleOpenEditUser(selectedUser, e)
          }
          className="py-1.5 px-2 bg-[#202020] hover:bg-[#282828] text-gray-200 border border-[#333] hover:border-[#0096ff] rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
          title={
            !isAdmin
              ? "Admin privileges required"
              : selectedUserIds.length > 1
              ? "Cannot edit multiple members simultaneously"
              : "Edit Selected Member"
          }
        >
          <Edit2 className="h-3 w-3 text-[#0096ff]" />
          <span>Edit</span>
        </button>

        {viewTab === "active" ? (
          <button
            type="button"
            disabled={!selectedUser || !isAdmin || isPreparingArchive}
            onClick={onPrepareArchive}
            className="py-1.5 px-2 bg-[#202020] hover:bg-amber-500/20 text-gray-300 hover:text-amber-400 border border-[#333] hover:border-amber-500/30 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title={
              !isAdmin
                ? "Admin privileges required"
                : selectedUserIds.length > 1
                ? `Archive ${selectedUserIds.length} Members`
                : "Disable & Archive Member"
            }
          >
            <Archive
              className={`h-3 w-3 text-amber-400 ${isPreparingArchive ? "animate-pulse" : ""}`}
            />
            <span>{isPreparingArchive ? "Checking..." : "Archive"}</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={!selectedUser || !isAdmin}
            onClick={onRestoreUsers}
            className="py-1.5 px-2 bg-[#202020] hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-400 border border-[#333] hover:border-emerald-500/30 rounded text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            title={!isAdmin ? "Admin privileges required" : "Restore Member to Active Team"}
          >
            <RotateCcw className="h-3 w-3 text-emerald-400" />
            <span>Restore</span>
          </button>
        )}
      </div>



      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            viewTab === "active" ? "Search active members..." : "Search archived members..."
          }
          className="w-full bg-[#111] border border-[#2a2a2a] rounded-md pl-7 pr-3 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#0096ff]"
        />
      </div>
    </div>
  );
}

