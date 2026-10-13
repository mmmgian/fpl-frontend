import { matchPulse, type MatchPulse, type PulseFixture } from "../domain";

/** How long a page waits for optional extras before showing itself without them. The requests keep going and fill the cache. */
export const STATS_DEADLINE_MS = 6000;

/** Whether a match of `gw` is on, from FPL's schedule; junk entries (FPL on a bad day) are skipped, no schedule is null. */
export const pulseOf = (schedule: unknown, gw: number, at: Date): MatchPulse | null =>
  Array.isArray(schedule) ? matchPulse(schedule.filter((f): f is PulseFixture => typeof f === "object" && f !== null), gw, at) : null;

/** Wait for `work` but never longer than the deadline; whatever has arrived by then is what gets used. */
export async function withinDeadline(work: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => (timer = setTimeout(resolve, STATS_DEADLINE_MS)));
  await Promise.race([work, deadline]);
  clearTimeout(timer);
}

/**
 * `work`'s value if it has already settled, else null (a failure counts as null). For optional data started alongside
 * the required requests: used when it arrived while they were in flight, and never waited for, not even a timer tick.
 * Only microtasks pass, enough for an already-settled promise and its `.catch` wrapper to report in.
 */
export async function ifAlreadyIn<T>(work: Promise<T>): Promise<T | null> {
  const box: { value: T | null } = { value: null };
  void work.then(
    (v) => (box.value = v),
    () => (box.value = null),
  );
  for (let i = 0; i < 3; i++) await Promise.resolve();
  return box.value;
}
