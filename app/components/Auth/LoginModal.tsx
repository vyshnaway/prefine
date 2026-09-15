"use client";

import React, { useState } from "react";
import { Lock, Mail, X, AlertCircle, ArrowRight, UserCheck } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { DEFAULT_USERS } from "@/app/lib/pocketbase";
import { PACKAGE_NAME, UserAccount, ENABLE_DEMO_ACCOUNTS } from "@/app/types";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableUsers?: UserAccount[];
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const { loginWithPassword, switchDemoUser, user: currentUser, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDemoUsers, setShowDemoUsers] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    const res = await loginWithPassword(email.trim(), password);
    setIsSubmitting(false);

    if (!res.ok) {
      setError(res.error || "Authentication failed. Please check your credentials.");
    }
  };

  const isFullPage = !isAuthenticated;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 ${
        isFullPage ? "bg-[#0d0d0d]" : "bg-black/80 backdrop-blur-md"
      }`}
    >
      {/* Centered Ultra-Clean Login Card */}
      <div className="relative w-full max-w-md bg-[#181818] border border-[#2e2e2e] rounded-2xl shadow-2xl p-8 flex flex-col gap-6">
        {/* Close button if opened while logged in */}
        {currentUser && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white rounded-md hover:bg-[#262626] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center">
          <div className="p-3 bg-[#111] border border-[#2a2a2a] rounded-2xl shadow-md mb-3">
            <img
              src="/icon-512x512.png"
              alt="App Brand Logo"
              className="h-12 w-12 object-contain"
            />
          </div>
          <h2 className="text-base font-bold text-white tracking-tight uppercase font-mono">
            {PACKAGE_NAME}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Sign in to access AI segmentation workspace
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-400 animate-in fade-in">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@team.internal"
                className="w-full bg-[#111] border border-[#2b2b2b] focus:border-[#0096ff] rounded-lg pl-9 pr-3 py-2.5 text-xs text-white placeholder-gray-600 outline-none transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#111] border border-[#2b2b2b] focus:border-[#0096ff] rounded-lg pl-9 pr-3 py-2.5 text-xs text-white placeholder-gray-600 outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full py-2.5 px-4 bg-[#0096ff] hover:bg-[#0082e6] text-white text-xs font-bold rounded-lg transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? "Authenticating..." : "Sign In to Workspace"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </form>

        {/* Demo Switcher Accordion / Toggle */}
        {ENABLE_DEMO_ACCOUNTS && (
          <div className="pt-2 border-t border-[#262626] flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowDemoUsers(!showDemoUsers)}
              className="flex items-center justify-between text-[11px] font-bold text-gray-400 hover:text-white transition-colors cursor-pointer py-1"
            >
              <span className="flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-[#0096ff]" />
                Quick Demo Accounts ({DEFAULT_USERS.length})
              </span>
              <span className="text-[10px] text-gray-500 font-mono">
                {showDemoUsers ? "Hide" : "Show"}
              </span>
            </button>

            {showDemoUsers && (
              <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                {DEFAULT_USERS.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => switchDemoUser(u)}
                    className="p-2.5 bg-[#111] hover:bg-[#1f1f1f] border border-[#2a2a2a] hover:border-[#383838] rounded-lg flex items-center justify-between transition-all cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-[#222] border border-[#333] flex items-center justify-center text-[10px] font-bold text-white">
                        {u.name[0]?.toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white">{u.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono">{u.email}</span>
                      </div>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-mono font-bold border ${
                        u.role === "admin"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          : u.role === "reviewer"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {u.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
