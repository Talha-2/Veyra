"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell, { Field } from "@/components/AuthShell";
import { Spinner } from "@/components/ui";
import { authApi, setToken } from "@/lib/auth";
import { OtpStep } from "@/components/authFlow";

function ForgotInner() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; devCode?: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await authApi.requestReset(email);
      setSent({ email, devCode: r.dev_code });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <AuthShell title="Reset your password" subtitle={`Enter the code sent to ${sent.email} and a new password.`}>
        <OtpStep
          email={sent.email}
          devCode={sent.devCode}
          verb="reset"
          onDone={(token) => {
            setToken(token);
            router.push("/studio/knowledge");
          }}
        />
      </AuthShell>
    );

  return (
    <AuthShell
      title="Forgot password"
      subtitle="We'll send a code to reset it."
      footer={
        <Link href="/login" className="font-medium" style={{ color: "var(--accent-text)" }}>
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit}>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        {error && <p className="mb-3 text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
        <button className="btn btn-gradient w-full" disabled={busy}>
          {busy ? <Spinner size={16} /> : null} Send reset code
        </button>
      </form>
    </AuthShell>
  );
}

export default function ForgotPage() {
  return (
    <Suspense>
      <ForgotInner />
    </Suspense>
  );
}
