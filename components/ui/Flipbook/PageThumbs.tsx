"use client";

import styles from "./PageThumbs.module.css";

export interface ThumbPage {
  id: string | number;
  /** Small image for the strip. */
  thumb: string;
  width: number;
  height: number;
}

/** A row of page thumbnails; the pages on show are marked with aria-current. */
export function PageThumbs({
  id,
  pages,
  current,
  onSelect,
  label = "Pages",
}: {
  id?: string;
  pages: ThumbPage[];
  /** 1-based page numbers currently on show. */
  current: number[];
  onSelect: (page: number) => void;
  label?: string;
}) {
  return (
    <nav id={id} aria-label={label} className={styles.nav}>
      <ol className={styles.list}>
        {pages.map((p, i) => {
          const n = i + 1;
          const here = current.includes(n);
          return (
            <li key={p.id}>
              <button type="button" className={styles.thumb} aria-label={`Go to page ${n}`} aria-current={here ? "true" : undefined} onClick={() => onSelect(n)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized thumbnails */}
                <img src={p.thumb} alt="" width={p.width} height={p.height} loading="lazy" decoding="async" />
                <span className={styles.number} aria-hidden="true">
                  {n}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
