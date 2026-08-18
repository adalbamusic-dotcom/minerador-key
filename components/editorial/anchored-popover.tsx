"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export function AnchoredPopover({ open, onClose, triggerRef, ariaLabel, children, className = "" }: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, triggerRef]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const panelHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelWidth = Math.min(352, viewportWidth - 16);
      const belowTop = triggerRect.bottom + 8;
      const opensAbove = panelHeight > viewportHeight - belowTop - 8 && triggerRect.top - panelHeight - 8 >= 8;
      const lowestSafeTop = Math.max(8, viewportHeight - Math.min(panelHeight, viewportHeight - 16) - 8);
      setPosition({
        left: Math.max(8, Math.min(triggerRect.left, viewportWidth - panelWidth - 8)),
        top: opensAbove ? triggerRect.top - panelHeight - 8 : Math.max(8, Math.min(belowTop, lowestSafeTop)),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, triggerRef]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <section ref={panelRef} style={position} className={`fixed z-[120] max-h-[min(70vh,32rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded border border-divider bg-surface-elevated p-3 shadow-2xl ${className}`} role="dialog" aria-modal="false" aria-label={ariaLabel}>
      {children}
    </section>,
    document.body,
  );
}
