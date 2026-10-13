"use client";

import { useEffect, useState } from "react";
// Deep import: the domain barrel would pull every language into the browser bundle.
import { countdown } from "@/lib/domain/tools";
import { useT } from "./I18nProvider";
import { LocalTime } from "./LocalTime";
import styles from "./DeadlineTimer.module.css";

const two = (n: number) => String(n).padStart(2, "0");
const WHEN: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };

/**
 * Counts down to the next FPL deadline. The server's clock (`now`) draws the first frame, so the page is correct
 * before any script runs and hydration agrees; the browser's clock takes over from the first tick.
 */
export function DeadlineTimer({ at, now, gameweek }: { at: string; now: string; gameweek: string }) {
  const t = useT().deadline;
  // FPL can send a deadline that doesn't parse: then there is nothing to count down to (and no NaN to print).
  const valid = !Number.isNaN(Date.parse(at));
  const [left, setLeft] = useState(() => countdown(at, now));

  useEffect(() => {
    if (!valid) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      const next = countdown(at, Date.now());
      setLeft(next);
      // Passed: the page says so, and nothing changes after that, so stop ticking.
      if (next.totalMs === 0) clearInterval(id);
    };
    // A hidden tab has nobody to show the seconds to: stop ticking (and re-rendering) until it is visible again.
    const start = () => {
      clearInterval(id);
      id = setInterval(tick, 1000);
      tick();
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : clearInterval(id));
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [at, valid]);

  const parts: [number, string][] = [[left.days, t.days], [left.hours, t.hours], [left.minutes, t.mins], [left.seconds, t.secs]];
  return (
    <section className={styles.timer} aria-label={`${t.title}: ${gameweek}`}>
      <header className={styles.head}>
        <h2 className={styles.title}>{t.title}</h2>
        <span className={styles.gw}>{gameweek}</span>
      </header>
      {!valid ? null : left.totalMs === 0 ? (
        <p className={styles.passed}>{t.passed}</p>
      ) : (
        <div className={styles.cells} role="timer">
          {parts.map(([value, label]) => (
            <div key={label} className={styles.cell}>
              <span className={styles.value}>{two(value)}</span>
              <span className={styles.label}>{label}</span>
            </div>
          ))}
        </div>
      )}
      <p className={styles.when}>
        <LocalTime iso={at} options={WHEN} />
      </p>
    </section>
  );
}
