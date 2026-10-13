/**
 * The site's clock formats, in one place so a kick-off reads the same on every page (24-hour or 12-hour by the
 * reader's locale, always two-digit hours and minutes). Pass these to <LocalTime options>.
 */

/** "Sat 18 Oct, 15:00": a kick-off or deadline that may be days away. */
export const KICKOFF: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };

/** "15:00": a time under a day heading that already says which day. */
export const CLOCK: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

/** "Saturday 15:00": a moment later this week, in running text. */
export const DAY_CLOCK: Intl.DateTimeFormatOptions = { weekday: "long", hour: "2-digit", minute: "2-digit" };

/** "Sat 18 Oct": a date with no time. */
export const DAY: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
