/**
 * Visitor-driven nudge for the history shelf. The daily cron files a finished gameweek at 06:00 UTC, but FPL can mark a
 * gameweek final (`data_checked`) hours earlier; when The Times page sees a final gameweek that isn't filed yet it calls
 * this, so the table appears as soon as FPL has finalised it instead of up to a day later.
 *
 * Safe without a secret: the backend's autosnapshot only stores a snapshot once FPL says the gameweek is finished and is
 * idempotent; on top of that each instance forwards at most one call per THROTTLE_MS.
 */
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { historyTag } from "@/lib/backend";
import { backendUrl, leagueId } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const THROTTLE_MS = 10 * 60_000;
let lastCall = 0;

export async function POST() {
  const now = Date.now();
  if (now - lastCall < THROTTLE_MS) return NextResponse.json({ ok: true, snapshotted: false, throttled: true });
  lastCall = now;

  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.SNAPSHOT_SECRET) headers["x-snapshot-secret"] = process.env.SNAPSHOT_SECRET;
  try {
    const res = await fetch(`${backendUrl()}/autosnapshot/${leagueId()}`, {
      method: "POST",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const body: unknown = await res.json().catch(() => null);
    const snapshotted = res.ok && (body as { snapshotted?: unknown } | null)?.snapshotted === true;
    if (snapshotted) revalidateTag(historyTag(leagueId()));
    return NextResponse.json({ ok: res.ok, snapshotted }, { status: res.ok ? 200 : 502 });
  } catch {
    lastCall = 0; // a sleeping or unreachable backend shouldn't block the next visitor's try
    return NextResponse.json({ ok: false, snapshotted: false }, { status: 504 });
  }
}
