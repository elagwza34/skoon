"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Popover — a lightweight dismissible panel anchored to a trigger.
 *
 * Used by the Topbar for the notifications panel and the account menu (the
 * single-select branch picker uses the richer `Dropdown`). Accessible: the
 * trigger receives aria-expanded/aria-controls, Escape closes, and a click
 * outside dismisses. No external dependency.
 */

export interface PopoverProps {
  /** Render prop for the trigger; receives the props to spread onto a <button>. */
  trigger: (props: {
    ref: (el: HTMLElement | null) => void;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "dialog" | "menu";
    "aria-controls": string;
  }) => ReactNode;
  /** Render prop for the panel content; receives a close callback. */
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
  ariaLabel?: string;
  role?: "dialog" | "menu";
}

export function Popover({
  trigger,
  children,
  align = "end",
  panelClassName,
  ariaLabel,
  role = "dialog",
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        ref: (el) => {
          // keep a handle on the trigger element for focus management if needed
          if (el) el.setAttribute("data-popover-trigger", "true");
        },
        onClick: () => setOpen((o) => !o),
        "aria-expanded": open,
        "aria-haspopup": role,
        "aria-controls": panelId,
      })}

      {open ? (
        <div
          id={panelId}
          role={role}
          aria-label={ariaLabel}
          className={cn(
            "absolute z-40 mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-lg",
            align === "end" ? "end-0" : "start-0",
            "animate-fade-in",
            panelClassName,
          )}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}