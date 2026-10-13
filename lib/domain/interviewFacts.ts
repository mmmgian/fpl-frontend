/**
 * What the press conference can ask a manager about: the facts of this team's gameweek and season (blunders, injuries,
 * goals and expected goals, defence, who was picked and what they cost, rank and value, and the league table), the
 * context those questions and answers may quote, and which topics apply and how much each is worth. Pure: no I/O.
 */
import type { GwStatus } from "./gameweek";
import type { FullTopic } from "./interview";
import type { Lab } from "./lab";
import type { Upside } from "./upside";

/**
 * Where the topics come from. The conference takes one from the faults, one from the league and one about the moment
 * (`phase`: what is still to play, the bonus FPL has yet to confirm, the signed-off verdict, or the next deadline), then
 * spreads out.
 */
export type Group = "blunder" | "injury" | "attack" | "defence" | "market" | "season" | "position" | "phase";

/**
 * The moment the conference is held in, which colours how the journalists introduce their questions: while matches
 * are on, while FPL's bonus is still provisional, once FPL has signed the gameweek off, or (the latest gameweek being
 * over) in the run-up to the next deadline.
 */
export type InterviewMood = "live" | "provisional" | "final" | "ahead";
export const INTERVIEW_MOODS: readonly InterviewMood[] = ["live", "provisional", "final", "ahead"];

/**
 * The mood of a conference: live while it is played, provisional while FPL's bonus is unconfirmed; once FPL signs the
 * gameweek off, the next deadline if one is ahead, else the final verdict (the season's last gameweek).
 */
export function interviewMood(phase: GwStatus | undefined, ahead: boolean): InterviewMood {
  if (phase === "live") return "live";
  if (phase === "provisional") return "provisional";
  return phase === "upcoming" || ahead ? "ahead" : "final";
}

export interface InterviewPlayer {
  name: string;
  /** 1 goalkeeper, 2 defender, 3 midfielder, 4 forward. */
  pos: 1 | 2 | 3 | 4;
  /** The club's full name. */
  club: string;
  started: boolean;
  /** Their points counted this gameweek (a non-zero multiplier). */
  counted: boolean;
  captain: boolean;
  vice: boolean;
  minutes: number | null;
  /** Points before the captain's multiplier; null when FPL sent none. */
  points: number | null;
  multiplier: number;
  goals: number;
  assists: number;
  xg: number;
  xa: number;
  bonus: number;
  yellow: number;
  red: number;
  ownGoals: number;
  penMissed: number;
  saves: number;
  cleanSheet: boolean;
  conceded: number;
  /** Tenths of £m. */
  price: number | null;
  form: number | null;
  ownership: number | null;
  /** FPL flags the player: "out" (injured, suspended, unavailable) or "doubt"; the flag in the reader's language. */
  flag: { kind: "out" | "doubt"; label: string; chance: number | null } | null;
  /** Reached the DefCon bonus, or is one short of it, this gameweek (never claimed for a double gameweek). */
  defconReached: boolean;
  defconNear: boolean;
}

/** How numbers become words in the reader's language. */
export interface InterviewFormat {
  money: (tenths: number) => string;
  oneDecimal: (n: number) => string;
  number: (n: number) => string;
}
export const PLAIN_FORMAT: InterviewFormat = { money: (t) => `£${(t / 10).toFixed(1)}m`, oneDecimal: (n) => n.toFixed(1), number: (n) => String(n) };

