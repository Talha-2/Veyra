"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import AuthShell, { Divider, Field, GoogleButton } from "@/components/AuthShell";
import { Spinner } from "@/components/ui";
import { authApi, setToken } from "@/lib/auth";
import { startGoogle, OtpStep, useGoogleError } from "@/components/authFlow";

function SignupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/studio/knowledge";

  const [name, setName] = useState("");
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
      const r = await authApi.signup(email, name, password);
      setOtp({ email: r.email, devCode: r.dev_code });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (otp)
    return (
      <AuthShell title="Verify your email" subtitle={`We sent a 6-digit code to ${otp.email}.`}>
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
      title="Create your account"
      subtitle="Build and operate your voice agent."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium" style={{ color: "var(--accent-text)" }}>
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton label="Sign up with Google" onClick={() => startGoogle(setError)} />
      <Divider />
      <form onSubmit={submit}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        {error && <p className="mb-3 text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn btn-gradient w-full" disabled={busy}>
          {busy ? <Spinner size={16} /> : null} Create account <ArrowRight />
        </button>
      </form>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupInner />
    </Suspense>
  );
}
