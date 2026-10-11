"use client";

import { useEffect } from "react";

const markFailed = (img: Element) => img.closest("[data-crest]")?.setAttribute("data-crest", "failed");

/**
 * One listener for every <Crest /> on the page, instead of a hydrated component per crest.
 * Image `error` events don't bubble, so listen in the capture phase. Images that already failed
 * before hydration are caught by the initial sweep.
 */
export function CrestFallback() {
  useEffect(() => {
    const onError = (e: Event) => {
      if (e.target instanceof HTMLImageElement && e.target.closest("[data-crest]")) markFailed(e.target);
    };
    document.addEventListener("error", onError, true);
    document.querySelectorAll<HTMLImageElement>("[data-crest] img").forEach((img) => {
      if (img.complete && img.naturalWidth === 0) markFailed(img);
    });
    return () => document.removeEventListener("error", onError, true);
  }, []);
  return null;
}
