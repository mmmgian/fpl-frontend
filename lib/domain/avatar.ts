/**
 * Avatars come in two sizes: the full picture (256 px) and a small copy (96 px, a quarter of the bytes) for badges up
 * to 48 px wide, which is every table and list. A 28 px badge should not download the large one.
 */
const AVATAR = /^\/avatars\/(\d{1,10})\.webp(\?[0-9a-zA-Z=&_-]*)?$/;

/** The widest badge, in CSS pixels, the small copy is sharp enough for (96 px covers it at 2x). */
export const SMALL_AVATAR_MAX = 48;

/** `src` itself, or its small copy if it is one of our avatars shown no wider than `px`. Any other address is left alone. */
export function avatarFor(src: string, px: number): string {
  const m = AVATAR.exec(src);
  return m && px <= SMALL_AVATAR_MAX ? `/avatars/${m[1]}-s.webp${m[2] ?? ""}` : src;
}
