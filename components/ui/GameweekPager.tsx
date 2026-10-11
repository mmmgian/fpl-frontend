import { ButtonLink, ButtonPlaceholder } from "./Button";
import styles from "./GameweekPager.module.css";

interface GameweekPagerProps {
  gw: number;
  min: number;
  max: number;
  /** Builds the href for a gameweek, e.g. (n) => `/bonus?gw=${n}`. */
  href: (gw: number) => string;
  label?: string;
}

export function GameweekPager({ gw, min, max, href, label = "Gameweek" }: GameweekPagerProps) {
  const prev = gw > min ? gw - 1 : null;
  const next = gw < max ? gw + 1 : null;
  return (
    <nav className={styles.pager} aria-label={`${label} navigation`}>
      {prev ? (
        <ButtonLink size="sm" href={href(prev)} aria-label={`Previous: ${label} ${prev}`} scroll={false}>
          <span aria-hidden="true">←</span> GW{prev}
        </ButtonLink>
      ) : (
        <ButtonPlaceholder size="sm">
          <span aria-hidden="true">←</span>
          <span className="sr-only">No earlier {label.toLowerCase()}</span>
        </ButtonPlaceholder>
      )}
      <span className={styles.current} aria-current="page">
        GW{gw}
      </span>
      {next ? (
        <ButtonLink size="sm" href={href(next)} aria-label={`Next: ${label} ${next}`} scroll={false}>
          GW{next} <span aria-hidden="true">→</span>
        </ButtonLink>
      ) : (
        <ButtonPlaceholder size="sm">
          <span aria-hidden="true">→</span>
          <span className="sr-only">No later {label.toLowerCase()}</span>
        </ButtonPlaceholder>
      )}
    </nav>
  );
}