/** The facts the conference is built from, already in the reader's words and numbers. Every part is optional-by-data. */
export interface InterviewInput {
  team: string;
  /** The manager's first name, and full name, as a journalist would say them. */
  first: string;
  manager: string;
  /** "Gameweek 6". */
  gw: string;
  gwNumber: number;
  /** Points scored (after any hit). */
  points: number;
  total: number;
  /** Transfer hit in points (0 = none), and transfers made. */
  hit: number;
  transfers: number;
  /** Money in the bank, in tenths of £m, and as the reader would see it. */
  bank: number;
  bankText: string;
  /** False while the gameweek is still being played: partial scores prove nothing, so what is missing waits. */
  settled: boolean;
  league: {
    rank: number;
    size: number;
    points: number;
    leader: { team: string; points: number };
    up: { team: string; points: number } | null;
    down: { team: string; points: number } | null;
    /** Places climbed since the last gameweek (negative = fell). */
    moved: number;
  } | null;
  captain: { name: string; base: number; state: "played" | "waiting" | "unused"; bestName: string; bestBase: number; regret: number | null } | null;
  bench: { points: number; top: { name: string; points: number } | null; counted: boolean } | null;
  chip: { code: string; label: string; points: number } | null;
  /** A starter FPL flags as out or doubtful, with the flag in the reader's language. */
  flagged: { name: string; label: string } | null;
  autoSub: { out: string; in: string; inPoints: number; outPoints: number } | null;
  season: { average: number; benchPoints: number; hitPoints: number } | null;
  /** The whole squad of fifteen with what each did; empty when FPL sent no player data. */
  players: InterviewPlayer[];
  /** A fit starter who did not play although his club's matches are over. */
  rotated: { name: string } | null;
  /** Overall rank, and how many play FPL. */
  planet: { rank: number; of: number | null } | null;
  /** Overall rank last gameweek and now. */
  rankMove: { from: number; to: number } | null;
  /** Squad value now and after the first gameweek, in tenths of £m. */
  value: { now: number; start: number } | null;
  /** Weeks this season the score beat the average manager's, out of the weeks an average is known. */
  beat: { weeks: number; of: number } | null;
  freeTransfers: number | null;
  /** The toughest and kindest club runs the starting XI faces next. */
  outlook: { average: number; hardest: string; easiest: string } | null;
  /** Little-owned players worth chasing, for the altered press conference. */
  upside: Upside | null;
  /** The lab's simulations and trackers, for the altered press conference. */
  lab: Lab | null;
  /** Where FPL is with this gameweek (live, provisional, final); absent means unknown, and no question is asked about it. */
  phase?: GwStatus;
  /** While live: starters who count and have not played yet (and the same weighted by multiplier). */
  remaining?: { count: number; effective: number } | null;
  /**
   * The next deadline, when it is still ahead (the latest gameweek is over and another follows): its name, the squad's
   * best armband by the lab's simulation for it, and a starter facing a hard fixture in it.
   */
  ahead?: {
    gw: string;
    captain: { name: string; xp: number; p10: number } | null;
    fixture: { name: string; opponent: string; difficulty: number } | null;
  } | null;
}

