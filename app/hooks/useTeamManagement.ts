import { useState, useEffect, useCallback } from "react";
import { UserAccount, RoleDefinition } from "@/app/types";
import { DEFAULT_USERS, DEFAULT_ROLES } from "@/app/lib/pocketbase";

export function useTeamManagement(onReloadCatalog?: () => Promise<void> | void) {
  const [users, setUsers] = useState<UserAccount[]>(DEFAULT_USERS);
  const [roles, setRoles] = useState<RoleDefinition[]>(DEFAULT_ROLES);
  const [selectedUserId, setSelectedUserId] = useState<string>(DEFAULT_USERS[1]?.id || DEFAULT_USERS[0]?.id || "");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([DEFAULT_USERS[1].id]);
  const [isTeamSidebarCollapsed, setIsTeamSidebarCollapsed] = useState<boolean>(false);
  const [teamSidebarWidth, setTeamSidebarWidth] = useState<number>(300);

  // Load users and roles from backend on mount
  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.users) && data.users.length > 0) {
          setUsers(data.users);
          if (!selectedUserId || !data.users.some((u: UserAccount) => u.id === selectedUserId)) {
            setSelectedUserId(data.users[0].id);
            setSelectedUserIds([data.users[0].id]);
          }
        }
      })
      .catch((err) => console.error("Failed to load users from /api/users:", err));

    fetch("/api/roles")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.roles) && data.roles.length > 0) {
          setRoles(data.roles);
        }
      })
      .catch((err) => console.error("Failed to load roles from /api/roles:", err));
  }, []);

  const handleSelectUser = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setSelectedUserIds([userId]);
  }, []);

  const handleToggleSelectUser = useCallback((userId: string) => {
    setSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        const next = prev.filter((id) => id !== userId);
        return next.length > 0 ? next : [userId];
      }
      return [...prev, userId];
    });
    setSelectedUserId(userId);
  }, []);

  const handleAddUser = useCallback(async (newUser: Partial<UserAccount>) => {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (data.ok && data.users) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error("Failed to add user:", err);
    }
  }, []);

  const handleUpdateUser = useCallback(async (updated: UserAccount) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    try {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.ok && data.users) {
        setUsers(data.users);
      }
      if (updated.disabled || updated.isArchived) {
        await onReloadCatalog?.();
      }
    } catch (err) {
      console.error("Failed to update user:", err);
    }
  }, [onReloadCatalog]);

  const handleDeleteUser = useCallback(async (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setSelectedUserId((prev) => (prev === userId ? users.find((u) => u.id !== userId)?.id || "" : prev));
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok && data.users) {
        setUsers(data.users);
      }
      await onReloadCatalog?.();
    } catch (err) {
      console.error("Failed to delete/archive user:", err);
    }
  }, [users, onReloadCatalog]);

  const handleAddRole = useCallback(async (newRole: RoleDefinition) => {
    setRoles((prev) => [...prev, newRole]);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRole),
      });
      const data = await res.json();
      if (data.ok && data.roles) {
        setRoles(data.roles);
      }
    } catch (err) {
      console.error("Failed to create role:", err);
    }
  }, []);

  const handleUpdateRole = useCallback(async (updatedRole: RoleDefinition) => {
    setRoles((prev) => prev.map((r) => (r.id === updatedRole.id ? updatedRole : r)));
    try {
      const res = await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRole),
      });
      const data = await res.json();
      if (data.ok && data.roles) {
        setRoles(data.roles);
      }
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  }, []);

  const handleDeleteRole = useCallback(async (roleId: string) => {
    setRoles((prev) => prev.filter((r) => r.id !== roleId));
    try {
      const res = await fetch(`/api/roles?id=${encodeURIComponent(roleId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok && data.roles) {
        setRoles(data.roles);
      }
    } catch (err) {
      console.error("Failed to delete role:", err);
    }
  }, []);

  return {
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
    handleDeleteRole,
  };
}
