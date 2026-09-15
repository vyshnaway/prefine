import React from "react";
import { RoleDefinition } from "@/app/types";

interface RoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingRoleId: string | null;
  roleName: string;
  setRoleName: (val: string) => void;
  roleDescription: string;
  setRoleDescription: (val: string) => void;
  onSave: (e: React.FormEvent) => void;
}

export default function RoleModal({
  isOpen,
  onClose,
  editingRoleId,
  roleName,
  setRoleName,
  roleDescription,
  setRoleDescription,
  onSave,
}: RoleModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-[#181818] border border-[#333] rounded-lg w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="p-3.5 border-b border-[#262626] flex items-center justify-between">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            {editingRoleId ? "Edit Role" : "Create New Role"}
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
              Role Name
            </label>
            <input
              type="text"
              required
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="e.g. Senior QA Inspector"
              className="w-full bg-[#111] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#0096ff]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Role Description / Responsibilities
            </label>
            <textarea
              value={roleDescription}
              onChange={(e) => setRoleDescription(e.target.value)}
              placeholder="Describe tasks, permissions, and responsibilities for this role..."
              rows={3}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-[#0096ff] resize-none"
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
              {editingRoleId ? "Save Changes" : "Create Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
