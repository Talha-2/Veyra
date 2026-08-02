"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, getToken } from "./api";

const TOKEN_KEY = "rv-auth-token";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  email_verified: boolean;
  avatar_url?: string | null;
};

export function setToken(t: string) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {}
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function post(path: string, body: unknown) {
  const resp = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const d = (data as any).detail;
    const err: any = new Error(
      typeof d === "string" ? d : d?.message ?? `Request failed (${resp.status})`
    );
    err.status = resp.status;
    err.detail = d;
    throw err;
  }
  return data;
}

export const authApi = {
  signup: (email: string, name: string, password: string) => post("/api/auth/signup", { email, name, password }),
  login: (email: string, password: string) => post("/api/auth/login", { email, password }),
  verify: (email: string, code: string) => post("/api/auth/verify", { email, code }),
  resend: (email: string) => post("/api/auth/resend", { email }),
  requestReset: (email: string) => post("/api/auth/request-reset", { email }),
  reset: (email: string, code: string, password: string) => post("/api/auth/reset", { email, code, password }),
  googleConfig: async () => {
    const r = await fetch(`${API_URL}/api/auth/google/config`);
    return r.json();
  },
  me: async (): Promise<AuthUser | null> => {
    const t = getToken();
    if (!t) return null;
    const r = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) return null;
    return r.json();
  },
};

/** Session hook. `status`: "loading" | "authed" | "guest". */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<"loading" | "authed" | "guest">("loading");

  const refresh = useCallback(async () => {
    const u = await authApi.me();
    setUser(u);
    setStatus(u ? "authed" : "guest");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus("guest");
  }, []);

  return { user, status, refresh, logout };
}
