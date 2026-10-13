import { Crest, getFormat, getLocale, getT, gameweekName, isTrip } from "@/components/ui";
import {
  GENERIC_ANSWERS, OPENERS, PHASE_OPENERS, TRIP_MOOD_OPENERS, TRIP_OPENERS, candidatesOf, interviewContext, interviewMood, interviewSeed, pickInterview, tripContext, tripTips,
  type AnswerKind, type AskKind, type GenericAnswer, type InterviewTopic,
} from "@/lib/domain/interview";
import { INTL_LOCALE, varietyKey } from "@/lib/domain";
import { pickTripConference } from "@/lib/domain/tripConference";
import type { TeamModel } from "@/lib/services/models";
import { interviewInputOf } from "./interviewInput";
import styles from "./interview.module.css";

type Ok = Extract<TeamModel, { kind: "ok" }>;

const ASK_GLYPH: Record<AskKind, string> = { genius: "∑", dumb: "?", satirical: "“" };
const TRIP_GLYPH = ["◉", "✺", "☾", "∞", "✧", "❂", "☄", "✦"];

/** One question and its answer, as the panel draws them. */
interface Item {
  key: string;
  glyph: string;
  askData: string;
  asker: string;
  role: string;
  question: string;
  answerData: string;
  chip: string;
  reply: string;
}

/**
 * A made-up press conference with the manager's mascot: the press-room picture beside seven questions, each about
 * something that really happened to this team (a headline first, the long view or what comes next last), put by
 * journalists who say the manager's and the team's names, and seven answers in seven different voices. It is redrawn
 * every UTC day, whatever the phase, and again the moment FPL moves the gameweek on (live -> provisional bonus ->
 * final once FPL has checked the data), so finalised scores always arrive with fresh questions. One question is about
 * the moment: what is still to play, the bonus FPL has yet to confirm, the verdict, or the next deadline.
 *
 * In the altered view (an easter egg) the mascot is the Upside Oracle instead: most answers are in strange voices, and
 * one to three are sneaky tips for climbing the world leaderboard.
 */
