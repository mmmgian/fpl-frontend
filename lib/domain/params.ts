/** Validation of identifiers that arrive as URL path segments. Pure. */

/** A positive integer of at most 10 digits, else null. */
export function parseEntryId(raw: string): number | null {
  return /^\d{1,10}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

/** A gameweek number 1-38 from a path segment, else null. */
export function parseSnapshotGw(raw: string): number | null {
  return /^\d{1,2}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 38 ? Number(raw) : null;
}
