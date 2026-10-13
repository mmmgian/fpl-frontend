import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, ClubLink, Crest, English, FdrChip, LocalTime, PageHeader, StateMessage, getFormat, getIntlLocale, getT } from "@/components/ui";
import { dash, pickVariant, scoreLine, type ClubNewsItem, type PredictedPlayer, type PredictedXI, type Result } from "@/lib/domain";
import type { ClubMatchView, ClubModel, Outside } from "@/lib/services/models";
import styles from "./club.module.css";
import insights from "./insights.module.css";

type Ok = Extract<ClubModel, { kind: "ok" }>;

const when: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
const day: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

function FormGuide({ form }: { form: Result[] }) {
  const t = getT().club;
  if (form.length === 0) return null;
  return (
    <span className={styles.guide} role="img" aria-label={t.form(form.length, form.map((r) => t.result[r]).join(", "))}>
      {form.map((r, i) => (
        <span key={i} className={`${styles.pip} ${styles[`pip${r}`]}`} aria-hidden="true">
          {t.pip[r]}
        </span>
      ))}
    </span>
  );
}

function Opponent({ m }: { m: ClubMatchView }) {
  if (m.opponent.unknown) {
    // No club page exists for a club FPL doesn't list: plain text, in the page's language.
    return <span className={`${styles.opponent} ${styles.oppName}`}>{getT().common.unknownClub}</span>;
  }
  return (
    <ClubLink name={m.opponent.name} className={styles.opponent}>
      <Crest code={m.opponent.code} name={m.opponent.name} size={26} />
      <span className={styles.oppName}>{m.opponent.name}</span>
    </ClubLink>
  );
}

