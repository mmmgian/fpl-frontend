"use client";

import { usePathname } from "next/navigation";
import { TRIP_COOKIE, TRIP_COOKIE_MAX_AGE } from "@/lib/domain/trip";
import { useT } from "./I18nProvider";
import styles from "./TripSwitch.module.css";

/** Turn the altered view on or off: a cookie the server reads, then a reload (like the language button). */
export function flipTrip(on: boolean) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = on ? `${TRIP_COOKIE}=1; path=/; max-age=${TRIP_COOKIE_MAX_AGE}; samesite=lax${secure}` : `${TRIP_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  window.location.reload();
}

/**
 * A small blotter-paper sun in the footer of the league table: the easter egg's door. It turns the altered view on
 * (a cookie the server reads, then a reload, like the language button). While the view is on, the sun stays in the
 * footer of every page, so there is always a way back.
 */
export function TripSwitch({ on }: { on: boolean }) {
  const pathname = usePathname();
  const t = useT().trip;
  if (!on && pathname !== "/") return null;

  const flip = () => flipTrip(!on);

  return (
    <button type="button" className={styles.sun} onClick={flip} aria-label={on ? t.leave : t.enter} aria-pressed={on} title={on ? t.leave : t.enter}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a 96 px picture, shown at 24 */}
      <img src="/brand/blotter-sun.webp" alt="" width={24} height={24} decoding="async" />
    </button>
  );
}
