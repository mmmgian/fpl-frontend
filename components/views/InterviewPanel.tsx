import { Crest, getFormat, getLocale, getT, gameweekName } from "@/components/ui";
import {
  GENERIC_ANSWERS, candidatesOf, interviewContext, interviewSeed, pickInterview,
  type AskKind, type GenericAnswer, type InterviewTopic,
} from "@/lib/domain/interview";
import { INTL_LOCALE } from "@/lib/domain";
import type { TeamModel } from "@/lib/services/models";
import { interviewInputOf } from "./interviewInput";
import styles from "./interview.module.css";

type Ok = Extract<TeamModel, { kind: "ok" }>;

const ASK_GLYPH: Record<AskKind, string> = { genius: "∑", dumb: "?", satirical: "“" };
const DAY_MS = 86_400_000;

/**
 * A made-up press conference with the manager's mascot: the press-room picture beside five questions, each about
 * something that really happened to this team (blunders first, then its league position), put by journalists who say
 * the manager's and the team's names, and five answers in five different voices. While the gameweek is being played
 * the conference is redrawn each day; once it is over it is fixed.
 */
export function InterviewPanel({ model, now = new Date() }: { model: Ok; now?: Date }) {
  const t = getT().interview;
  const { team, gameweek } = model;
  const locale = getLocale();
  const gw = gameweekName(gameweek.name);
  const input = interviewInputOf(model, getT(), getFormat().money, gw, (s) => s.toLocaleLowerCase(INTL_LOCALE[locale]));
  const f = getFormat();
  const ctx = interviewContext(input, { money: f.money, oneDecimal: f.oneDecimal, number: f.number });
  const live = gameweek.status === "live";
  const day = live ? Math.floor(now.getTime() / DAY_MS) : 0;
  const exchanges = pickInterview(interviewSeed(team.entryId, gameweek.gw, day), candidatesOf(input), {
    slot: team.league?.rank ?? team.entryId,
    seed: interviewSeed(0, gameweek.gw, day),
  });
  const press = team.mascot?.press;

  return (
    <section className={styles.panel} aria-labelledby="interview-heading">
      <header className={styles.head}>
        <h2 id="interview-heading" className={styles.title}>
          {t.heading}
        </h2>
        <p className={styles.lede}>{t.lede(ctx.manager, team.teamName, gw)}</p>
      </header>

      <div className={styles.body}>
        {press ? (
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, immutable local file whose shape is known */}
            <img className={styles.photo} src={press.src} width={press.width} height={press.height} alt={t.pressAlt(team.teamName)} loading="lazy" decoding="async" />
            <figcaption className={styles.caption}>
              <span className={styles.live} aria-hidden />
              {gw}
            </figcaption>
          </figure>
        ) : null}

        <ol className={styles.transcript} aria-label={t.transcript}>
          {exchanges.map((x, i) => {
            const topic: InterviewTopic = t.topics[x.topic];
            const ask = topic.q[x.ask] ?? Object.values(topic.q)[0]!;
            const generic = (GENERIC_ANSWERS as readonly string[]).includes(x.answer);
            const reply = generic ? t.voices[x.answer as GenericAnswer][x.line](ctx) : topic.a[x.answer as "genius" | "snarky" | "egotist"](ctx);
            return (
              <li key={`${x.topic}-${i}`} className={styles.exchange}>
                <div className={styles.ask} data-ask={x.ask}>
                  <span className={styles.glyph} aria-hidden>
                    {ASK_GLYPH[x.ask]}
                  </span>
                  <div className={styles.line}>
                    <p className={styles.who}>
                      <strong>{t.askers[x.ask]}</strong>
                      <span>{t.askerRole[x.ask]}</span>
                    </p>
                    <p className={styles.bubble}>{t.openers[x.opener](ctx, ask(ctx))}</p>
                  </div>
                </div>
                <div className={styles.reply} data-answer={x.answer}>
                  <div className={styles.line}>
                    <p className={styles.who}>
                      <span className={styles.chip}>{t.answerers[x.answer]}</span>
                      <span>{t.answerBy(team.teamName)}</span>
                    </p>
                    <p className={styles.bubble}>{reply}</p>
                  </div>
                  <span className={styles.mascot}>
                    <Crest src={team.avatar} name={team.teamName} size={40} />
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {live ? <p className={styles.note}>{t.liveNote}</p> : gameweek.status === "final" ? <p className={styles.note}>{t.finalNote(gw)}</p> : null}
    </section>
  );
}
