import styles from "./Crest.module.css";

interface CrestProps {
  /** Premier League club `code` (bootstrap teams[].code), not the FPL team id. */
  code?: number | null;
  /** Any absolute image URL (e.g. an FPL entry's club_badge_src). Takes precedence over `code`. */
  src?: string | null;
  name: string;
  size?: number;
  /** Decorative when the name is already visible next to it. */
  decorative?: boolean;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/**
 * Server component: a plain lazy <img>, no client JS per crest. If the image fails, the single
 * <CrestFallback /> listener (mounted once in the layout) flags the wrapper and CSS shows the initials.
 */
export function Crest({ code, src, name, size = 24, decorative = true }: CrestProps) {
  const url = src || (code ? `https://resources.premierleague.com/premierleague/badges/70/t${code}.png` : null);

  return (
    <span
      className={styles.crest}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}
      data-crest={url ? "" : "failed"}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative ? true : undefined}
    >
      <span className={styles.initials}>{initials(name)}</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny external badges; next/image would add a client component per crest
        <img className={styles.image} src={url} alt="" width={size} height={size} loading="lazy" decoding="async" />
      ) : null}
    </span>
  );
}
