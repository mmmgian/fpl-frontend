"use client";

import { useCallback, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";

/** Subscribe to a media query. `serverValue` is used for the server render and the first client render. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
      mq?.addEventListener("change", notify);
      return () => mq?.removeEventListener("change", notify);
    },
    [query],
  );
  const get = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue);
  return useSyncExternalStore(subscribe, get, () => serverValue);
}

/** True once mounted in a browser; false on the server and during hydration. For browser-only controls. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** State that can be controlled (`value` + `onChange`) or uncontrolled (`defaultValue`). */
export function useControllableState<T>(value: T | undefined, defaultValue: T, onChange?: (next: T) => void): [T, (next: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const set = useCallback(
    (next: T) => {
      if (!controlled) setInner(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );
  return [controlled ? value : inner, set];
}

/** Whether the reader has pinch-zoomed the page (the visual viewport is scaled up). */
export function isZoomed(): boolean {
  const scale = typeof window !== "undefined" ? window.visualViewport?.scale : undefined;
  return typeof scale === "number" && scale > 1.01;
}

/**
 * Horizontal swipe detection for touch and pen (mouse drags are left alone so text stays selectable).
 * Calls `onSwipe(1)` for a swipe left (next page) and `onSwipe(-1)` for a swipe right.
 * Ignored while the page is pinch-zoomed: a sideways drag then means "pan to the small print", not "turn the page".
 */
export function useSwipe(onSwipe: (direction: 1 | -1) => void, { threshold = 48 }: { threshold?: number } = {}) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    onPointerUp: (e: PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || s.id !== e.pointerId || isZoomed()) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}
