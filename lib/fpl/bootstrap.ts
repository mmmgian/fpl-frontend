/**
 * The bootstrap-static file: slimmed, shared across instances via Next's data cache, and memoised per instance.
 */
import { unstable_cache } from "next/cache";
import type { Bootstrap } from "../domain/types";
import { fplGet } from "./http";

/**
 * Keep only the fields the app reads. The raw file is ~1.8 MB (too close to Next's 2 MB data-cache limit
 * to cache, and ~800 players x ~100 fields to parse); the slim copy is ~90 KB. Defaults are omitted
 * (most players are available, with no news), which roughly halves the player list.
 */
export function slimBootstrap(raw: Bootstrap): Bootstrap {
  return {
    events: raw.events.map(({ id, name, deadline_time, is_current, is_next, finished, data_checked, average_entry_score }) => ({
      id, name, deadline_time, is_current, is_next, finished, data_checked,
      ...(average_entry_score ? { average_entry_score } : {}),
    })),
    teams: raw.teams.map(({ id, code, name, short_name }) => ({ id, code, name, short_name })),
    elements: raw.elements.map((e) => ({
      id: e.id,
      web_name: e.web_name,
      team: e.team,
      element_type: e.element_type,
      ...(e.status && e.status !== "a" ? { status: e.status } : {}),
      ...(e.news ? { news: e.news } : {}),
      ...(e.chance_of_playing_next_round != null ? { chance_of_playing_next_round: e.chance_of_playing_next_round } : {}),
      ...(e.selected_by_percent != null ? { selected_by_percent: e.selected_by_percent } : {}),
      ...(e.now_cost != null ? { now_cost: e.now_cost } : {}),
      ...(e.news_added ? { news_added: e.news_added } : {}),
      ...(e.minutes ? { minutes: e.minutes } : {}),
      ...(e.starts ? { starts: e.starts } : {}),
      ...(e.total_points ? { total_points: e.total_points } : {}),
      ...(e.form && e.form !== "0.0" ? { form: e.form } : {}),
    })),
    chips: (raw.chips ?? []).map(({ name, start_event, stop_event }) => ({ name, start_event, stop_event })),
  };
}

const loadSlimBootstrap = async () =>
  slimBootstrap(await fplGet<Bootstrap>("/bootstrap-static/", { revalidate: 0, timeoutMs: 10_000 }));

/**
 * Shared across serverless instances via Next's data cache, so a cold instance reads ~50 KB from the cache
 * instead of downloading 1.8 MB from FPL. Failures throw and are never cached.
 */
const BOOTSTRAP_SHARED_TTL_S = 240;
const cachedSlimBootstrap = unstable_cache(loadSlimBootstrap, ["fpl-bootstrap-slim-v2"], {
  revalidate: BOOTSTRAP_SHARED_TTL_S,
  tags: ["fpl-bootstrap"],
});

/** Per-instance memo on top, so warm instances skip even the cache read. Worst-case staleness ~5 min. */
const BOOTSTRAP_TTL_MS = 60_000;
let bootstrapMemo: { at: number; value: Promise<Bootstrap> } | null = null;

export function getBootstrap(): Promise<Bootstrap> {
  const now = Date.now();
  if (bootstrapMemo && now - bootstrapMemo.at < BOOTSTRAP_TTL_MS) return bootstrapMemo.value;
  const value = cachedSlimBootstrap();
  bootstrapMemo = { at: now, value };
  value.catch(() => {
    if (bootstrapMemo?.value === value) bootstrapMemo = null; // never cache failures
  });
  return value;
}
