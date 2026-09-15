"use client";

import React from "react";
import { LogOut, ArrowLeftRightIcon } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";

export default function UserProfileBadge() {
  const { user, role, logout, openLoginModal } = useAuth();

  const getRoleBadge = (userRole: string) => {
    switch (userRole) {
      case "admin":
        return {
          bg: "bg-purple-500/15 text-purple-400 border-purple-500/30",
          label: "Admin",
        };
      case "reviewer":
        return {
          bg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
          label: "Reviewer",
        };
      default:
        return {
          bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          label: "Annotator",
        };
    }
  };

  const badge = getRoleBadge(role);

  return (
    <div className="relative w-full flex items-center justify-between gap-2 px-2 py-1 text-xs font-semibold text-gray-200 select-none">
      {/* User Info Segment */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="h-5 w-5 rounded bg-[#2b2b2b] border border-[#383838] flex items-center justify-center font-bold text-[10px] text-white shrink-0">
          {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[11px] font-bold text-white truncate max-w-[85px] leading-tight">
            {user?.name || "Guest"}
          </span>
          <span className={`px-1 py-0.2 rounded text-[8px] font-bold uppercase tracking-wider border ${badge.bg}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Action Buttons: Switch User & Logout */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => logout()}
          className="p-1 text-gray-400 hover:text-rose-400 hover:bg-rose-500/15 rounded transition-colors cursor-pointer"
          title="Sign Out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
