"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "./Button";
import { useIntlLocale, useT } from "./I18nProvider";
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
  const t = useT();
  const intl = useIntlLocale();
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
    // Opened in a background tab: nothing to show yet, so wait for the tab to be seen (it then refreshes if stale).
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, minFocusGapMs, refresh]);

  const when = !pending && updatedAt ? t.live.last(updatedAt.toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit" })) : null;
  return (
    <div className={styles.wrap}>
      <span className={styles.status}>
        {pending ? t.live.updating : null}
        {when}
      </span>
      <Button variant="outline" className={styles.icon} onClick={refresh} disabled={pending} aria-label={t.live.refresh} title={when ? `${t.live.refresh} · ${when}` : t.live.refresh}>
        {/* An open circle of arrow, the way every phone draws "refresh". */}
        <svg className={styles.glyph} data-spinning={pending} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M20 12a8 8 0 1 1-2.6-5.9" />
          <path d="M20 4v4.4h-4.4" />
        </svg>
      </Button>
    </div>
  );
}
