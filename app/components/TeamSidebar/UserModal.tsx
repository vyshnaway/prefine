import React from "react";
import { UserAccount } from "@/app/types";

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingUserId: string | null;
  userName: string;
  setUserName: (val: string) => void;
  userEmail: string;
  setUserEmail: (val: string) => void;
  userRole: string;
  setUserRole: (val: string) => void;
  userPassword: string;
  setUserPassword: (val: string) => void;
  roles: Array<{ id: string; name: string; description?: string }>;
  onSave: (e: React.FormEvent) => void;
}

export default function UserModal({
  isOpen,
  onClose,
  editingUserId,
  userName,
  setUserName,
  userEmail,
  setUserEmail,
  userRole,
  setUserRole,
  userPassword,
  setUserPassword,
  roles,
  onSave,
}: UserModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-[#181818] border border-[#333] rounded-lg w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-3.5 border-b border-[#262626] flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            {editingUserId ? "Edit Team Member" : "Add New Member"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xs cursor-pointer p-1"
          >
            ✕
          </button>
        </div>
        <form onSubmit={onSave} className="p-3.5 flex flex-col gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g. Alex Johnson"
              className="w-full bg-[#111] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#0096ff]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="alex@team.internal"
              className="w-full bg-[#111] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#0096ff]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Assign Role
            </label>
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value)}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#0096ff] cursor-pointer"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Password {editingUserId ? "(Leave blank to keep current)" : ""}
            </label>
            <input
              type="password"
              required={!editingUserId}
              value={userPassword}
              onChange={(e) => setUserPassword(e.target.value)}
              placeholder={editingUserId ? "••••••••" : "Enter password"}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#0096ff]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-[#262626]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-[#222] rounded transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0096ff] hover:bg-[#0082e6] text-white text-xs font-bold rounded shadow-xs transition-colors cursor-pointer"
            >
              {editingUserId ? "Update Member" : "Create Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
