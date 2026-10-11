import { ButtonLink } from "@/components/ui";
import type { FdrWindow } from "@/lib/domain";
import styles from "./fixtures.module.css";

/** The Fixtures page's ways of looking: the whole season as a feed, or the difficulty grid for the next 3, 5 or 10 gameweeks. */
export function FixturesTabs({ windows, current, start }: { windows: readonly FdrWindow[]; current: FdrWindow | "all"; start?: number }) {
  const grid = (w: FdrWindow) => `/fixtures?${start ? `gw=${start}&` : ""}n=${w}`;
  return (
    <nav className={styles.windows} aria-label="Fixtures view">
      <ButtonLink size="sm" variant={current === "all" ? "solid" : "outline"} href="/fixtures" aria-current={current === "all" ? "true" : undefined} scroll={false}>
        All fixtures
      </ButtonLink>
      {windows.map((w) => (
        <ButtonLink key={w} size="sm" variant={w === current ? "solid" : "outline"} href={grid(w)} aria-current={w === current ? "true" : undefined} scroll={false}>
          Next {w}
        </ButtonLink>
      ))}
    </nav>
  );
}