/** What a question or answer may mention. Every field is always filled; a topic only uses what it was chosen for. */
export interface InterviewContext {
  team: string;
  first: string;
  manager: string;
  gw: string;
  points: number;
  total: number;
  rank: number;
  size: number;
  leader: string;
  leaderGap: number;
  upTeam: string;
  gapUp: number;
  downTeam: string;
  gapDown: number;
  /** Places climbed or fallen, always positive. */
  places: number;
  captain: string;
  captainPts: number;
  best: string;
  bestPts: number;
  regret: number;
  bench: number;
  benchTop: string;
  benchTopPts: number;
  hit: number;
  flagged: string;
  flaggedLabel: string;
  subOut: string;
  subIn: string;
  subInPts: number;
  chip: string;
  chipPts: number;
  avg: number;
  seasonBench: number;
  seasonHits: number;
  bank: string;
  // injuries
  benchFlagged: string;
  benchFlaggedLabel: string;
  flaggedCount: number;
  captainFlag: string;
  ghost: string;
  rotated: string;
  // goals, assists, expected goals
  scorer: string;
  scorerGoals: number;
  defScorer: string;
  assister: string;
  assisterAssists: number;
  xgPlayer: string;
  xgValue: string;
  squadGoals: number;
  squadXg: string;
  penPlayer: string;
  ownPlayer: string;
  // defence and discipline
  csCount: number;
  conceded: number;
  gk: string;
  gkSaves: number;
  gkPts: number;
  redPlayer: string;
  yellowCount: number;
  defconCount: number;
  defconNear: string;
  // who was picked
  expensive: string;
  expensivePrice: string;
  expensivePts: number;
  template: string;
  templateOwn: number;
  diff: string;
  diffPts: number;
  diffOwn: number;
  cold: string;
  coldForm: string;
  hotBench: string;
  hotForm: string;
  trioClub: string;
  trioCount: number;
  formation: string;
  star: string;
  starShare: number;
  vice: string;
  viceBase: number;
  // season
  rankFrom: string;
  rankTo: string;
  rankPct: number;
  valueNow: string;
  valueDelta: string;
  beatWeeks: number;
  beatOf: number;
  transfers: number;
  freeTransfers: number;
  hardClub: string;
  runAvg: string;
  easyClub: string;
  /** Starters most of the world also owns (a third of managers or more). */
  templateCount: number;
  // the tip being given in the altered conference
  upName: string;
  upClub: string;
  upOwn: string;
  upXp: string;
  /** Chance of 10+ and 15+ points in the simulation, whole percent; a note beside the player (e.g. DefCon share). */
  upP10: string;
  upP15: string;
  upNote: string;
  /** The next percentile door in the world rank (top N%), and roughly which rank that is. */
  goalTop: number;
  goalRank: string;
  // the moment: still to play, provisional bonus, the next deadline
  /** Counting players yet to play (live), and the bonus FPL has provisionally given the XI (with the captain's multiplier). */
  remaining: number;
  bonusPts: number;
  /** The next deadline's gameweek, e.g. "Gameweek 7"; the squad's best armband for it by simulation, its mean and chance of 10+ (whole %). */
  nextGw: string;
  nextCaptain: string;
  nextCaptainXp: string;
  nextCaptainP10: number;
  /** A starter facing a hard fixture next ("ARS (A)"), and its difficulty. */
  nextPlayer: string;
  nextOpp: string;
  nextFdr: number;
  /** A squad player FPL flags ahead of the next deadline, with the flag in the reader's words. */
  nextFlag: string;
  nextFlagLabel: string;
}

const best = <T>(items: T[], pick: (t: T) => number): T | undefined =>
  items.reduce<T | undefined>((best, t) => (best === undefined || pick(t) > pick(best) ? t : best), undefined);

const SQUAD = (i: InterviewInput) => i.players;
const counted = (i: InterviewInput) => SQUAD(i).filter((p) => p.counted);
const starters = (i: InterviewInput) => SQUAD(i).filter((p) => p.started);
const played = (p: InterviewPlayer) => (p.minutes ?? 0) > 0;
const pts = (p: InterviewPlayer) => p.points ?? 0;

