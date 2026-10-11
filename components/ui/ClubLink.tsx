"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "./I18nProvider";
import styles from "./ClubLink.module.css";

/** A link to a Premier League club's page. Wrap a crest, a name, or both; the people reading it hear where it goes. */
export function ClubLink({ id, name, children, className }: { id: number; name: string; children: ReactNode; className?: string }) {
  const t = useT().clubLink;
  return (
    <Link href={`/club/${id}`} className={[styles.link, className].filter(Boolean).join(" ")} title={t.title(name)}>
      {children}
    </Link>
  );
}
