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
    // A suffixed slug can itself be another team's natural one ("Foo 9" vs the second "Foo" of id 9): keep going until free.
    if (taken.has(slug)) {
      const base = `${slug}-${id}`;
      slug = base;
      for (let k = 2; taken.has(slug); k++) slug = `${base}-${k}`;
    }
    taken.add(slug);
    out.set(id, slug);
  }
  return out;
}

/** The inverse of `entrySlugs`: the entry whose address is `slug` (exactly, or failing that ignoring case and a stray trailing dash). */
export function entryOfSlug(slugs: Map<number, string>, slug: string): number | null {
  for (const [id, s] of slugs) if (s === slug) return id;
  const loose = slug.toLowerCase().replace(/-+$/, "");
  if (!loose) return null;
  for (const [id, s] of slugs) if (s === loose) return id;
  return null;
}
