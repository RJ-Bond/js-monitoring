"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User } from "@/types/server";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (token: string, user: User, remember?: boolean) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, token: null,
  login: () => {}, logout: () => {}, updateUser: () => {},
  isAuthenticated: false,
  isLoading: true,
});

const TOKEN_KEY = "jsmon-token";
const USER_KEY  = "jsmon-user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser]   = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
    const u = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
    if (t && u) { setToken(t); setUser(JSON.parse(u) as User); }
    setIsLoading(false);
  }, []);

  const login = useCallback((t: string, u: User, remember = true) => {
    setToken(t); setUser(u);
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, t);
    storage.setItem(USER_KEY, JSON.stringify(u));
    if (!remember) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null); setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }, []);

  const updateUser = useCallback((u: User) => {
    setUser(u);
    // persist to whichever storage currently holds the token
    const storage = localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
    storage.setItem(USER_KEY, JSON.stringify(u));
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, isAuthenticated: !!token, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
