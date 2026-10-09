"use client";
import { useEffect } from "react";
import { FOCUS_EVENT } from "@/lib/focus";

const FLASH_MS = 3000;

// Listens for focusItem(): scrolls to the element and flashes it for 3 seconds.
export default function FocusHighlight() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    const clear = () => { current?.classList.remove("focus-flash"); current = null; clearTimeout(timer); };

    const onFocus = (e: Event) => {
      const el = document.getElementById((e as CustomEvent<{ id: string }>).detail.id)
        ?? document.getElementById("timeline"); // item hidden by a timeline filter: fall back to the card
      if (!el) return;
      clear();
      void el.offsetWidth; // restart the animation if the same element is flashed again
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("focus-flash");
      current = el;
      timer = setTimeout(clear, FLASH_MS);
    };
    window.addEventListener(FOCUS_EVENT, onFocus);
    return () => { window.removeEventListener(FOCUS_EVENT, onFocus); clear(); };
  }, []);
  return null;
}
