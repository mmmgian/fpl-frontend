/** Readable addresses: a team or club's name in the URL ("/team/gaucho-f-c", "/club/man-city"). Pure; no I/O. */

/** "Gaucho F.C." -> "gaucho-f-c", "Zürich ñandú" -> "zurich-nandu"; "team" if nothing letter-like is left. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "team";
}

/**
 * One slug for each entry in a league. Two teams with the same name, or a name that is only digits (which would read as
 * a team number), get their number added, so every address points at exactly one team and none changes when the table moves.
 */
export function entrySlugs(entries: { id: number; name: string }[]): Map<number, string> {
  const out = new Map<number, string>();
  const taken = new Set<string>();
  for (const { id, name } of [...entries].sort((a, b) => a.id - b.id)) {
    let slug = slugify(name);
    if (/^\d+$/.test(slug)) slug = `team-${slug}`;
    if (taken.has(slug)) slug = `${slug}-${id}`;
    taken.add(slug);
    out.set(id, slug);
  }
  return out;
}

/** The inverse of `entrySlugs`: the entry whose address is `slug`. */
export function entryOfSlug(slugs: Map<number, string>, slug: string): number | null {
  for (const [id, s] of slugs) if (s === slug) return id;
  return null;
}
