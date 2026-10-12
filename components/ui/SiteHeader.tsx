"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "./I18nProvider";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./SiteHeader.module.css";

const NAV = [
  { href: "/", key: "table" },
  { href: "/tools", key: "tools" },
  { href: "/bonus", key: "bonus" },
  { href: "/fixtures", key: "fixtures" },
  { href: "/times", key: "times" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/team/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ siteName }: { siteName: string }) {
  const pathname = usePathname() ?? "/";
  const t = useT();
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.brand} aria-label={`${siteName}: ${t.nav.home}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed-size picture, already optimised */}
          <img src="/brand/lobster-league-192.webp" alt="" width={96} height={64} className={styles.logo} decoding="async" />
        </Link>
        <div className={styles.theme}>
          <ThemeToggle />
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
