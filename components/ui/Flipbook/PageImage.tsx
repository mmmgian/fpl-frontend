"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../I18nProvider";
import { Button } from "../Button";
import styles from "./PageImage.module.css";

export interface PageImageProps {
  src: string;
  /** Candidates for the browser to choose from, e.g. "a.webp 240w, b.webp 640w". */
  srcSet?: string;
  sizes?: string;
  alt: string;
  /** Intrinsic size in pixels. It reserves the space before the image arrives, so the layout never jumps. */
  width: number;
  height: number;
  /** Load now instead of lazily (the page the reader is looking at). */
  priority?: boolean;
  /** Where to send the reader if the image can't load (e.g. the PDF). */
  fallbackHref?: string;
  fallbackLabel?: string;
}

/**
 * A page image with a reserved box, a skeleton while it loads, and a recoverable error state.
 * Without JavaScript it is simply the image; the skeleton sits behind it.
 */
export function PageImage({ src, srcSet, sizes, alt, width, height, priority, fallbackHref, fallbackLabel }: PageImageProps) {
  const t = useT().flipbook;
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const img = useRef<HTMLImageElement>(null);

  // The image may have finished loading before React attached `onLoad` (server-rendered pages).
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth > 0) setState("loaded");
  }, [attempt, src]);

  const retry = () => {
    setState("loading");
    setAttempt((n) => n + 1);
  };
  const bust = (url: string) => (attempt === 0 ? url : `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}`);
  // Cache-bust every candidate in a srcset ("a.webp 240w, b.webp 640w"), so a retry on a retina screen keeps its sharp image.
  const bustSet = (set: string) => set.split(",").map((c) => { const [url, ...descriptor] = c.trim().split(/\s+/); return [bust(url), ...descriptor].join(" "); }).join(", ");

  return (
    <span className={styles.frame} data-state={state} style={{ aspectRatio: `${width} / ${height}` }}>
      {state === "loading" ? <span className={styles.skeleton} aria-hidden="true" /> : null}
      {state !== "error" ? (
        // eslint-disable-next-line @next/next/no-img-element -- static, pre-sized page images with their own srcset
        <img
          key={attempt}
          ref={img}
          className={styles.image}
          src={bust(src)}
          srcSet={srcSet ? bustSet(srcSet) : undefined}
          sizes={sizes}
          alt={alt}
          width={width}
          height={height}
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
        />
      ) : (
        <span className={styles.error} role="alert">
          <span>{t.pageError}</span>
          <span className={styles.errorActions}>
            <Button size="sm" onClick={retry}>
              {t.retry}
            </Button>
            {fallbackHref ? (
              <a href={fallbackHref} target="_blank" rel="noreferrer">
                {fallbackLabel ?? t.openPdf}
              </a>
            ) : null}
          </span>
        </span>
      )}
    </span>
  );
}
