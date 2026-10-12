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
  const [left, setLeft] = useState(() => countdown(at, now));

  useEffect(() => {
    const tick = () => setLeft(countdown(at, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [at]);

  const parts: [number, string][] = [[left.days, t.days], [left.hours, t.hours], [left.minutes, t.mins], [left.seconds, t.secs]];
  return (
    <section className={styles.timer} aria-label={`${t.title}: ${gameweek}`}>
      <header className={styles.head}>
        <h2 className={styles.title}>{t.title}</h2>
        <span className={styles.gw}>{gameweek}</span>
      </header>
      {left.totalMs === 0 ? (
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
