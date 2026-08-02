"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type MenuItem = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
};

/** A ⋮ trigger that opens a fixed-positioned menu (so it never clips inside a
 *  card or grid) and closes on outside-click, scroll, or Escape. */
export default function CardMenu({ items, label = "Actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuWidth = 200;
    setPos({
      top: Math.min(r.bottom + 4, window.innerHeight - 8),
      left: Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", () => setOpen(false), true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className="btn btn-ghost btn-icon btn-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        <MoreVertical />
      </button>
      {open && (
        <div
          ref={menuRef}
          className="menu"
          role="menu"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <div key={i}>
                {it.separatorBefore && <div className="menu-sep" />}
                <button
                  className={`menu-item ${it.danger ? "danger" : ""}`}
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    it.onClick();
                  }}
                >
                  <Icon />
                  {it.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
