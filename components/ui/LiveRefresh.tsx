"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "./Button";
import styles from "./LiveRefresh.module.css";

interface LiveRefreshProps {
  /** Only poll while something is actually changing (e.g. matches in progress). */
  enabled: boolean;
  intervalMs?: number;
}

/**
 * Re-fetches server data on an interval while the tab is visible. The status text is
 * deliberately not a live region: announcing every minute would be noise for screen readers.
 */
export function LiveRefresh({ enabled, intervalMs = 60_000 }: LiveRefreshProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
      setUpdatedAt(new Date());
    });
  }, [router]);

  useEffect(() => {
    if (!enabled) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(id);
      id = setInterval(refresh, intervalMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else {
        clearInterval(id);
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs, refresh]);

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
