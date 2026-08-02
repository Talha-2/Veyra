"use client";

/* Global toast host (sonner), themed to the studio design tokens so success,
   error, and info toasts read as part of the product rather than a bolt on.
   Re export `toast` so pages call one helper: toast.success(...) / toast.error(...). */

import { Toaster } from "sonner";

export { toast } from "sonner";

export function Toasts() {
  return (
    <Toaster
      position="bottom-right"
      gap={10}
      offset={20}
      toastOptions={{
        style: {
          background: "var(--surface-raised)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-overlay)",
          fontFamily: "var(--font-studio)",
          fontSize: "13px",
          padding: "13px 15px",
        },
        classNames: {
          title: "toast-title",
          description: "toast-desc",
          success: "toast-success",
          error: "toast-error",
        },
      }}
    />
  );
}
