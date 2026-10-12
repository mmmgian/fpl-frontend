/** The altered view: an easter egg. A cookie remembers it on a device so the server can draw the page that way. Pure. */
export const TRIP_COOKIE = "lobster-trip";
export const TRIP_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const isTripCookie = (value: string | undefined): boolean => value === "1";

const AVATAR = /^\/avatars\/(\d{1,10})(-s)?\.webp(\?[0-9a-zA-Z=&_-]*)?$/;

/** The psychedelic picture for one of our avatars (same size class), or the address unchanged if it isn't one. */
export function tripAvatar(src: string): string {
  const m = AVATAR.exec(src);
  return m ? `/psychedelic/${m[1]}${m[2] ?? ""}.webp` : src;
}
