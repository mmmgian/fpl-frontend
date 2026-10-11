import { LiveRefresh, PageHeader, StateMessage, StatList } from "@/components/ui";
import { GwStatusBadge } from "@/components/views/GwStatusBadge";
import { StandingsTable } from "@/components/views/StandingsTable";
import { leagueId } from "@/lib/config";
import { getBootstrap, getLeagueStandings, isNotFound } from "@/lib/fpl/client";
import { currentEvent, gwStatus } from "@/lib/fpl/derive";

export const dynamic = "force-dynamic";

export default async function LeaguePage() {
  const id = leagueId();
  let standings;
  try {
    standings = await getLeagueStandings(id);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    return (
      <StateMessage tone="error" title="League not found" headingLevel={1}>
        <p>
          FPL has no classic league with ID {id}. Check the <code>LEAGUE_ID</code> environment variable.
        </p>
      </StateMessage>
    );
  }
  const bootstrap = await getBootstrap();
  const event = currentEvent(bootstrap.events);
  const status = event ? gwStatus(event) : null;
  const rows = standings.standings.results;
  const leader = rows[0];
  const bestGw = rows.reduce<(typeof rows)[number] | undefined>((best, r) => (!best || r.event_total > best.event_total ? r : best), undefined);

  return (
    <>
      <PageHeader
        eyebrow={`Classic league · ID ${id}`}
        title={standings.league.name}
        meta={
          event && status ? (
            <>
              <span>{event.name}</span>
              <GwStatusBadge status={status} />
            </>
          ) : (
            <span>Pre-season</span>
          )
        }
        actions={status === "live" ? <LiveRefresh enabled /> : undefined}
      />

      {rows.length === 0 ? (
        <StateMessage title="The table is empty for now">
          <p>
            Standings appear after the first gameweek deadline.
            {standings.new_entries?.results.length
              ? ` ${standings.new_entries.results.length} managers have joined so far.`
              : ""}
          </p>
        </StateMessage>
      ) : (
        <>
          <StatList
            label="League summary"
            items={[
              { label: "Leader", value: leader.total.toLocaleString("en-GB"), hint: leader.entry_name },
              ...(bestGw && event ? [{ label: `Best ${event.name.replace("Gameweek", "GW")}`, value: bestGw.event_total, hint: bestGw.entry_name }] : []),
              { label: "Managers", value: rows.length, hint: standings.standings.has_next ? "Showing first pages only" : undefined },
            ]}
          />
          <StandingsTable rows={rows} caption={`${standings.league.name} standings`} hideCaption />
        </>
      )}
    </>
  );
}
