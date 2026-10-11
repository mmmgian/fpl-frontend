/**
 * Page arithmetic for a flipbook. Pure. Pages are 1-based.
 *
 * Wide layout shows two-page spreads like a printed book: the cover alone, then (2,3), (4,5), ...
 * with the back cover alone if the count is even. Narrow layout shows one page at a time.
 */

export const clampPage = (page: number, count: number): number =>
  count < 1 ? 1 : Math.min(Math.max(Number.isFinite(page) ? Math.trunc(page) : 1, 1), count);

/** The pages on show together in a wide spread that contains `page`. */
export function spreadOf(page: number, count: number): number[] {
  const p = clampPage(page, count);
  if (p === 1) return [1];
  const left = p % 2 === 0 ? p : p - 1;
  return left + 1 <= count ? [left, left + 1] : [left];
}

/** Move one step (a page when narrow, a spread when wide). Returns the same page at either end. */
export function step(page: number, count: number, direction: 1 | -1, wide: boolean): number {
  const p = clampPage(page, count);
  if (!wide) return clampPage(p + direction, count);
  const spread = spreadOf(p, count);
  if (direction === 1) {
    const last = spread[spread.length - 1];
    return last >= count ? p : spreadOf(last + 1, count)[0];
  }
  const first = spread[0];
  return first <= 1 ? p : spreadOf(first - 1, count)[0];
}

/** Whether a step in this direction would move at all. */
export const canStep = (page: number, count: number, direction: 1 | -1, wide: boolean): boolean => step(page, count, direction, wide) !== clampPage(page, count);

/** "Page 3 of 10", or "Pages 2 and 3 of 10" for a spread. */
export function describePages(pages: number[], count: number): string {
  return pages.length > 1 ? `Pages ${pages[0]} and ${pages[pages.length - 1]} of ${count}` : `Page ${pages[0]} of ${count}`;
}
