"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./Crest.module.css";

interface CrestProps {
  /** Premier League club `code` (bootstrap teams[].code), not the FPL team id. */
  code?: number | null;
  /** Any absolute image URL (e.g. an FPL entry's club_badge_src). Takes precedence over `code`. */
  src?: string | null;
  name: string;
  size?: number;
  /** Decorative when the name is already visible next to it. */
  decorative?: boolean;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function Crest({ code, src, name, size = 24, decorative = true }: CrestProps) {
  const [failed, setFailed] = useState(false);
  const url = src || (code ? `https://resources.premierleague.com/premierleague/badges/70/t${code}.png` : null);

  if (!url || failed) {
    return (
      <span
        className={styles.fallback}
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : name}
        aria-hidden={decorative ? true : undefined}
      >
        {initials(name)}
      </span>
    );
  }
  return (
    <Image
      className={styles.crest}
      src={url}
      alt={decorative ? "" : name}
      width={size}
      height={size}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