function Fixtures({ title, matches, empty }: { title: string; matches: ClubMatchView[]; empty: string }) {
  const t = getT();
  const c = t.club;
  return (
    <Card title={title} headingLevel={2}>
      {matches.length === 0 ? (
        <p className={insights.fact}>{empty}</p>
      ) : (
        <ul className={styles.list}>
          {matches.map((m) => (
            <li key={m.id} className={styles.row}>
              <span className={styles.when}>{c.gw(m.gw, t.common.gw(m.gw ?? 0))}</span>
              <Opponent m={m} />
              <span className={styles.venue}>{m.home ? t.common.home : t.common.away}</span>
              <span className={m.result || m.state === "live" ? styles.end : `${styles.end} ${styles.endStack}`}>
                {m.result ? (
                  <>
                    <span className={`${styles.pip} ${styles[`pip${m.result}`]}`} aria-hidden="true">
                      {c.pip[m.result]}
                    </span>
                    <span className="sr-only">{c.result[m.result]}, </span>
                    <strong>{m.scored}–{m.conceded}</strong>
                  </>
                ) : m.state === "live" ? (
                  <>
                    <Badge tone="live">{t.common.live}</Badge> <strong>{scoreLine({ homeScore: m.scored, awayScore: m.conceded }) ?? "0–0"}</strong>
                  </>
                ) : (
                  <>
                    <span className={styles.kickoff}>
                      <LocalTime iso={m.kickoff} options={when} fallback={t.common.timeTbc} />
                    </span>
                    <FdrChip band={m.band} label={t.client.fdr.difficulty(m.band)}>
                      <span aria-hidden="true">{m.band}</span>
                    </FdrChip>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const SEVERITY_TONE: Record<ClubNewsItem["severity"], "warning" | "live" | "neutral"> = { out: "live", doubt: "warning", note: "neutral" };

function TeamNews({ news, club, variety }: { news: ClubNewsItem[]; club: Ok["club"]; variety: number }) {
  const c = getT().club;
  return (
    <Card title={c.news} headingLevel={2} className={styles.wide}>
      {news.length === 0 ? (
        <p className={insights.fact}>{pickVariant(c.newsEmpty, variety, club.id)(club.name)}</p>
      ) : (
        <ul className={styles.list}>
          {news.map(({ player: p, severity }) => (
            <li key={p.id} className={styles.newsRow}>
              <Badge tone={SEVERITY_TONE[severity]}>{c.severity[severity]}</Badge>
              <span className={styles.newsBody}>
                <strong>{p.name}</strong>
                <span className={styles.newsText}>{p.news ? <English>{dash(p.news)}</English> : c.newsNoDetail}</span>
              </span>
              <span className={styles.newsMeta}>
                {p.chance !== null ? <span>{c.chance(p.chance)}</span> : null}
                {p.newsAdded ? (
                  <span>
                    {c.added}<LocalTime iso={p.newsAdded} options={day} />
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LineRow({ label, players, open = 0 }: { label: string; players: PredictedPlayer[]; open?: number }) {
  const c = getT().club;
  const f = getFormat();
  return (
    <li className={styles.line}>
      <span className={styles.lineLabel}>{label}</span>
      <ul className={styles.players}>
        {players.map(({ player, startRate, doubt }) => (
          <li key={player.id} className={styles.player}>
            <strong>{player.name}</strong>
            {doubt ? <Badge tone="warning">{c.doubt}</Badge> : null}
            <span className={styles.rate}>{c.starts(Math.round(startRate * 100))}</span>
            <span className="sr-only">, {f.money(player.cost)}</span>
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open-${i}`} className={`${styles.player} ${styles.openPlace}`}>
            {c.openPlace}
            <span className={styles.rate}>{c.noRegular}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Lineup({ xi }: { xi: PredictedXI | null }) {
  const c = getT().club;
  return (
    <Card title={c.xi} headingLevel={2} className={styles.wide}>
      {xi ? (
        <>
          {xi.formation ? (
            <p className={styles.big}>
              {xi.formation}
              <span className={styles.bigNote}>{c.shape}</span>
            </p>
          ) : (
            <p className={styles.big}>
              {c.shapeUnclear}<span className={styles.bigNote}>{c.shapeUnclearNote}</span>
            </p>
          )}
          {xi.missing > 0 ? (
            <p className={styles.gap}>
              {xi.fit < 11 ? c.fewFit(xi.fit, xi.missing) : c.notCovered(xi.missing)}
            </p>
          ) : null}
          <ul className={styles.lines}>
            <LineRow label={c.lines.forwards} players={xi.forwards} open={xi.open.forwards} />
            <LineRow label={c.lines.midfield} players={xi.midfielders} open={xi.open.midfielders} />
            <LineRow label={c.lines.defence} players={xi.defenders} open={xi.open.defenders} />
            <LineRow label={c.lines.goalkeeper} players={[xi.goalkeeper]} />
          </ul>
          <p className={styles.caveat}>{c.caveat(xi.matches, xi.matches < 4)}</p>
        </>
      ) : (
        <p className={insights.fact}>{c.xiEmpty}</p>
      )}
    </Card>
  );
}

function Outside<T>({ title, data, children }: { title: string; data: Outside<T>; children: (items: T) => ReactNode }) {
  if (data.status === "off") return null; // not set up: nothing to show, and nothing to apologise for
  const c = getT().club;
  return (
    <Card title={title} headingLevel={2} className={styles.wide}>
      {data.status === "ok" ? children(data.items) : <p className={insights.fact}>{c.unavailable}</p>}
    </Card>
  );
}

/**
 * The opening lines: form, the run ahead, the top FPL scorer and who is missing, each in a wording drawn for this club
 * and this day (and redrawn when the gameweek moves on). Only the facts the model has make it in.
 */
function outlookLines(model: Ok): string[] {
  const c = getT().club;
  const fmt = getFormat();
  const { club, outlook: o, variety } = model;
  const slot = club.id * 8;
  const lines: string[] = [];
  if (o.form) lines.push(pickVariant(c.formLine[o.form.mood], variety, slot)(club.name, o.form.wins, o.form.draws, o.form.losses, o.form.played));
  if (o.run) lines.push(pickVariant(c.runLine[o.run.mood], variety, slot + 1)(club.name, fmt.oneDecimal(o.run.average), o.run.matches));
  if (o.star) {
    const owned = o.star.ownership !== null ? getT().common.percent(fmt.oneDecimal(o.star.ownership)) : null;
    lines.push(pickVariant(c.starLine, variety, slot + 2)(o.star.name, o.star.points, owned));
  }
  if (o.out.length) lines.push(pickVariant(c.outLine, variety, slot + 3)(new Intl.ListFormat(getIntlLocale(), { type: "conjunction" }).format(o.out), o.out.length, o.doubts));
  else if (o.doubts) lines.push(pickVariant(c.doubtLine, variety, slot + 3)(o.doubts));
  return lines;
}

export function ClubView({ model }: { model: Ok }) {
  const t = getT();
  const c = t.club;
  const { club, next } = model;
  const upcoming = next[0];
  const lines = outlookLines(model);
  return (
    <>
      <PageHeader
        back={<Link href="/fixtures">{t.common.fixturesBack}</Link>}
        eyebrow={c.eyebrow}
        title={
          <span className={styles.title}>
            <Crest code={club.code} name={club.name} size={44} />
            {club.name}
          </span>
        }
        meta={
          <>
            <FormGuide form={model.form} />
            {upcoming ? (
              <span>
                {c.next(upcoming.home, upcoming.opponent.unknown ? t.common.unknownClub : upcoming.opponent.name)}
                <LocalTime iso={upcoming.kickoff} options={when} fallback={t.common.timeTbc.toLowerCase()} />
              </span>
            ) : (
              <span>{c.noFixture}</span>
            )}
          </>
        }
      />

      {lines.length ? <p className={styles.lede}>{lines.join(" ")}</p> : null}

      <div className={styles.cards}>
        <Fixtures title={c.upNext} matches={model.next} empty={c.upNextEmpty} />
        <Fixtures title={c.recent} matches={model.recent} empty={c.recentEmpty} />
        <TeamNews news={model.news} club={club} variety={model.variety} />
        <Lineup xi={model.lineup} />

        <Outside title={c.europe} data={model.europe}>
          {(matches) =>
            matches.length === 0 ? (
              <p className={insights.fact}>{c.europeEmpty}</p>
            ) : (
              <ul className={styles.list}>
                {matches.map((m) => (
                  <li key={m.id} className={styles.euroRow}>
                    <span className={styles.comp}>{m.competition.replace(/^UEFA\s+/i, "")}</span>
                    <strong>
                      {m.home} {getT().common.vs} {m.away}
                    </strong>
                    <span className={styles.kickoff}>
                      <LocalTime iso={m.utcDate} options={when} fallback={c.dateTbc} />
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </Outside>

        <Outside title={c.headlines} data={model.headlines}>
          {({ items, creditUrl }) =>
            items.length === 0 ? (
              <p className={insights.fact}>{c.headlinesEmpty}</p>
            ) : (
              <>
                <ul className={styles.news}>
                  {items.map((h) => (
                    <li key={h.url}>
                      <a href={h.url} target="_blank" rel="noopener noreferrer" className={styles.headline}>
                        <English>{h.title}</English>
                        <span className="sr-only"> {t.common.opensNewTab}</span>
                      </a>
                      {h.summary ? (
                        <p className={styles.summary}>
                          <English>{h.summary}</English>
                        </p>
                      ) : null}
                      {h.publishedAt ? (
                        <p className={styles.published}>
                          <LocalTime iso={h.publishedAt} options={when} />
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className={styles.credit}>
                  {c.creditBefore}
                  <a href={creditUrl} target="_blank" rel="noopener noreferrer">
                    {c.creditLink}
                  </a>
                  {c.creditAfter}
                </p>
              </>
            )
          }
        </Outside>
      </div>

      {model.news.length === 0 && model.next.length === 0 && model.recent.length === 0 ? (
        <StateMessage title={c.nothing}>
          <p>{c.nothingBody}</p>
        </StateMessage>
      ) : null}
    </>
  );
}
