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
  /** Called each time the panel transitions to open (e.g. to mark-as-read). */
  onOpen?: () => void;
}

export function Popover({
  trigger,
  children,
  align = "end",
  panelClassName,
  ariaLabel,
  role = "dialog",
  onOpen,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!open) return;
    onOpenRef.current?.();
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),[tabindex="0"]') ?? panel)?.focus();
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => { setOpen(false); triggerRef.current?.focus(); };

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        ref: (el) => {
          // keep a handle on the trigger element for focus management if needed
          if (el) el.setAttribute("data-popover-trigger", "true");
          triggerRef.current = el;
        },
        onClick: () => setOpen((o) => !o),
        "aria-expanded": open,
        "aria-haspopup": role,
        "aria-controls": panelId,
      })}

      {open ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          id={panelId}
          onBlur={(event) => { if (event.relatedTarget && !rootRef.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
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