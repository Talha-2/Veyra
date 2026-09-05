"use client";

/* The site chatbot: a floating pill that opens the chat widget in an iframe.

   The widget bootstraps itself from /v1/chat/config (agent + publishable
   key), so this component carries no configuration at all — it only checks
   once that a chat agent actually exists before showing the button, because
   a launcher that opens onto an error is worse than no launcher. */

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { API_URL } from "@/lib/api";

export function ChatLauncher() {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/v1/chat/config`)
      .then((r) => setAvailable(r.ok))
      .catch(() => setAvailable(false));
  }, []);

  if (!available) return null;

  return (
    <>
      {open && (
        <div className="vw-panel" role="dialog" aria-label="Chat with Veyra">
          <iframe src="/widget/chat" title="Chat with Veyra" allow="clipboard-write" />
        </div>
      )}
      <button
        type="button"
        className="vw-launcher"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Chat with Veyra"}
      >
        {open ? <X size={16} /> : <MessageCircle size={16} />}
        {open ? "Close" : "Chat with Veyra"}
      </button>
    </>
  );
}
