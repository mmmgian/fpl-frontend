/** How long a page waits for optional extras before showing itself without them. The requests keep going and fill the cache. */
export const STATS_DEADLINE_MS = 6000;

/** Wait for `work` but never longer than the deadline; whatever has arrived by then is what gets used. */
export async function withinDeadline(work: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => (timer = setTimeout(resolve, STATS_DEADLINE_MS)));
  await Promise.race([work, deadline]);
  clearTimeout(timer);
}
