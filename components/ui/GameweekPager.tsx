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
}

export function GameweekPager({ gw, min, max, href, label }: GameweekPagerProps) {
  const t = getT();
  label ??= t.pager.gameweekLabel;
  const prev = gw > min ? gw - 1 : null;
  const next = gw < max ? gw + 1 : null;
  return (
    <nav className={styles.pager} aria-label={t.pager.nav(label)}>
      {prev ? (
        <ButtonLink size="sm" href={href(prev)} aria-label={t.pager.previous(label, prev)} scroll={false}>
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
        <ButtonLink size="sm" href={href(next)} aria-label={t.pager.next(label, next)} scroll={false}>
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
