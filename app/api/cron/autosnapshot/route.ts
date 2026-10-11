/**
 * Vercel Cron -> backend snapshot. Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 * The backend decides whether the gameweek is over, so calling this daily is safe and idempotent.
 */
import { NextResponse, type NextRequest } from "next/server";
import { backendUrl, leagueId } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ ok: res.ok, upstreamStatus: res.status, body }, { status: res.ok ? 200 : 502 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `backend unreachable: ${message}` }, { status: 504 });
  }
}