/** What "the squad's finest" etc. means in each topic, found once so the trigger and the words always agree. */
function squadFacts(i: InterviewInput) {
  const xi = counted(i);
  const goals = xi.reduce((s, p) => s + p.goals, 0);
  const xg = xi.reduce((s, p) => s + p.xg, 0);
  const scorer = best(xi.filter((p) => p.goals > 0), (p) => p.goals * 100 + pts(p));
  const defScorer = best(xi.filter((p) => p.pos <= 2 && p.goals > 0), (p) => p.goals);
  const assister = best(xi.filter((p) => p.assists > 0), (p) => p.assists * 100 + pts(p));
  const waster = best(starters(i).filter((p) => p.goals === 0 && played(p)), (p) => p.xg);
  const gk = xi.find((p) => p.pos === 1 && played(p));
  const back = xi.filter((p) => p.pos <= 2 && played(p));
  const expensive = best(starters(i).filter((p) => played(p) && p.price != null), (p) => p.price ?? 0);
  const template = best(xi.filter((p) => played(p) && (p.ownership ?? 0) >= 30 && pts(p) <= 2), (p) => p.ownership ?? 0);
  const diff = best(xi.filter((p) => (p.ownership ?? 100) < 10 && pts(p) >= 8), (p) => pts(p));
  const cold = best(starters(i).filter((p) => p.form != null && p.form <= 2), (p) => -(p.form ?? 0));
  const hotBench = best(SQUAD(i).filter((p) => !p.started && p.form != null && p.form >= 6), (p) => p.form ?? 0);
  const byClub = new Map<string, number>();
  for (const p of starters(i)) byClub.set(p.club, (byClub.get(p.club) ?? 0) + 1);
  const trio = [...byClub.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1])[0];
  const gross = xi.reduce((s, p) => s + pts(p) * p.multiplier, 0);
  const star = best(xi, (p) => pts(p) * p.multiplier);
  const cap = SQUAD(i).find((p) => p.captain);
  const vice = SQUAD(i).find((p) => p.vice);
  const positions = [2, 3, 4].map((pos) => starters(i).filter((p) => p.pos === pos).length);
  const flagged = SQUAD(i).filter((p) => p.flag);
  const bonus = xi.reduce((s, p) => s + p.bonus * p.multiplier, 0);
  return { xi, goals, xg, scorer, defScorer, assister, waster, gk, back, expensive, template, diff, cold, hotBench, trio, gross, star, cap, vice, positions, flagged, bonus };
}

/** The next milestone up the world ranking: the largest "top N%" door the manager is not yet through. */
export const RANK_DOORS = [50, 25, 10, 5, 1] as const;
export function nextDoor(planet: InterviewInput["planet"]): { top: number; rank: number } | null {
  if (!planet?.of || planet.rank <= 0) return null;
  const share = (planet.rank / planet.of) * 100;
  const top = RANK_DOORS.find((d) => d < share);
  return top ? { top, rank: Math.round((planet.of * top) / 100) } : null;
}

const BAD_CAPTAIN_BASE = 3;
const NEAR_POINTS = 15;
const BIG_BENCH = 8;
const SEASON_BENCH = 40;
const SEASON_HITS = 8;
const IDLE_BANK = 20;

