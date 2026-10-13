/**
 * Transport for the official FPL API.
 * - Browser-like headers (FPL often 403s bare server requests)
 * - Per-request timeout
 * - Typed errors carrying the upstream status
 */

const FPL_BASE = "https://fantasy.premierleague.com/api";
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  accept: "application/json,text/plain,*/*",
  referer: "https://fantasy.premierleague.com/",
};

export class FplError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FplError";
  }
}

export const isNotFound = (e: unknown) => e instanceof FplError && e.status === 404;

interface GetOptions {
  /** Seconds to keep in Next's data cache; 0 = always fresh. */
  revalidate?: number;
  timeoutMs?: number;
}

export async function fplGet<T>(path: string, { revalidate = 60, timeoutMs = 8000 }: GetOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${FPL_BASE}${path}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
      ...(revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    throw new FplError(timedOut ? `FPL timed out on ${path}` : `Could not reach FPL (${path})`, 504);
  }
  if (!res.ok) {
    // FPL returns 503 "The game is being updated" between gameweeks.
    throw new FplError(`FPL responded ${res.status} for ${path}`, res.status);
  }
  // A 200 isn't always JSON: FPL's maintenance page is HTML, and a dropped connection cuts a body short.
  // Either is FPL being unavailable (the page's error state), not a SyntaxError from deep inside a render.
  try {
    return (await res.json()) as T;
  } catch {
    throw new FplError(`FPL sent an unreadable response for ${path}`, 502);
  }
}
