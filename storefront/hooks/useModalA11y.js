"use client";

import { useEffect, useRef } from "react";

// Open dialogs. While any is open, <html data-modal-open> lets floating UI
// (the WhatsApp button) step aside instead of covering the dialog's buttons.
let openCount = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Dialog behaviour for drawers/overlays: Esc closes, Tab stays inside, body
 * scroll is locked, and focus returns to whatever opened it.
 * @param {boolean} open
 * @param {() => void} onClose
 * @returns {React.RefObject<HTMLElement>} attach to the dialog container
 */
export function useModalA11y(open, onClose) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    openCount += 1;
    document.documentElement.dataset.modalOpen = "";

    const node = ref.current;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      openCount -= 1;
      if (!openCount) delete document.documentElement.dataset.modalOpen;
      if (opener && typeof opener.focus === "function") opener.focus();
    };
  }, [open]);

  return ref;
}
