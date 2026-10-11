import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Badge, GameweekPager, LiveRefresh, PageHeader, StateMessage, StatList } from "@/components/ui";
import { GwStatusBadge } from "@/components/views/GwStatusBadge";
import { TeamSheetView } from "@/components/views/TeamSheetView";
import { getBootstrap, getEntry, getEntryPicks, getEventLive, isNotFound } from "@/lib/fpl/client";
import { buildTeamSheet, CHIP_LABEL, currentEvent, formatMoney, formatRank, gwStatus, parseGw } from "@/lib/fpl/derive";
import type { Entry, FplEvent } from "@/lib/fpl/types";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ gw?: string | string[] }>;
};

function parseEntryId(raw: string): number | null {
  return /^\d{1,10}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

async function loadEntry(id: number): Promise<Entry | null> {
  try {
    return await getEntry(id);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseEntryId((await params).entryId);
  const entry = id ? await loadEntry(id).catch(() => null) : null;
  return { title: entry ? `${entry.name} (${entry.player_first_name} ${entry.player_last_name})` : "Team" };
}

const backLink = <Link href="/">← League table</Link>;

/** Picks (null = FPL has none for that GW) and live points (null = unavailable; still show the team). */
function loadGameweek(id: number, gw: number, settled: boolean) {
  return Promise.all([
    getEntryPicks(id, gw, settled).catch((e) => {
      if (isNotFound(e)) return null;
      throw e;
    }),
    getEventLive(gw, settled).catch(() => null),
  ]);
}

const isSettled = (event: FplEvent) => gwStatus(event) === "final";

export default async function TeamPage({ params, searchParams }: Props) {
  const id = parseEntryId((await params).entryId);
  if (!id) notFound();
  const gwParam = (await searchParams).gw;

  const bootstrapP = getBootstrap();
  // Speculate: the gameweek only depends on the entry when ?gw= is before the team's first GW, so start
  // picks + live as soon as bootstrap is in rather than waiting for the entry as well (saves a round trip).
  const speculative = bootstrapP.then((bs) => {
    const latest = currentEvent(bs.events);
    if (!latest) return null;
    const gw = parseGw(gwParam, 1, latest.id) ?? latest.id;
    const event = bs.events.find((e) => e.id === gw)!;
    return { gw, data: loadGameweek(id, gw, isSettled(event)) };
  });
  speculative.then((s) => s?.data.catch(() => {}), () => {}); // consumed below, or deliberately dropped

  const [entry, bootstrap] = await Promise.all([loadEntry(id), bootstrapP]);
  if (!entry) notFound();

  const manager = `${entry.player_first_name} ${entry.player_last_name}`.trim();
  const header = (meta?: ReactNode, actions?: ReactNode) => (
    <PageHeader back={backLink} eyebrow={manager} title={entry.name} meta={meta} actions={actions} />
  );

  const latest = currentEvent(bootstrap.events);
  if (!latest) {
    return (
      <>
        {header()}
        <StateMessage title="The season hasn't started">
          <p>Team sheets appear after the Gameweek 1 deadline.</p>
        </StateMessage>
      </>
    );
  }
  if (entry.started_event > latest.id) {
    return (
      <>
        {header()}
        <StateMessage title={`${entry.name} starts in Gameweek ${entry.started_event}`}>
          <p>This team joined after the {latest.name} deadline, so there&apos;s no team sheet yet.</p>
        </StateMessage>
      </>
    );
  }

  const gw = parseGw(gwParam, entry.started_event, latest.id) ?? latest.id;
  const event = bootstrap.events.find((e) => e.id === gw)!;
  const status = gwStatus(event);

  const guess = await speculative;
  const [picks, live] = await (guess && guess.gw === gw ? guess.data : loadGameweek(id, gw, isSettled(event)));

  const pager = (
    <GameweekPager gw={gw} min={entry.started_event} max={latest.id} href={(n) => `/team/${id}?gw=${n}`} />
  );
  const meta = (
    <>
      <span>{event.name}</span>
      <GwStatusBadge status={status} />
      {picks?.active_chip ? <Badge tone="accent">{CHIP_LABEL[picks.active_chip] ?? picks.active_chip}</Badge> : null}
    </>
  );

  if (!picks) {
    return (
      <>
        {header(meta, pager)}
        <StateMessage title={`No team sheet for ${event.name}`}>
          <p>FPL has no picks for this team in that gameweek.</p>
        </StateMessage>
      </>
    );
  }

  const sheet = buildTeamSheet(picks, bootstrap, live);
  const h = picks.entry_history;
  const hit = h.event_transfers_cost;
  const gwPoints = live ? sheet.grossPoints - hit : h.points;
  const isLive = status === "live" && gw === latest.id;

  return (
    <>
      {header(
        meta,
        <>
          {pager}
          {isLive ? <LiveRefresh enabled /> : null}
        </>,
      )}

      <StatList
        label={`${event.name} summary`}
        items={[
          {
            label: isLive ? "GW points (live)" : "GW points",
            value: gwPoints,
            hint: [hit ? `incl. −${hit} hit` : null, isLive ? "before auto-subs" : null].filter(Boolean).join(" · ") || undefined,
          },
          { label: "Total", value: h.total_points.toLocaleString("en-GB") },
          { label: "Overall rank", value: formatRank(h.overall_rank) },
          { label: "Transfers", value: h.event_transfers, hint: hit ? `−${hit} pts` : "no hit" },
          { label: "Team value", value: formatMoney(h.value), hint: `${formatMoney(h.bank)} in the bank` },
        ]}
      />

      {!live ? (
        <StateMessage tone="info" title="Live points unavailable">
          <p>FPL didn&apos;t return player points for {event.name}. The team is shown without scores.</p>
        </StateMessage>
      ) : null}

      <TeamSheetView sheet={sheet} showPoints={Boolean(live)} />
    </>
  );
}
