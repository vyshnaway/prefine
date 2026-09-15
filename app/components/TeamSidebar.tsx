"use client";

import React, { useState, useRef, useEffect } from "react";
import { Users, ChevronLeft } from "lucide-react";
import { UserAccount, RoleDefinition, ApiResponse_folder, GlobalMetaJson } from "@/app/types";
import { DEFAULT_ROLES } from "@/app/lib/pocketbase";
import { useAuth } from "@/app/lib/auth-context";
import { deriveTaskStatus } from "@/app/lib/task-status";
import { isDateWithinRange } from "@/app/lib/date-filter";

import TeamHeaderControls from "./TeamSidebar/TeamHeaderControls";
import UserRosterList, { UserTaskStats } from "./TeamSidebar/UserRosterList";
import TaskAssignmentFooter from "./TeamSidebar/TaskAssignmentFooter";
import UserModal from "./TeamSidebar/UserModal";
import RoleModal from "./TeamSidebar/RoleModal";
import ArchiveModal from "./TeamSidebar/ArchiveModal";

interface TeamSidebarProps {
  users: UserAccount[];
  selectedUserId: string;
  selectedUserIds?: string[];
  onSelectUser: (userId: string) => void;
  onToggleSelectUser?: (userId: string) => void;
  onAddUser: (user: UserAccount) => void;
  onUpdateUser: (user: UserAccount) => void;
  onDeleteUser: (userId: string) => void;
  roles: RoleDefinition[];
  onAddRole: (role: RoleDefinition) => void;
  onUpdateRole: (role: RoleDefinition) => void;
  folderData: ApiResponse_folder;
  selectedFileName?: string;
  selectedFileNames?: string[];
  selectedFolderPaths?: string[];
  onAssignTasks?: (
    targetFiles: string[],
    assigneeId: string,
    assigneeName: string,
    priority: "low" | "medium" | "high",
    status: any,
    targetFolder?: string
  ) => void;
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
  sidebarWidth: number;
  onWidthChange?: (width: number) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  isDateFilterEnabled?: boolean;
  setIsDateFilterEnabled?: React.Dispatch<React.SetStateAction<boolean>>;
  includeNullDates?: boolean;
  setIncludeNullDates?: React.Dispatch<React.SetStateAction<boolean>>;
  startDate?: string;
  setStartDate?: (date: string) => void;
  endDate?: string;
  setEndDate?: (date: string) => void;
}