/** The context a topic's words draw on. */
export function interviewContext(i: InterviewInput, fmt: InterviewFormat = PLAIN_FORMAT): InterviewContext {
  const l = i.league;
  const f = squadFacts(i);
  const bench = SQUAD(i).filter((p) => !p.started);
  const benchFlagged = bench.find((p) => p.flag?.kind === "out") ?? bench.find((p) => p.flag);
  const danger = f.flagged.find((p) => p.captain);
  const ghost = starters(i).find((p) => p.flag?.kind === "out" && p.minutes === 0);
  const pen = SQUAD(i).find((p) => p.counted && p.penMissed > 0);
  const own = SQUAD(i).find((p) => p.counted && p.ownGoals > 0);
  const red = SQUAD(i).find((p) => p.counted && p.red > 0);
  const defconNear = starters(i).find((p) => p.defconNear);
  const delta = i.value ? i.value.now - i.value.start : 0;
  const planetPct = i.planet?.of ? Math.round((1 - i.planet.rank / i.planet.of) * 100) : 0;
  const goal = nextDoor(i.planet);
  const nextFlag = nextFlagged(i);
  return {
    team: i.team,
    first: i.first,
    manager: i.manager,
    gw: i.gw,
    points: i.points,
    total: i.total,
    rank: l?.rank ?? 0,
    size: l?.size ?? 0,
    leader: l?.leader.team ?? "",
    leaderGap: l ? Math.max(0, l.leader.points - l.points) : 0,
    upTeam: l?.up?.team ?? "",
    gapUp: l?.up ? Math.max(0, l.up.points - l.points) : 0,
    downTeam: l?.down?.team ?? "",
    gapDown: l?.down ? Math.max(0, l.points - l.down.points) : 0,
    places: Math.abs(l?.moved ?? 0),
    captain: i.captain?.name ?? f.cap?.name ?? "",
    captainPts: i.captain?.base ?? (f.cap ? pts(f.cap) : 0),
    best: i.captain?.bestName ?? "",
    bestPts: i.captain?.bestBase ?? 0,
    regret: i.captain?.regret ?? 0,
    bench: i.bench?.points ?? 0,
    benchTop: i.bench?.top?.name ?? "",
    benchTopPts: i.bench?.top?.points ?? 0,
    hit: i.hit,
    flagged: i.flagged?.name ?? "",
    flaggedLabel: i.flagged?.label ?? "",
    subOut: i.autoSub?.out ?? "",
    subIn: i.autoSub?.in ?? "",
    subInPts: i.autoSub?.inPoints ?? 0,
    chip: i.chip?.label ?? "",
    chipPts: i.chip?.points ?? 0,
    avg: Math.round(i.season?.average ?? 0),
    seasonBench: i.season?.benchPoints ?? 0,
    seasonHits: i.season?.hitPoints ?? 0,
    bank: i.bankText,
    benchFlagged: benchFlagged?.name ?? "",
    benchFlaggedLabel: benchFlagged?.flag?.label ?? "",
    flaggedCount: f.flagged.length,
    captainFlag: danger?.flag?.label ?? "",
    ghost: ghost?.name ?? "",
    rotated: i.rotated?.name ?? "",
    scorer: f.scorer?.name ?? "",
    scorerGoals: f.scorer?.goals ?? 0,
    defScorer: f.defScorer?.name ?? "",
    assister: f.assister?.name ?? "",
    assisterAssists: f.assister?.assists ?? 0,
    xgPlayer: f.waster?.name ?? "",
    xgValue: fmt.oneDecimal(f.waster?.xg ?? 0),
    squadGoals: f.goals,
    squadXg: fmt.oneDecimal(f.xg),
    penPlayer: pen?.name ?? "",
    ownPlayer: own?.name ?? "",
    csCount: f.back.filter((p) => p.cleanSheet).length,
    conceded: f.back.reduce((s, p) => s + p.conceded, 0),
    gk: f.gk?.name ?? "",
    gkSaves: f.gk?.saves ?? 0,
    gkPts: f.gk ? pts(f.gk) : 0,
    redPlayer: red?.name ?? "",
    yellowCount: f.xi.reduce((s, p) => s + p.yellow, 0),
    defconCount: f.xi.filter((p) => p.defconReached).length,
    defconNear: defconNear?.name ?? "",
    expensive: f.expensive?.name ?? "",
    expensivePrice: f.expensive?.price != null ? fmt.money(f.expensive.price) : "",
    expensivePts: f.expensive ? pts(f.expensive) : 0,
    template: f.template?.name ?? "",
    templateOwn: Math.round(f.template?.ownership ?? 0),
    diff: f.diff?.name ?? "",
    diffPts: f.diff ? pts(f.diff) : 0,
    diffOwn: Math.round((f.diff?.ownership ?? 0) * 10) / 10,
    cold: f.cold?.name ?? "",
    coldForm: fmt.oneDecimal(f.cold?.form ?? 0),
    hotBench: f.hotBench?.name ?? "",
    hotForm: fmt.oneDecimal(f.hotBench?.form ?? 0),
    trioClub: f.trio?.[0] ?? "",
    trioCount: f.trio?.[1] ?? 0,
    formation: f.positions.join("-"),
    star: f.star?.name ?? "",
    starShare: f.gross > 0 && f.star ? Math.round(((pts(f.star) * f.star.multiplier) / f.gross) * 100) : 0,
    vice: f.vice?.name ?? "",
    viceBase: f.vice ? pts(f.vice) : 0,
    rankFrom: i.rankMove ? fmt.number(i.rankMove.from) : "",
    rankTo: i.rankMove ? fmt.number(i.rankMove.to) : i.planet ? fmt.number(i.planet.rank) : "",
    rankPct: Math.max(0, planetPct),
    valueNow: i.value ? fmt.money(i.value.now) : "",
    valueDelta: fmt.money(Math.abs(delta)),
    beatWeeks: i.beat?.weeks ?? 0,
    beatOf: i.beat?.of ?? 0,
    transfers: i.transfers,
    freeTransfers: i.freeTransfers ?? 0,
    hardClub: i.outlook?.hardest ?? "",
    runAvg: fmt.oneDecimal(i.outlook?.average ?? 0),
    easyClub: i.outlook?.easiest ?? "",
    templateCount: starters(i).filter((p) => (p.ownership ?? 0) >= 35).length,
    upName: "",
    upClub: "",
    upOwn: "",
    upXp: "",
    upP10: "",
    upP15: "",
    upNote: "",
    goalTop: goal?.top ?? 0,
    goalRank: goal ? fmt.number(goal.rank) : "",
    remaining: i.remaining?.count ?? 0,
    bonusPts: f.bonus,
    nextGw: i.ahead?.gw ?? "",
    nextCaptain: i.ahead?.captain?.name ?? "",
    nextCaptainXp: i.ahead?.captain ? fmt.oneDecimal(i.ahead.captain.xp) : "",
    nextCaptainP10: i.ahead?.captain ? Math.round(i.ahead.captain.p10 * 100) : 0,
    nextPlayer: i.ahead?.fixture?.name ?? "",
    nextOpp: i.ahead?.fixture?.opponent ?? "",
    nextFdr: i.ahead?.fixture?.difficulty ?? 0,
    nextFlag: nextFlag?.name ?? "",
    nextFlagLabel: nextFlag?.flag?.label ?? "",
  };
}