export function InterviewPanel({ model, now = new Date() }: { model: Ok; now?: Date }) {
  const t = getT().interview;
  const trip = isTrip();
  const { team, gameweek } = model;
  const locale = getLocale();
  const gw = gameweekName(gameweek.name);
  const input = interviewInputOf(model, getT(), getFormat().money, gw, (s) => s.toLocaleLowerCase(INTL_LOCALE[locale]));
  const f = getFormat();
  const fmt = { money: f.money, oneDecimal: f.oneDecimal, number: f.number };
  const ctx = interviewContext(input, fmt);
  const status = gameweek.status;
  const mood = interviewMood(status, input.ahead != null);
  const salt = varietyKey(gameweek.gw, status, now);
  const seed = interviewSeed(team.entryId, gameweek.gw, salt);
  const slot = team.league?.rank ?? team.entryId;
  const league = { slot, seed: interviewSeed(0, gameweek.gw, salt) };
  const press = trip ? (team.mascot?.trip ?? team.mascot?.press) : team.mascot?.press;

  let items: Item[];
  if (trip) {
    const tt = t.trip;
    const opener = (k: number) => (k < TRIP_OPENERS ? tt.openers[k] : tt.moodOpeners[mood][k - TRIP_OPENERS]);
    items = pickTripConference(seed, candidatesOf(input), tripTips(input, ctx.templateCount), league, TRIP_MOOD_OPENERS).map((x, i) => {
      if (x.kind === "tip") {
        const c = tripContext(ctx, x.subject, fmt);
        const tip = tt.tips[x.tip];
        return {
          key: `${x.tip}-${i}`,
          glyph: TRIP_GLYPH[x.asker],
          askData: "trip",
          asker: tt.askers[x.asker],
          role: tt.askerRoles[x.asker],
          question: opener(x.opener)(c, tip.q[x.q](c)),
          answerData: "trip",
          chip: tt.chip,
          reply: x.flourish >= 0 ? `${tip.a[x.a](c)} ${tt.flourishes[x.flourish]}` : tip.a[x.a](c),
        };
      }
      const topic: InterviewTopic = t.topics[x.topic];
      const ask = topic.q[x.ask] ?? Object.values(topic.q)[0]!;
      return {
        key: `${x.topic}-${i}`,
        glyph: TRIP_GLYPH[x.asker],
        askData: "trip",
        asker: tt.askers[x.asker],
        role: tt.askerRoles[x.asker],
        question: opener(x.opener)(ctx, ask(ctx)),
        answerData: x.voice,
        chip: tt.voiceNames[x.voice],
        reply: tt.voices[x.voice][x.line](ctx, tt.gist[x.topic](ctx)),
      };
    });
  } else {
    const opener = (k: number) => (k < OPENERS ? t.openers[k] : t.moodOpeners[mood][k - OPENERS]);
    items = pickInterview(seed, candidatesOf(input), league, undefined, PHASE_OPENERS).map((x, i) => {
      const topic: InterviewTopic = t.topics[x.topic];
      const ask = topic.q[x.ask] ?? Object.values(topic.q)[0]!;
      const generic = (GENERIC_ANSWERS as readonly string[]).includes(x.answer);
      const voice = x.answer as GenericAnswer;
      return {
        key: `${x.topic}-${i}`,
        glyph: ASK_GLYPH[x.ask],
        askData: x.ask,
        asker: t.askers[x.ask],
        role: t.askerRole[x.ask],
        question: opener(x.opener)(ctx, ask(ctx)),
        answerData: x.answer as AnswerKind,
        chip: t.answerers[x.answer],
        reply: !generic
          ? topic.a[x.answer as "genius" | "snarky" | "egotist"](ctx)
          : x.topical >= 0
            ? t.voicesOn[voice][x.topical](ctx, t.trip.gist[x.topic](ctx))
            : t.voices[voice][x.line](ctx),
      };
    });
  }

  // The final note looks ahead to the next deadline only when there is one, and only beside the latest gameweek.
  const latest = gameweek.gw === gameweek.max;
  const note =
    status === "live"
      ? t.liveNote
      : status === "provisional"
        ? t.provisionalNote(gw)
        : status === "final"
          ? gameweek.seasonOver
            ? t.seasonOverNote(gw)
            : latest
              ? t.finalNote(gw)
              : t.pastNote(gw)
          : null;

  return (
    <section className={styles.panel} aria-labelledby="interview-heading" data-trip={trip ? "" : undefined}>
      <header className={styles.head}>
        <h2 id="interview-heading" className={styles.title}>
          {trip ? t.trip.heading : t.heading}
        </h2>
        <p className={styles.lede}>{trip ? t.trip.lede(ctx.manager, team.teamName, gw, mood, ctx.nextGw) : t.lede(ctx.manager, team.teamName, gw, mood, ctx.nextGw)}</p>
      </header>

      <div className={styles.body}>
        {press ? (
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, immutable local file whose shape is known */}
            <img className={styles.photo} src={press.src} width={press.width} height={press.height} alt={trip ? t.trip.pressAlt(team.teamName) : t.pressAlt(team.teamName)} loading="lazy" decoding="async" />
            <figcaption className={styles.caption}>
              {/* "On air" only while the latest gameweek is being played; an old or settled week isn't live. */}
              {gameweek.isLive ? <span className={styles.live} aria-hidden /> : null}
              {gw}
            </figcaption>
          </figure>
        ) : null}

        <ol className={styles.transcript} aria-label={t.transcript}>
          {items.map((x) => (
            <li key={x.key} className={styles.exchange}>
              <div className={styles.ask} data-ask={x.askData}>
                <span className={styles.glyph} aria-hidden>
                  {x.glyph}
                </span>
                <div className={styles.line}>
                  <p className={styles.who}>
                    <strong>{x.asker}</strong>
                    <span>{x.role}</span>
                  </p>
                  <p className={styles.bubble}>{x.question}</p>
                </div>
              </div>
              <div className={styles.reply} data-answer={x.answerData}>
                <div className={styles.line}>
                  <p className={styles.who}>
                    <span className={styles.chip}>{x.chip}</span>
                    <span>{t.answerBy(team.teamName)}</span>
                  </p>
                  <p className={styles.bubble}>{x.reply}</p>
                </div>
                <span className={styles.mascot}>
                  <Crest src={team.avatar} name={team.teamName} size={40} />
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {note ? <p className={styles.note}>{note}</p> : null}
    </section>
  );
}