export default function TeamSidebar({
  users,
  selectedUserId,
  selectedUserIds = [],
  onSelectUser,
  onToggleSelectUser,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  roles = DEFAULT_ROLES,
  onAddRole,
  onUpdateRole,
  folderData,
  selectedFileName = "",
  selectedFileNames = [],
  selectedFolderPaths = [],
  onAssignTasks,
  onAssignBatch,
  sidebarWidth,
  onWidthChange,
  isCollapsed = false,
  onToggleCollapse,
  isDateFilterEnabled: propIsDateFilterEnabled,
  setIsDateFilterEnabled: propSetIsDateFilterEnabled,
  includeNullDates: propIncludeNullDates,
  setIncludeNullDates: propSetIncludeNullDates,
  startDate: propStartDate,
  setStartDate: propSetStartDate,
  endDate: propEndDate,
  setEndDate: propSetEndDate,
}: TeamSidebarProps) {
  const { role } = useAuth();
  const isAdmin = role === "admin";

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [viewTab, setViewTab] = useState<"active" | "archived">("active");
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  // Date range filter state (props with fallback to local state)
  const [localIsDateFilterEnabled, setLocalIsDateFilterEnabled] = useState(true);
  const [localIncludeNullDates, setLocalIncludeNullDates] = useState(true);
  const [localStartDate, setLocalStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [localEndDate, setLocalEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  const isDateFilterEnabled = propIsDateFilterEnabled ?? localIsDateFilterEnabled;
  const setIsDateFilterEnabled = propSetIsDateFilterEnabled ?? setLocalIsDateFilterEnabled;
  const includeNullDates = propIncludeNullDates ?? localIncludeNullDates;
  const setIncludeNullDates = propSetIncludeNullDates ?? setLocalIncludeNullDates;
  const startDate = propStartDate ?? localStartDate;
  const setStartDate = propSetStartDate ?? setLocalStartDate;
  const endDate = propEndDate ?? localEndDate;
  const setEndDate = propSetEndDate ?? setLocalEndDate;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        roleDropdownRef.current &&
        !roleDropdownRef.current.contains(event.target as Node)
      ) {
        setIsRoleMenuOpen(false);
      }
    };
    if (isRoleMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRoleMenuOpen]);

  // Create / Edit User Modal state
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<string>(roles[0]?.id || "annotator");
  const [userPassword, setUserPassword] = useState("");

  // Create / Edit Role Modal state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");

  // Archive Confirmation Modal state
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [usersToArchive, setUsersToArchive] = useState<UserAccount[]>([]);
  const [isPreparingArchive, setIsPreparingArchive] = useState(false);

  // Fetch latest global .index.json for accurate cross-folder active task counts
  const [globalMeta, setGlobalMeta] = useState<GlobalMetaJson | null>(null);

  const fetchGlobalMeta = async () => {
    try {
      const res = await fetch("/api/reindex");
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data?.meta) {
          setGlobalMeta(data.meta);
          return data.meta;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch /api/reindex in TeamSidebar:", err);
    }
    return null;
  };

  const rebuildGlobalMeta = async () => {
    try {
      const res = await fetch("/api/reindex", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data?.meta) {
          setGlobalMeta(data.meta);
          return data.meta;
        }
      }
    } catch (err) {
      console.warn("Failed to rebuild /api/reindex in TeamSidebar:", err);
    }
    return null;
  };

  useEffect(() => {
    fetchGlobalMeta();
  }, [folderData]);

  // Helper function to calculate completed/total task stats for a user within selected date range
  const getUserTaskStats = (userId: string): UserTaskStats => {
    const sourceMetafiles = globalMeta?.metafiles || folderData?.metafiles || {};
    const sourceMetafolders = globalMeta?.metafolders || folderData?.metafolders || {};

    let completed = 0;
    let total = 0;
    let active = 0;

    for (const [_, meta] of Object.entries(sourceMetafiles)) {
      if (meta?.assignedTo === userId) {
        const taskDate = meta.exportedAt || meta.updatedAt || meta.createdAt;
        if (isDateWithinRange(taskDate, startDate, endDate, includeNullDates)) {
          total++;
          const status = deriveTaskStatus(meta);
          if (status === "completed") {
            completed++;
          } else if (status !== "commented") {
            active++;
          }
        }
      }
    }

    for (const [_, meta] of Object.entries(sourceMetafolders)) {
      if (meta?.assignedTo === userId) {
        const taskDate = meta.updatedAt || meta.createdAt;
        if (isDateWithinRange(taskDate, startDate, endDate, includeNullDates)) {
          total++;
          const status = meta.status || "assigned";
          if (status === "completed") {
            completed++;
          } else if (status !== "commented") {
            active++;
          }
        }
      }
    }

    return { completed, total, active };
  };

  const getActiveTaskCountForUser = (userId: string): number => {
    return getUserTaskStats(userId).active;
  };

  const activeUsersList = users.filter((u) => !u.disabled && !u.isArchived);
  const archivedUsersList = users.filter((u) => u.disabled || u.isArchived);
  const selectedUser = users.find((u) => u.id === selectedUserId) || activeUsersList[0] || users[0];

  const filteredUsers = (viewTab === "active" ? activeUsersList : archivedUsersList).filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  // User Actions
  const handleOpenCreateUser = () => {
    setEditingUserId(null);
    setUserName("");
    setUserEmail("");
    setUserRole(roles[0]?.id || "annotator");
    setUserPassword("");
    setShowUserModal(true);
  };

  const handleOpenEditUser = (user: UserAccount, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingUserId(user.id);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserRole(user.role);
    setUserPassword("");
    setShowUserModal(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) return;

    if (editingUserId) {
      onUpdateUser({
        id: editingUserId,
        name: userName.trim(),
        email: userEmail.trim(),
        role: userRole,
        password: userPassword.trim() ? userPassword.trim() : undefined,
      });
    } else {
      onAddUser({
        id: `user_${Date.now()}`,
        name: userName.trim(),
        email: userEmail.trim(),
        role: userRole,
        password: userPassword.trim(),
        disabled: false,
      });
    }
    setShowUserModal(false);
  };

  // Role Actions
  const handleOpenCreateRole = () => {
    setEditingRoleId(null);
    setRoleName("");
    setRoleDescription("");
    setShowRoleModal(true);
  };

  const handleOpenEditRole = (roleItem: RoleDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRoleId(roleItem.id);
    setRoleName(roleItem.name);
    setRoleDescription(roleItem.description || "");
    setShowRoleModal(true);
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;

    if (editingRoleId) {
      onUpdateRole({
        id: editingRoleId,
        name: roleName.trim(),
        description: roleDescription.trim(),
      });
    } else {
      const newId = roleName.toLowerCase().replace(/\s+/g, "_");
      onAddRole({
        id: newId,
        name: roleName.trim(),
        description: roleDescription.trim(),
      });
    }
    setShowRoleModal(false);
  };

  const handlePrepareArchive = async () => {
    const targets =
      selectedUserIds.length > 1
        ? activeUsersList.filter((u) => selectedUserIds.includes(u.id))
        : selectedUser
          ? [selectedUser]
          : [];
    if (targets.length > 0) {
      setUsersToArchive(targets);
      setIsPreparingArchive(true);
      try {
        await rebuildGlobalMeta();
      } finally {
        setIsPreparingArchive(false);
        setShowArchiveModal(true);
      }
    }
  };

  const handleRestoreUsers = () => {
    const targets =
      selectedUserIds.length > 1
        ? archivedUsersList.filter((u) => selectedUserIds.includes(u.id))
        : selectedUser
          ? [selectedUser]
          : [];
    targets.forEach((u) => {
      onUpdateUser({
        ...u,
        disabled: false,
        isArchived: false,
      });
    });
  };

  const handleConfirmArchive = () => {
    usersToArchive.forEach((u) => {
      onUpdateUser({
        ...u,
        disabled: true,
        isArchived: true,
      });
    });
    setShowArchiveModal(false);
  };

  // Collapsed Sidebar rendering
  if (isCollapsed) {
    return (
      <aside className="w-12 border-l border-[#2b2b2b] bg-[#161616] h-full shrink-0 flex flex-col items-center py-4 justify-between select-none">
        <button
          type="button"
          onClick={() => onToggleCollapse?.(false)}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-[#252525] rounded transition-colors cursor-pointer"
          title="Expand Team & Role Panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-col items-center gap-4">
          <Users className="h-4 w-4 text-[#0096ff]" />
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest [writing-mode:vertical-lr] rotate-180">
            Team & Roles
          </span>
        </div>
        <div className="w-2 h-2 rounded-full bg-[#0096ff]" />
      </aside>
    );
  }

  // Resizing logic for TeamSidebar
  const minWidth = 300;
  const maxWidth = typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.3) : 420;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <aside
      style={{ width: `${Math.max(minWidth, Math.min(maxWidth, sidebarWidth))}px` }}
      className="relative flex flex-col border-l border-[#2b2b2b] bg-[#161616] h-full shrink-0 select-none z-20 overflow-hidden"
    >
      {/* Left-edge Resize Handle */}
      {onWidthChange && (
        <div
          onMouseDown={handleMouseDown}
          className="absolute left-0 top-0 bottom-0 w-0.5 cursor-col-resize hover:bg-[#0096ff]/60 transition-colors z-10 group"
          title="Drag to resize panel"
        />
      )}

      {/* Header: Controls, Tabs, Role Selector, Search */}
      <TeamHeaderControls
        roles={roles}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        users={users}
        activeUsersList={activeUsersList}
        archivedUsersList={archivedUsersList}
        isRoleMenuOpen={isRoleMenuOpen}
        setIsRoleMenuOpen={setIsRoleMenuOpen}
        roleDropdownRef={roleDropdownRef}
        isAdmin={isAdmin}
        handleOpenEditRole={handleOpenEditRole}
        handleOpenCreateRole={handleOpenCreateRole}
        viewTab={viewTab}
        setViewTab={setViewTab}
        handleOpenCreateUser={handleOpenCreateUser}
        handleOpenEditUser={handleOpenEditUser}
        selectedUser={selectedUser}
        selectedUserIds={selectedUserIds}
        isPreparingArchive={isPreparingArchive}
        onPrepareArchive={handlePrepareArchive}
        onRestoreUsers={handleRestoreUsers}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Member Roster List */}
      <UserRosterList
        filteredUsers={filteredUsers}
        viewTab={viewTab}
        selectedUserId={selectedUserId}
        selectedUserIds={selectedUserIds}
        onSelectUser={onSelectUser}
        onToggleSelectUser={onToggleSelectUser}
        getUserTaskStats={getUserTaskStats}
      />

      {/* Task Assignment Footer */}
      <TaskAssignmentFooter
        selectedUserIds={selectedUserIds}
        users={users}
        selectedFileNames={selectedFileNames}
        selectedFileName={selectedFileName}
        selectedFolderPaths={selectedFolderPaths}
        folderData={folderData}
        viewTab={viewTab}
        onAssignBatch={onAssignBatch}
        onAssignTasks={onAssignTasks}
      />

      {/* User Create/Edit Modal */}
      <UserModal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        editingUserId={editingUserId}
        userName={userName}
        setUserName={setUserName}
        userEmail={userEmail}
        setUserEmail={setUserEmail}
        userRole={userRole}
        setUserRole={setUserRole}
        userPassword={userPassword}
        setUserPassword={setUserPassword}
        roles={roles}
        onSave={handleSaveUser}
      />

      {/* Role Create/Edit Modal */}
      <RoleModal
        isOpen={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        editingRoleId={editingRoleId}
        roleName={roleName}
        setRoleName={setRoleName}
        roleDescription={roleDescription}
        setRoleDescription={setRoleDescription}
        onSave={handleSaveRole}
      />

      {/* Archive Modal */}
      <ArchiveModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        usersToArchive={usersToArchive}
        getActiveTaskCountForUser={getActiveTaskCountForUser}
        onConfirmArchive={handleConfirmArchive}
      />
    </aside>
  );
}
