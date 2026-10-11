import type { AvatarPort } from "./ports";

/**
 * Gives managers their drawn avatar as their badge. By default a badge a manager chose themselves is never replaced
 * and a manager with no avatar keeps none (the initials fallback shows). With `replaceBadges`, everyone who has an
 * avatar shows it, for a consistent look. Returns new rows; the input is untouched.
 */
export function withAvatars<T extends { entry: number; club_badge_src?: string | null }>(
  rows: T[],
  avatars: AvatarPort | undefined,
  { replaceBadges = false }: { replaceBadges?: boolean } = {},
): T[] {
  if (!avatars) return rows;
  return rows.map((r) => {
    if (r.club_badge_src && !replaceBadges) return r;
    const src = avatars.src(r.entry);
    return src ? { ...r, club_badge_src: src } : r;
  });
}
