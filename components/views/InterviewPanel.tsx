import { Crest, getT, gameweekName } from "@/components/ui";
import { interviewSeed, pickInterview, type AnswerKind, type AskKind, type InterviewContext } from "@/lib/domain/interview";
import type { TeamGameweek, TeamIdentity, TeamSummary } from "@/lib/services/models";
import styles from "./interview.module.css";

const ASK_GLYPH: Record<AskKind, string> = { genius: "∑", dumb: "?", satirical: "“" };

/**
 * A made-up press conference with the manager's mascot: the press-room picture beside three questions (a clever one,
 * a daft one, a satirical one) and three answers (a genius's, a snark's, an egotist's) dealt out across them. Which
 * question gets which answer is fixed by the manager and the gameweek, so it reads the same on every visit.
 */
export function InterviewPanel({ team, gameweek, summary }: { team: TeamIdentity; gameweek: TeamGameweek; summary: TeamSummary }) {
  const t = getT().interview;
  const gw = gameweekName(gameweek.name);
  const ctx: InterviewContext = { team: team.teamName, first: team.firstName || team.manager, gw, points: summary.gwPoints, total: summary.total };
  const exchanges = pickInterview(interviewSeed(team.entryId, gameweek.gw));
  const press = team.mascot?.press;

  return (
    <section className={styles.panel} aria-labelledby="interview-heading">
      <header className={styles.head}>
        <h2 id="interview-heading" className={styles.title}>
          {t.heading}
        </h2>
        <p className={styles.lede}>{t.lede(ctx.first, gw)}</p>
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
          {exchanges.map((x) => {
            const topic = t.topics[x.topic];
            return (
              <li key={x.topic} className={styles.exchange}>
                <div className={styles.ask} data-ask={x.ask}>
                  <span className={styles.glyph} aria-hidden>
                    {ASK_GLYPH[x.ask]}
                  </span>
                  <div className={styles.line}>
                    <p className={styles.who}>
                      <strong>{t.askers[x.ask]}</strong>
                      <span>{t.askerRole[x.ask]}</span>
                    </p>
                    <p className={styles.bubble}>{topic.q(ctx)}</p>
                  </div>
                </div>
                <div className={styles.reply} data-answer={x.answer satisfies AnswerKind}>
                  <div className={styles.line}>
                    <p className={styles.who}>
                      <span className={styles.chip}>{t.answerers[x.answer]}</span>
                      <span>{t.answerBy(team.teamName)}</span>
                    </p>
                    <p className={styles.bubble}>{topic.a[x.answer](ctx)}</p>
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

      <p className={styles.note}>{t.note}</p>
    </section>
  );
}
