"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./Skeleton.module.css";

/** Appears only if loading takes a while, e.g. while a sleeping server wakes up. */
export function SlowHint({ afterMs = 4000, children }: { afterMs?: number; children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), afterMs);
    return () => clearTimeout(id);
  }, [afterMs]);
  return show ? <p className={styles.hint}>{children}</p> : null;
}
