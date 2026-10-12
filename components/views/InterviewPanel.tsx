import { Crest, getFormat, getLocale, getT, gameweekName, isTrip } from "@/components/ui";
import {
  GENERIC_ANSWERS, candidatesOf, interviewContext, interviewSeed, pickInterview, pickTrip, tripContext, tripTips,
  type AnswerKind, type AskKind, type GenericAnswer, type InterviewTopic,
} from "@/lib/domain/interview";
import { INTL_LOCALE } from "@/lib/domain";
import type { TeamModel } from "@/lib/services/models";
import { interviewInputOf } from "./interviewInput";
import styles from "./interview.module.css";

type Ok = Extract<TeamModel, { kind: "ok" }>;

const ASK_GLYPH: Record<AskKind, string> = { genius: "∑", dumb: "?", satirical: "“" };
const TRIP_GLYPH = ["◉", "✺", "☾"];
const DAY_MS = 86_400_000;

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
 * A made-up press conference with the manager's mascot: the press-room picture beside five questions, each about
 * something that really happened to this team (blunders first, then its league position), put by journalists who say
 * the manager's and the team's names, and five answers in five different voices. While the gameweek is being played
 * the conference is redrawn each day; once it is over it is fixed.
 *
 * In the altered view (an easter egg) the mascot is the Upside Oracle instead, and every answer is a sneaky tip for
 * climbing the world leaderboard.
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
  const live = gameweek.status === "live";
  const day = live ? Math.floor(now.getTime() / DAY_MS) : 0;
  const seed = interviewSeed(team.entryId, gameweek.gw, day);
  const slot = team.league?.rank ?? team.entryId;
  const press = trip ? (team.mascot?.trip ?? team.mascot?.press) : team.mascot?.press;

  let items: Item[];
  if (trip) {
    const tt = t.trip;
    items = pickTrip(seed, tripTips(input, ctx.templateCount), t.openers.length).map((x, i) => {
      const c = tripContext(ctx, x.pick, fmt);
      const tip = tt.tips[x.tip];
      return {
        key: `${x.tip}-${i}`,
        glyph: TRIP_GLYPH[x.asker],
        askData: "trip",
        asker: tt.askers[x.asker],
        role: tt.askerRole,
        question: t.openers[x.opener](c, tip.q[x.q](c)),
        answerData: "trip",
        chip: tt.chip,
        reply: tip.a[x.a](c),
      };
    });
  } else {
    items = pickInterview(seed, candidatesOf(input), { slot, seed: interviewSeed(0, gameweek.gw, day) }).map((x, i) => {
      const topic: InterviewTopic = t.topics[x.topic];
      const ask = topic.q[x.ask] ?? Object.values(topic.q)[0]!;
      const generic = (GENERIC_ANSWERS as readonly string[]).includes(x.answer);
      return {
        key: `${x.topic}-${i}`,
        glyph: ASK_GLYPH[x.ask],
        askData: x.ask,
        asker: t.askers[x.ask],
        role: t.askerRole[x.ask],
        question: t.openers[x.opener](ctx, ask(ctx)),
        answerData: x.answer as AnswerKind,
        chip: t.answerers[x.answer],
        reply: generic ? t.voices[x.answer as GenericAnswer][x.line](ctx) : topic.a[x.answer as "genius" | "snarky" | "egotist"](ctx),
      };
    });
  }

  return (
    <section className={styles.panel} aria-labelledby="interview-heading" data-trip={trip ? "" : undefined}>
      <header className={styles.head}>
        <h2 id="interview-heading" className={styles.title}>
          {trip ? t.trip.heading : t.heading}
        </h2>
        <p className={styles.lede}>{trip ? t.trip.lede(ctx.manager, team.teamName, gw) : t.lede(ctx.manager, team.teamName, gw)}</p>
      </header>

      <div className={styles.body}>
        {press ? (
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, immutable local file whose shape is known */}
            <img className={styles.photo} src={press.src} width={press.width} height={press.height} alt={trip ? t.trip.pressAlt(team.teamName) : t.pressAlt(team.teamName)} loading="lazy" decoding="async" />
            <figcaption className={styles.caption}>
              <span className={styles.live} aria-hidden />
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

      {live ? <p className={styles.note}>{t.liveNote}</p> : gameweek.status === "final" ? <p className={styles.note}>{t.finalNote(gw)}</p> : null}
    </section>
  );
}
