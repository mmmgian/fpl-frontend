import { neatName, type InterviewInput } from "@/lib/domain/interview";
import type { Messages } from "@/lib/domain";
import type { TeamModel } from "@/lib/services/models";

type Ok = Extract<TeamModel, { kind: "ok" }>;

/** FPL flags a starter as a doubt at any chance under 100; only a real worry is worth a question. */
const WORRYING_DOUBT = 50;

/**
 * What the press conference may ask about, taken from what the manager page already shows: the same numbers, in the
 * reader's language. Nothing is invented here; anything FPL did not give is left out, and the questions about it with it.
 */
export function interviewInputOf(
  model: Ok,
  t: Pick<Messages, "chips" | "team">,
  money: (tenths: number) => string,
  gwName: string,
  lower: (s: string) => string,
): InterviewInput {
  const { team, summary, insights, gameweek } = model;
  const g = insights.gameweek;
  const first = neatName(team.firstName) || neatName(team.manager) || team.teamName;
  const l = team.league;

  const captain = g.captain
    ? { name: g.captain.captain.name, base: g.captain.captain.base, state: g.captain.state, bestName: g.captain.best.name, bestBase: g.captain.best.base, regret: g.captain.regret }
    : null;
  const bench = g.bench ? { points: g.bench.points, top: g.bench.players[0] && g.bench.players[0].points > 0 ? g.bench.players[0] : null, counted: g.bench.counted } : null;
  const worried = g.flags.find((f) => f.wasStarter && (f.label !== "Doubtful" || (f.chance != null && f.chance <= WORRYING_DOUBT)));
  const sub = g.autoSubs[0];
  const form = insights.season?.form;

  return {
    team: team.teamName,
    first,
    manager: neatName(team.manager) || first,
    gw: gwName,
    points: summary.gwPoints,
    total: summary.total,
    hit: summary.hit,
    bank: summary.bank,
    bankText: money(summary.bank),
    settled: gameweek.status === "final" || gameweek.status === "provisional",
    league: l
      ? {
          rank: l.rank,
          size: l.size,
          points: l.points,
          leader: { team: l.leader.teamName, points: l.leader.points },
          up: l.prev ? { team: l.prev.teamName, points: l.prev.points } : null,
          down: l.next ? { team: l.next.teamName, points: l.next.points } : null,
          moved: l.moved,
        }
      : null,
    captain,
    bench,
    chip: g.chip ? { code: g.chip.chip, label: (t.chips as Record<string, string>)[g.chip.chip] ?? g.chip.chip, points: g.chip.points } : null,
    flagged: worried ? { name: worried.name, label: lower((t.team.flags as Record<string, string>)[worried.label] ?? worried.label) } : null,
    autoSub: sub ? { out: sub.out.name, in: sub.in.name } : null,
    season: form ? { average: form.average, benchPoints: form.benchPoints, hitPoints: form.hitPoints } : null,
  };
}
