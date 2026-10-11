import type { Metadata } from "next";
import { GameweekPager, LiveRefresh, PageHeader, StateMessage } from "@/components/ui";
import { FixtureBonusCard } from "@/components/views/FixtureBonusCard";
import { GwStatusBadge } from "@/components/views/GwStatusBadge";
import styles from "@/components/views/views.module.css";
import { getBootstrap, getFixtures } from "@/lib/fpl/client";
import { currentEvent, fixtureState, gwStatus, parseGw } from "@/lib/fpl/derive";
import type { Fixture } from "@/lib/fpl/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bonus points" };

type Props = { searchParams: Promise<{ gw?: string | string[] }> };

const byKickoff = (a: Fixture, b: Fixture) =>
  (a.kickoff_time ? Date.parse(a.kickoff_time) : Infinity) - (b.kickoff_time ? Date.parse(b.kickoff_time) : Infinity) || a.id - b.id;

export default async function BonusPage({ searchParams }: Props) {
  const bootstrap = await getBootstrap();
  const latest = currentEvent(bootstrap.events);
  if (!latest) {
    return (
      <>
        <PageHeader title="Bonus points" />
        <StateMessage title="The season hasn't started">
          <p>Bonus points appear here once Gameweek 1 kicks off.</p>
        </StateMessage>
      </>
    );
  }

  const gw = parseGw((await searchParams).gw, 1, latest.id) ?? latest.id;
  const event = bootstrap.events.find((e) => e.id === gw)!;
  const status = gwStatus(event);
  const fixtures = (await getFixtures(gw, status === "final")).sort(byKickoff);

  const teams = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const players = new Map(bootstrap.elements.map((p) => [p.id, p]));
  const anyLive = fixtures.some((f) => fixtureState(f) === "live");
  const done = fixtures.filter((f) => f.finished || f.finished_provisional).length;

  return (
    <>
      <PageHeader
        eyebrow="Bonus points"
        title={event.name}
        meta={
          <>
            <GwStatusBadge status={status} />
            <span>
              {done} of {fixtures.length} matches finished
            </span>
          </>
        }
        actions={
          <>
            <GameweekPager gw={gw} min={1} max={latest.id} href={(n) => `/bonus?gw=${n}`} />
            {anyLive ? <LiveRefresh enabled /> : null}
          </>
        }
      />

      {fixtures.length === 0 ? (
        <StateMessage title={`No fixtures in ${event.name}`}>
          <p>Every match in this gameweek has been postponed or rescheduled.</p>
        </StateMessage>
      ) : (
        <div className={styles.fixtureGrid}>
          {fixtures.map((f) => (
            <FixtureBonusCard key={f.id} fixture={f} teams={teams} players={players} />
          ))}
        </div>
      )}
    </>
  );
}
