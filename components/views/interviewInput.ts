import { DEFCON_THRESHOLD, allPlayers } from "@/lib/domain";
import { neatName, type InterviewInput, type InterviewPlayer } from "@/lib/domain/interview";
import type { Messages } from "@/lib/domain";
import type { TeamModel } from "@/lib/services/models";

type Ok = Extract<TeamModel, { kind: "ok" }>;

/** FPL flags a starter as a doubt at any chance under 100; only a real worry is worth a question. */
const WORRYING_DOUBT = 50;
const OUT_LABELS = new Set(["Injured", "Suspended", "Unavailable"]);

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
  const { team, summary, insights, gameweek, sheet } = model;
  const g = insights.gameweek;
  const first = neatName(team.firstName) || neatName(team.manager) || team.teamName;
  const l = team.league;
  const flagLabel = (label: string) => lower((t.team.flags as Record<string, string>)[label] ?? label);

  const captain = g.captain
    ? { name: g.captain.captain.name, base: g.captain.captain.base, state: g.captain.state, bestName: g.captain.best.name, bestBase: g.captain.best.base, regret: g.captain.regret }
    : null;
  const bench = g.bench ? { points: g.bench.points, top: g.bench.players[0] && g.bench.players[0].points > 0 ? g.bench.players[0] : null, counted: g.bench.counted } : null;
  const worried = g.flags.find((f) => f.wasStarter && (f.label !== "Doubtful" || (f.chance != null && f.chance <= WORRYING_DOUBT)));
  const sub = g.autoSubs[0];
  const form = insights.season?.form;
  const charts = insights.season?.charts;
  const defcon = new Map(g.defcon.map((d) => [d.name, d]));

  const players: InterviewPlayer[] = model.showPoints
    ? allPlayers(sheet).map((p) => {
        const flagged = (p.status != null && p.status !== "a") || (p.chanceOfPlaying != null && p.chanceOfPlaying < 100);
        const label = p.status === "i" ? "Injured" : p.status === "s" ? "Suspended" : p.status === "u" || p.status === "n" ? "Unavailable" : "Doubtful";
        const threshold = DEFCON_THRESHOLD[p.positionId];
        const d = defcon.get(p.name);
        return {
          name: p.name,
          pos: p.positionId,
          club: p.clubName,
          started: p.slot <= 11,
          counted: p.multiplier > 0,
          captain: p.isCaptain,
          vice: p.isVice,
          minutes: p.minutes,
          points: p.basePoints,
          multiplier: p.multiplier,
          goals: p.goals ?? 0,
          assists: p.assists ?? 0,
          xg: p.xg,
          xa: p.xa,
          bonus: p.bonus,
          yellow: p.yellow,
          red: p.red,
          ownGoals: p.ownGoals,
          penMissed: p.penMissed,
          saves: p.saves,
          cleanSheet: p.cleanSheet,
          conceded: p.conceded,
          price: p.price,
          form: p.form,
          ownership: p.ownership,
          flag: flagged ? { kind: OUT_LABELS.has(label) && (p.chanceOfPlaying ?? 0) < 50 ? "out" : "doubt", label: flagLabel(label), chance: p.chanceOfPlaying } : null,
          defconReached: Boolean(d?.reached),
          defconNear: Boolean(threshold && d && d.matches === 1 && !d.reached && d.value === threshold - 1),
        } satisfies InterviewPlayer;
      })
    : [];

  const ranks = charts?.ranks ?? [];
  const lastTwo = ranks.slice(-2);
  const rotated = g.rotation.find((r) => r.wasStarter);

  return {
    team: team.teamName,
    first,
    manager: neatName(team.manager) || first,
    gw: gwName,
    gwNumber: gameweek.gw,
    points: summary.gwPoints,
    total: summary.total,
    hit: summary.hit,
    transfers: summary.transfers,
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
    flagged: worried ? { name: worried.name, label: flagLabel(worried.label) } : null,
    autoSub: sub ? { out: sub.out.name, in: sub.in.name, inPoints: sub.in.points, outPoints: sub.out.points } : null,
    season: form ? { average: form.average, benchPoints: form.benchPoints, hitPoints: form.hitPoints } : null,
    players,
    rotated: rotated ? { name: rotated.name } : null,
    planet: summary.overallRank ? { rank: summary.overallRank, of: summary.fieldSize ?? null } : null,
    rankMove: lastTwo.length === 2 ? { from: lastTwo[0].rank, to: lastTwo[1].rank } : null,
    value: form ? { now: form.value.now, start: form.value.start } : null,
    beat: charts?.beatAverage ?? null,
    freeTransfers: insights.season?.freeTransfers.available ?? null,
    outlook: insights.squad.outlook ? { average: insights.squad.outlook.average, hardest: insights.squad.outlook.hardest.club, easiest: insights.squad.outlook.easiest.club } : null,
    upside: insights.squad.upside ?? null,
  };
}
