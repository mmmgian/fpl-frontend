import type { AvatarPort } from "./ports";

/**
 * Gives a manager with no badge of their own their drawn avatar, as the badge. A badge the manager chose is never
 * replaced, and a manager with no avatar keeps none (the initials fallback is shown). Returns new rows; the input is untouched.
 */
export function withAvatars<T extends { entry: number; club_badge_src?: string | null }>(rows: T[], avatars: AvatarPort | undefined): T[] {
  if (!avatars) return rows;
  return rows.map((r) => {
    if (r.club_badge_src) return r;
    const src = avatars.src(r.entry);
    return src ? { ...r, club_badge_src: src } : r;
  });
}
