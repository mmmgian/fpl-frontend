"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "./Button";
import { useT, useTrip } from "./I18nProvider";
import { ThemeToggle } from "./ThemeToggle";
import { flipTrip } from "./TripSwitch";
import styles from "./SiteHeader.module.css";

const NAV = [
  { href: "/", key: "table" },
  { href: "/tools", key: "tools" },
  { href: "/bonus", key: "bonus" },
  { href: "/fixtures", key: "fixtures" },
  { href: "/times", key: "times" },
] as const;

/** Pages that live under another section: a team belongs to the table, a past table to The Times, a club to the fixtures. */
const PARENT: Record<string, readonly string[]> = { "/": ["/team/"], "/times": ["/history/"], "/fixtures": ["/club/"] };

export function isActive(pathname: string, href: string) {
  const own = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return own || (PARENT[href] ?? []).some((prefix) => pathname.startsWith(prefix));
}

export function SiteHeader({ siteName }: { siteName: string }) {
  const pathname = usePathname() ?? "/";
  const t = useT();
  const trip = useTrip();
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.brand} aria-label={`${siteName}: ${t.nav.home}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed-size picture, already optimised */}
          <img src="/brand/lobster-league-192.webp" alt="" width={96} height={64} className={styles.logo} decoding="async" />
        </Link>
        <div className={styles.theme}>
          {/* The altered view paints over every theme, so the theme picker would do nothing: offer the way out instead. */}
          {trip ? (
            <Button size="sm" onClick={() => flipTrip(false)} title={t.trip.leave}>
              {t.trip.leaveShort}
            </Button>
          ) : (
            <ThemeToggle />
          )}
        </div>
        <nav aria-label={t.nav.label} className={styles.navWrap}>
          <ul className={styles.nav}>
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} className={styles.link} aria-current={active ? "page" : undefined}>
                    {t.nav[item.key]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
