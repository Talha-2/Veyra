"use client";

import { useState } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { Spinner } from "@/components/ui";
import { authApi } from "@/lib/auth";

/** Map ?error=google from the OAuth callback into a friendly message. */
export function useGoogleError(params: ReadonlyURLSearchParams): string | null {
  return params.get("error") === "google" ? "Google sign in failed or was cancelled. Try again." : null;
}

/** Kick off Google OAuth if the server has credentials; otherwise explain. */
export async function startGoogle(setError: (m: string | null) => void) {
  setError(null);
  try {
    const cfg = await authApi.googleConfig();
    if (cfg.configured && cfg.auth_url) {
      window.location.href = cfg.auth_url;
    } else {
      setError("Google sign in isn't configured yet. Add GOOGLE_CLIENT_ID/SECRET to .env, then restart the server.");
    }
  } catch {
    setError("Couldn't reach the auth server.");
  }
}

/** Shared 6-digit code step used by verify + reset flows. */
export function OtpStep({
  email,
  devCode,
  verb,
  onDone,
}: {
  email: string;
  devCode?: string;
  verb: "verify" | "reset";
  onDone: (token: string) => void;
}) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = verb === "verify" ? await authApi.verify(email, code) : await authApi.reset(email, code, password);
      onDone(r.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      if (verb === "verify") await authApi.resend(email);
      else await authApi.requestReset(email);
      setResent(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={submit}>
      {devCode && (
        <div
          className="mb-4 rounded-[var(--radius-sm)] p-3 text-[13px]"
          style={{ background: "var(--accent-subtle)", color: "var(--accent-text)", border: "1px solid var(--border-accent)" }}
        >
          Dev mode — your code is <b className="mono">{devCode}</b>
        </div>
      )}
      <label className="label">6-digit code</label>
      <input
        className="input mono text-center"
        style={{ letterSpacing: "0.4em", fontSize: 20 }}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        maxLength={6}
        required
        autoFocus
      />
      {verb === "reset" && (
        <div className="mt-4">
          <label className="label">New password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </div>
      )}
      {error && <p className="mt-3 text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
      <button className="btn btn-gradient mt-4 w-full" disabled={busy || code.length < 6}>
        {busy ? <Spinner size={16} /> : null} {verb === "verify" ? "Verify & continue" : "Reset password"}
      </button>
      <button type="button" className="btn btn-ghost mt-2 w-full" onClick={resend}>
        {resent ? "Code re-sent" : "Resend code"}
      </button>
    </form>
  );
}
