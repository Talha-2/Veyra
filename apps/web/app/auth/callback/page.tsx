"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/auth";
import { Spinner } from "@/components/ui";

/* Google OAuth lands here with #token=<jwt>. Store it and enter the studio. */
export default function AuthCallback() {
  const router = useRouter();
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get("token");
    if (token) {
      setToken(token);
      router.replace("/studio/knowledge");
    } else {
      router.replace("/login?error=google");
    }
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center gap-3">
      <Spinner size={20} />
      <span className="text-secondary">Signing you in…</span>
    </main>
  );
}
