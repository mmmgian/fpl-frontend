"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Renders nothing. Mounted only when FPL has finalised a gameweek the history shelf hasn't filed yet: asks the server to
 * file it (throttled, idempotent) and refreshes the page if a new table was stored, so it shows up without a reload.
 */
export function SnapshotNudge() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    fetch("/api/snapshot", { method: "POST" })
      .then((r) => (r.ok ? (r.json() as Promise<{ snapshotted?: boolean }>) : null))
      .then((body) => {
        if (!cancelled && body?.snapshotted) router.refresh();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);
  return null;
}
