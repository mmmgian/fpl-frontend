/** Runtime configuration. Server-only values are read lazily so tests can override env. */

const DEFAULT_BACKEND = "https://fpl-backend-poix.onrender.com";

/** The Lobster League (2026/27). Override with LEAGUE_ID. */
export const DEFAULT_LEAGUE_ID = 467763;

export function leagueId(): number {
  const raw = process.env.LEAGUE_ID ?? process.env.NEXT_PUBLIC_LEAGUE_ID;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_LEAGUE_ID;
}

export function backendUrl(): string {
  return (process.env.API_BASE || process.env.NEXT_PUBLIC_API_URL || DEFAULT_BACKEND).replace(/\/+$/, "");
}

export const SITE_NAME = "The Lobster League";
