"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "./Button";
import styles from "./LiveRefresh.module.css";

interface LiveRefreshProps {
  /** Only poll while something is actually changing (e.g. matches in progress). */
  enabled: boolean;
  intervalMs?: number;
  /** Returning to the tab refreshes only if the last refresh is at least this old. */
  minFocusGapMs?: number;
}

/**
 * Re-fetches server data on an interval while the tab is visible. The status text is
 * deliberately not a live region: announcing every minute would be noise for screen readers.
 * - Never overlaps refreshes: a tick or click while one is in flight is dropped.
 * - Tab switching doesn't burst: focus refreshes only if the data is older than `minFocusGapMs`.
 * - "last …" is the time the new data arrived, not when the request started.
 */
export function LiveRefresh({ enabled, intervalMs = 60_000, minFocusGapMs = 15_000 }: LiveRefreshProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);
  const pendingRef = useRef(false);
  const lastStartRef = useRef(0);

  const refresh = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    lastStartRef.current = Date.now();
    startTransition(() => {
      router.refresh();
      // Committed together with the refreshed server payload, so its effect marks completion and always
      // fires (even if `pending` never visibly flips), which means the in-flight guard can't get stuck.
      setRefreshSeq((n) => n + 1);
    });
  }, [router]);

  useEffect(() => {
    if (refreshSeq === 0 || pending) return;
    pendingRef.current = false;
    setUpdatedAt(new Date());
  }, [pending, refreshSeq]);

  useEffect(() => {
    if (!enabled) return;
    lastStartRef.current = Date.now(); // the page was just rendered with fresh data
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(id);
      id = setInterval(refresh, intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        clearInterval(id);
        return;
      }
      if (Date.now() - lastStartRef.current >= minFocusGapMs) refresh();
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, minFocusGapMs, refresh]);

  return (
    <div className={styles.wrap}>
      <span className={styles.status}>
        {pending ? "Updating…" : enabled ? "Auto-updates every minute" : null}
        {!pending && updatedAt ? ` · last ${updatedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : null}
      </span>
      <Button size="sm" variant="ghost" onClick={refresh} disabled={pending}>
        Refresh
      </Button>
    </div>
  );
}
