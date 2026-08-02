"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import AuthShell, { Divider, Field, GoogleButton } from "@/components/AuthShell";
import { Spinner } from "@/components/ui";
import { authApi, setToken } from "@/lib/auth";
import { startGoogle, OtpStep, useGoogleError } from "@/components/authFlow";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/studio/knowledge";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(useGoogleError(params));
  const [otp, setOtp] = useState<{ email: string; devCode?: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await authApi.login(email, password);
      setToken(r.token);
      router.push(next);
    } catch (err: any) {
      // unverified accounts get bounced into the OTP step
      if (err.status === 403 && err.detail?.needs_verification) {
        setOtp({ email: err.detail.email, devCode: err.detail.dev_code });
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (otp)
    return (
      <AuthShell title="Verify your email" subtitle={`Confirm the 6-digit code sent to ${otp.email}.`}>
        <OtpStep
          email={otp.email}
          devCode={otp.devCode}
          verb="verify"
          onDone={(token) => {
            setToken(token);
            router.push(next);
          }}
        />
      </AuthShell>
    );

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your studio."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="font-medium" style={{ color: "var(--accent-text)" }}>
            Create an account
          </Link>
        </>
      }
    >
      <GoogleButton label="Continue with Google" onClick={() => startGoogle(setError)} />
      <Divider />
      <form onSubmit={submit}>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0">Password</label>
            <Link href="/forgot" className="text-[13px]" style={{ color: "var(--accent-text)" }}>
              Forgot?
            </Link>
          </div>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        {error && <p className="mb-3 text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn btn-gradient w-full" disabled={busy}>
          {busy ? <Spinner size={16} /> : null} Sign in <ArrowRight />
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
