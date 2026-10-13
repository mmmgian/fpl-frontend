"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "fpl:snapshot-nudge";
/** Fallback when sessionStorage is unavailable (private mode, blocked storage): once per page load. */
const asked = new Set<string>();

function alreadyAsked(id: string): boolean {
  if (asked.has(id)) return true;
  try {
    return sessionStorage.getItem(KEY) === id;
  } catch {
    return false;
  }
}

function markAsked(id: string) {
  asked.add(id);
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    // the in-memory mark above still holds for this page load
  }
}

/**
 * Renders nothing. Mounted only when FPL has finalised a gameweek the history shelf hasn't filed yet: asks the server to
 * file it (throttled, idempotent) and refreshes the page if a new table was stored, so it shows up without a reload.
 *
 * Asks at most once per gameweek per browser session: the refreshed page can still show the nudge (the shelf list is
 * cached, or the backend filed a different week), and asking again would refresh again, in a loop.
 */
export function SnapshotNudge({ gw }: { gw: number | null }) {
  const router = useRouter();
  useEffect(() => {
    const id = String(gw ?? "?");
    if (alreadyAsked(id)) return;
    markAsked(id);
    // No cancel on unmount: with the once-only guard, React's dev double-mount would otherwise drop the one refresh.
    fetch("/api/snapshot", { method: "POST" })
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
      .then((body) => {
        if ((body as { snapshotted?: unknown } | null)?.snapshotted === true) router.refresh();
      })
      .catch(() => {});
  }, [router, gw]);
  return null;
}
