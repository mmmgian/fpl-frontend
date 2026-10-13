import { ButtonLink, ButtonPlaceholder } from "./Button";
import { getT } from "./i18n";
import styles from "./GameweekPager.module.css";

interface GameweekPagerProps {
  gw: number;
  min: number;
  max: number;
  /** Builds the href for a gameweek, e.g. (n) => `/bonus?gw=${n}`. */
  href: (gw: number) => string;
  label?: string;
  /**
   * The only gameweeks there is anything to show for (e.g. the saved past tables), when that isn't every one
   * between min and max: the arrows then jump over the gaps.
   */
  stops?: readonly number[];
}

/** The neighbouring gameweeks: the next one either side, or the nearest stop either side when there are stops. */
export function pagerSteps(gw: number, min: number, max: number, stops?: readonly number[]): { prev: number | null; next: number | null } {
  if (!stops) return { prev: gw > min ? gw - 1 : null, next: gw < max ? gw + 1 : null };
  const inRange = stops.filter((n) => n >= min && n <= max);
  const before = inRange.filter((n) => n < gw);
  const after = inRange.filter((n) => n > gw);
  return { prev: before.length ? Math.max(...before) : null, next: after.length ? Math.min(...after) : null };
}

/**
 * Previous / next gameweek. The links replace the history entry instead of adding one, like the flipbook's pages:
 * Back leaves the page in one step rather than walking back through every gameweek looked at.
 */
export function GameweekPager({ gw, min, max, href, label, stops }: GameweekPagerProps) {
  const t = getT();
  label ??= t.pager.gameweekLabel;
  const { prev, next } = pagerSteps(gw, min, max, stops);
  return (
    <nav className={styles.pager} aria-label={t.pager.nav(label)}>
      {prev ? (
        <ButtonLink size="sm" href={href(prev)} aria-label={t.pager.previous(label, prev)} scroll={false} replace>
          <span aria-hidden="true">←</span> {t.common.gw(prev)}
        </ButtonLink>
      ) : (
        <ButtonPlaceholder size="sm">
          <span aria-hidden="true">←</span>
          <span className="sr-only">{t.pager.noEarlier(label.toLowerCase())}</span>
        </ButtonPlaceholder>
      )}
      <span className={styles.current} aria-current="page">
        {t.common.gw(gw)}
      </span>
      {next ? (
        <ButtonLink size="sm" href={href(next)} aria-label={t.pager.next(label, next)} scroll={false} replace>
          {t.common.gw(next)} <span aria-hidden="true">→</span>
        </ButtonLink>
      ) : (
        <ButtonPlaceholder size="sm">
          <span aria-hidden="true">→</span>
          <span className="sr-only">{t.pager.noLater(label.toLowerCase())}</span>
        </ButtonPlaceholder>
      )}
    </nav>
  );
}