/** The squad player whose flag matters most before the next deadline: a starter before a bench player, "out" before "doubt". */
function nextFlagged(i: InterviewInput): InterviewPlayer | undefined {
  const flagged = SQUAD(i).filter((p) => p.flag);
  const rank = (p: InterviewPlayer) => (p.started ? 2 : 0) + (p.flag?.kind === "out" ? 1 : 0);
  return best(flagged, rank);
}

export interface Candidate {
  topic: FullTopic;
  group: Group;
  /** How much there is to say: bigger blunders and sharper situations are asked about more often. */
  weight: number;
}

/** What there is to ask this team about, with how much each is worth. */
export function candidatesOf(i: InterviewInput): Candidate[] {
  const out: Candidate[] = [];
  const add = (topic: FullTopic, group: Group, weight: number) => out.push({ topic, group, weight });
  const c = i.captain;
  const f = squadFacts(i);
  const have = i.players.length > 0;
  const settled = i.settled;
  const avg = i.season?.average ?? 0;

  // blunders
  if (c?.state === "unused") add("captainUnused", "blunder", 95);
  if (settled && c?.state === "played" && c.regret != null) {
    if (c.base <= BAD_CAPTAIN_BASE && c.regret >= 6) add("captainBlank", "blunder", 70 + Math.min(c.regret, 30));
    else if (c.base > BAD_CAPTAIN_BASE && c.regret >= 8) add("captainRegret", "blunder", 55 + Math.min(c.regret, 30));
  }
  if (settled && i.bench && !i.bench.counted && i.bench.points >= BIG_BENCH && i.bench.top) add("benchHaul", "blunder", 45 + Math.min(i.bench.points * 2, 40));
  if (i.hit >= 4) add("hitTaken", "blunder", 55 + Math.min(i.hit * 2, 24));
  if (i.flagged) add("injuredStarter", "injury", 65);
  if (settled && i.autoSub) add("autoSubbed", "blunder", 45);
  if (settled && i.chip && (i.chip.code === "3xc" ? i.chip.points <= 6 : i.chip.code === "bboost" && i.chip.points <= 8)) add("chipFlop", "blunder", 90);
  if (settled && avg > 0 && i.points <= avg * 0.75) add("badWeek", "blunder", 60 + Math.min(Math.round(avg - i.points), 30));
  if (i.season && i.season.benchPoints >= SEASON_BENCH) add("seasonBench", "season", 35 + Math.min(Math.round(i.season.benchPoints / 4), 25));
  if (i.season && i.season.hitPoints >= SEASON_HITS) add("seasonHits", "season", 40 + Math.min(i.season.hitPoints, 25));
  if (i.bank >= IDLE_BANK) add("idleBank", "market", 30 + Math.min(i.bank, 30));

  if (have) {
    // injuries
    const benchOut = i.players.filter((p) => !p.started && p.flag?.kind === "out");
    if (benchOut.length) add("injuredBench", "injury", 40);
    if (f.flagged.length >= 3) add("squadInjuries", "injury", 55 + Math.min(f.flagged.length * 3, 15));
    const capFlag = f.cap?.flag;
    if (capFlag) add("captainDoubt", "injury", 75);
    if (settled && i.players.some((p) => p.started && p.flag?.kind === "out" && p.minutes === 0)) add("ghostStarter", "injury", 85);
    if (settled && i.rotated) add("rotatedOut", "injury", 60);

    // goals, assists, expected goals
    if (f.scorer && f.scorer.goals >= 3) add("hatTrick", "attack", 75);
    else if (f.scorer && f.scorer.goals === 2) add("brace", "attack", 45);
    if (f.defScorer) add("defenderScored", "attack", 55);
    if (f.assister && f.assister.assists >= 2) add("assistHaul", "attack", 30 + Math.min((f.assister.assists - 2) * 12, 36)); // two assists is common, three-plus is a story
    if (settled && f.xi.some((p) => p.pos >= 3) && f.xi.filter((p) => p.pos >= 3).every((p) => p.goals === 0)) add("blankAttack", "attack", 65);
    if (settled && f.waster && f.waster.xg >= 0.9) add("xgWaste", "attack", 60 + Math.min(Math.round(f.waster.xg * 10), 15));
    if (settled && f.goals >= 2 && f.goals >= f.xg + 1.5) add("luckyGoals", "attack", 50);
    if (settled && f.xg >= f.goals + 1.5 && f.xg >= 2) add("unluckyXg", "attack", 55);
    if (i.players.some((p) => p.counted && p.penMissed > 0)) add("penMiss", "attack", 80);
    if (i.players.some((p) => p.counted && p.ownGoals > 0)) add("ownGoal", "attack", 80);

    // defence and discipline
    if (settled && f.back.filter((p) => p.cleanSheet).length >= 3) add("cleanSheets", "defence", 45);
    if (settled && f.back.reduce((s, p) => s + p.conceded, 0) >= 7) add("leakyDefence", "defence", 55);
    if (f.gk && f.gk.saves >= 6) add("keeperSaves", "defence", 40);
    if (settled && f.gk && pts(f.gk) <= 1) add("keeperBlank", "defence", 50);
    if (i.players.some((p) => p.counted && p.red > 0)) add("redCard", "defence", 85);
    if (f.xi.reduce((s, p) => s + p.yellow, 0) >= 3) add("yellowFest", "defence", 45);
    if (settled && f.xi.filter((p) => p.defconReached).length >= 2) add("defconHaul", "defence", 40);
    if (settled && i.players.some((p) => p.started && p.defconNear)) add("defconNear", "defence", 45);

    // who was picked
    if (settled && f.expensive && (f.expensive.price ?? 0) >= 100 && pts(f.expensive) <= 2) add("expensiveFlop", "market", 70);
    if (settled && f.template) add("templateBlank", "market", 60);
    if (f.diff) add("differentialHit", "market", 50);
    if (f.cold) add("coldStarter", "market", 50);
    if (f.hotBench) add("hotBench", "market", 55);
    if (f.trio) add("tripleUp", "market", 35);
    if (f.positions.reduce((s, n) => s + n, 0) === 10) add("formation", "market", 12);
    if (settled && f.star && f.gross >= 30 && (pts(f.star) * f.star.multiplier) / f.gross >= 0.4) add("oneManShow", "market", 50);
    if (settled && f.cap && f.vice && played(f.cap) && played(f.vice) && pts(f.vice) >= pts(f.cap) + 6) add("viceBetter", "blunder", 65);
    if (settled && f.cap && pts(f.cap) >= 10) add("captainHaul", "attack", 45);
  }
  if (settled && i.autoSub && i.autoSub.inPoints >= 6) add("subSaved", "market", 40);
  if (i.outlook && i.outlook.average >= 3.4) add("toughRun", "market", 40);

  // the season
  if (i.rankMove && i.rankMove.from > 0 && i.rankMove.to > 0) {
    const change = (i.rankMove.from - i.rankMove.to) / i.rankMove.from;
    if (change >= 0.15) add("rankRise", "season", 55);
    else if (change <= -0.15) add("rankFall", "season", 65);
  }
  if (i.planet?.of) {
    const share = i.planet.rank / i.planet.of;
    if (share <= 0.1) add("planetTop", "season", 50);
    else if (share >= 0.6) add("planetLow", "season", 55);
  }
  if (i.value) {
    const d = i.value.now - i.value.start;
    if (d >= 8) add("valueUp", "season", 40);
    else if (d <= -3) add("valueDown", "season", 50);
  }
  if (i.beat && i.beat.of >= 3) {
    if (i.beat.weeks / i.beat.of <= 0.4) add("beatLow", "season", 55);
    else if (i.beat.weeks / i.beat.of >= 0.8) add("beatHigh", "season", 45);
  }
  if (i.transfers === 0 && i.hit === 0 && i.gwNumber >= 2) add("noTransfers", "season", 35);
  if (i.transfers >= 3) add("bigRevamp", "season", 45);
  if ((i.freeTransfers ?? 0) >= 3 && i.transfers === 0) add("ftBanked", "season", 45);

  // where it stands
  const l = i.league;
  if (l && l.size > 1) {
    const toLeader = l.leader.points - l.points;
    if (l.rank === 1) {
      if (l.down && l.points - l.down.points >= 1) add("leader", "position", 70);
    } else if (l.rank <= 4 && toLeader >= 1) add("chasing", "position", 55);
    if (l.rank === l.size) add("lastPlace", "position", 90);
    else if (l.rank > l.size - 4) add("dropzone", "position", 65);
    else if (l.rank > 4) add("midtable", "position", 40);
    if (l.rank > 1 && l.up && l.up.points - l.points >= 1 && l.up.points - l.points <= NEAR_POINTS) add("looksUp", "position", 45);
    if (l.down && l.points - l.down.points >= 1 && l.points - l.down.points <= NEAR_POINTS) add("looksBack", "position", 45);
    if (l.moved >= 2) add("climber", "position", 50);
    if (l.moved <= -2) add("faller", "position", 55);
  }

  // the moment: what is still to play, what FPL has yet to confirm, the verdict, the next deadline
  const phase = i.phase;
  if (phase === "live") {
    if (c?.state === "waiting") add("captainWaiting", "phase", 70);
    if (i.remaining && i.remaining.count >= 3) add("stillToPlay", "phase", 50 + Math.min(i.remaining.effective * 3, 20));
  }
  if (phase === "provisional" && f.bonus >= 1) add("bonusPending", "phase", 65);
  if (phase === "final") add("finalVerdict", "phase", 40);
  const ahead = i.ahead;
  if (ahead && phase !== "live") {
    if (ahead.captain) add("nextCaptain", "phase", 70);
    if (ahead.fixture && ahead.fixture.difficulty >= 4) add("nextFixture", "phase", 55 + (ahead.fixture.difficulty - 4) * 10);
    if ((i.freeTransfers ?? 0) >= 1) add("nextTransfers", "phase", 50);
    const flag = nextFlagged(i);
    if (flag) add("nextFlag", "phase", flag.flag?.kind === "out" ? 70 : 55);
  }
  return out;
}
