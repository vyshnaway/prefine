"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { pb, DEFAULT_USERS } from "@/app/lib/pocketbase";
import { UserAccount, UserRole } from "@/app/types";

interface AuthContextType {
  user: UserAccount | null;
  isAuthenticated: boolean;
  role: UserRole;
  isLoading: boolean;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  loginWithPassword: (email: string, pass: string) => Promise<{ ok: boolean; error?: string }>;
  switchDemoUser: (user: UserAccount) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_USER_STORAGE_KEY = "seg_app_active_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Initialize session on mount
  useEffect(() => {
    // 1. Check if PocketBase has a valid verified auth session
    if (pb.authStore.isValid && pb.authStore.model) {
      const model = pb.authStore.model;
      setUser({
        id: model.id,
        name: model.name || model.email?.split("@")[0] || "User",
        email: model.email,
        role: model.role || "annotator",
        avatar: model.avatar || "",
      });
      setIsLoginModalOpen(false);
    } else {
      // Not authenticated: Must sign in with password
      setUser(null);
      setIsLoginModalOpen(true);
    }
    setIsLoading(false);

    // Subscribe to PocketBase auth state changes
    const unsub = pb.authStore.onChange(() => {
      if (pb.authStore.isValid && pb.authStore.model) {
        const model = pb.authStore.model;
        const loggedInUser: UserAccount = {
          id: model.id,
          name: model.name || model.email?.split("@")[0] || "User",
          email: model.email,
          role: model.role || "annotator",
          avatar: model.avatar || "",
        };
        setUser(loggedInUser);
        setIsLoginModalOpen(false);
      } else {
        setUser(null);
        setIsLoginModalOpen(true);
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const loginWithPassword = async (email: string, pass: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const authData = await pb.collection("users").authWithPassword(email, pass);
      if (authData?.record) {
        const loggedInUser: UserAccount = {
          id: authData.record.id,
          name: authData.record.name || authData.record.email?.split("@")[0] || "User",
          email: authData.record.email,
          role: (authData.record.role as UserRole) || "annotator",
          avatar: authData.record.avatar || "",
        };
        setUser(loggedInUser);
        try {
          localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(loggedInUser));
        } catch {}
        setIsLoginModalOpen(false);
        return { ok: true };
      }
      return { ok: false, error: "Failed to authenticate" };
    } catch (err: any) {
      const msg = err?.message || "Invalid email or password";
      return { ok: false, error: msg };
    }
  };

  const switchDemoUser = (demoUser: UserAccount) => {
    setUser(demoUser);
    try {
      localStorage.setItem(LOCAL_USER_STORAGE_KEY, JSON.stringify(demoUser));
    } catch {}
    setIsLoginModalOpen(false);
  };

  const logout = () => {
    pb.authStore.clear();
    try {
      localStorage.removeItem(LOCAL_USER_STORAGE_KEY);
    } catch {}
    setUser(null);
    setIsLoginModalOpen(true);
  };

  const role: UserRole = user?.role || "annotator";

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        role,
        isLoading,
        isLoginModalOpen,
        openLoginModal: () => setIsLoginModalOpen(true),
        closeLoginModal: () => setIsLoginModalOpen(false),
        loginWithPassword,
        switchDemoUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
