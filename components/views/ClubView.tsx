import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, ClubLink, Crest, FdrChip, LocalTime, PageHeader, StateMessage } from "@/components/ui";
import { formatMoney, scoreLine, type ClubNewsItem, type PredictedPlayer, type PredictedXI, type Result } from "@/lib/domain";
import type { ClubMatchView, ClubModel, Outside } from "@/lib/services/models";
import styles from "./club.module.css";
import insights from "./insights.module.css";

type Ok = Extract<ClubModel, { kind: "ok" }>;

const RESULT_WORD: Record<Result, string> = { W: "Won", D: "Drew", L: "Lost" };
const when: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
const day: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };

function FormGuide({ form }: { form: Result[] }) {
  if (form.length === 0) return null;
  return (
    <span className={styles.guide} role="img" aria-label={`Last ${form.length}, oldest first: ${form.map((r) => RESULT_WORD[r]).join(", ")}`}>
      {form.map((r, i) => (
        <span key={i} className={`${styles.pip} ${styles[`pip${r}`]}`} aria-hidden="true">
          {r}
        </span>
      ))}
    </span>
  );
}

function Opponent({ m }: { m: ClubMatchView }) {
  return (
    <ClubLink id={m.opponent.id} name={m.opponent.name} className={styles.opponent}>
      <Crest code={m.opponent.code} name={m.opponent.name} size={26} />
      <span className={styles.oppName}>{m.opponent.name}</span>
    </ClubLink>
  );
}

function Fixtures({ title, matches, empty }: { title: string; matches: ClubMatchView[]; empty: string }) {
  return (
    <Card title={title} headingLevel={2}>
      {matches.length === 0 ? (
        <p className={insights.fact}>{empty}</p>
      ) : (
        <ul className={styles.list}>
          {matches.map((m) => (
            <li key={m.id} className={styles.row}>
              <span className={styles.when}>{m.gw ? `GW${m.gw}` : "TBC"}</span>
              <Opponent m={m} />
              <span className={styles.venue}>{m.home ? "Home" : "Away"}</span>
              <span className={m.result || m.state === "live" ? styles.end : `${styles.end} ${styles.endStack}`}>
                {m.result ? (
                  <>
                    <span className={`${styles.pip} ${styles[`pip${m.result}`]}`} aria-hidden="true">
                      {m.result}
                    </span>
                    <span className="sr-only">{RESULT_WORD[m.result]}, </span>
                    <strong>{m.scored}–{m.conceded}</strong>
                  </>
                ) : m.state === "live" ? (
                  <>
                    <Badge tone="live">Live</Badge> <strong>{scoreLine({ homeScore: m.scored, awayScore: m.conceded }) ?? "0–0"}</strong>
                  </>
                ) : (
                  <>
                    <span className={styles.kickoff}>
                      <LocalTime iso={m.kickoff} options={when} fallback="Time to be confirmed" />
                    </span>
                    <FdrChip band={m.band}>
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

const SEVERITY: Record<ClubNewsItem["severity"], { label: string; tone: "warning" | "live" | "neutral" }> = {
  out: { label: "Out", tone: "live" },
  doubt: { label: "Doubt", tone: "warning" },
  note: { label: "News", tone: "neutral" },
};

function TeamNews({ news }: { news: ClubNewsItem[] }) {
  return (
    <Card title="Team news" headingLevel={2} className={styles.wide}>
      {news.length === 0 ? (
        <p className={insights.fact}>A clean bill of health: FPL has no injuries, suspensions or doubts flagged for this squad.</p>
      ) : (
        <ul className={styles.list}>
          {news.map(({ player: p, severity }) => (
            <li key={p.id} className={styles.newsRow}>
              <Badge tone={SEVERITY[severity].tone}>{SEVERITY[severity].label}</Badge>
              <span className={styles.newsBody}>
                <strong>{p.name}</strong>
                <span className={styles.newsText}>{p.news || "Flagged by FPL, no details given."}</span>
              </span>
              <span className={styles.newsMeta}>
                {p.chance !== null ? <span>{p.chance}% to play</span> : null}
                {p.newsAdded ? (
                  <span>
                    Added <LocalTime iso={p.newsAdded} options={day} />
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
  return (
    <li className={styles.line}>
      <span className={styles.lineLabel}>{label}</span>
      <ul className={styles.players}>
        {players.map(({ player, startRate, doubt }) => (
          <li key={player.id} className={styles.player}>
            <strong>{player.name}</strong>
            {doubt ? <Badge tone="warning">Doubt</Badge> : null}
            <span className={styles.rate}>{Math.round(startRate * 100)}% of starts</span>
            <span className="sr-only">, {formatMoney(player.cost)}</span>
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open-${i}`} className={`${styles.player} ${styles.openPlace}`}>
            Open place
            <span className={styles.rate}>no fit regular starter</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function Lineup({ xi }: { xi: PredictedXI | null }) {
  return (
    <Card title="Predicted XI" headingLevel={2} className={styles.wide}>
      {xi ? (
        <>
          {xi.formation ? (
            <p className={styles.big}>
              {xi.formation}
              <span className={styles.bigNote}>likely shape</span>
            </p>
          ) : (
            <p className={styles.big}>
              Shape unclear<span className={styles.bigNote}>too few fit regulars to say</span>
            </p>
          )}
          {xi.missing > 0 ? (
            <p className={styles.gap}>
              {xi.fit < 11
                ? `Only ${xi.fit} fit ${xi.fit === 1 ? "player has" : "players have"} started this season, so ${xi.missing} ${xi.missing === 1 ? "place is" : "places are"} left open rather than filled with a guess.`
                : `The fit players who have started don't cover every position, so ${xi.missing} ${xi.missing === 1 ? "place is" : "places are"} left open rather than guessed.`}
            </p>
          ) : null}
          <ul className={styles.lines}>
            <LineRow label="Forwards" players={xi.forwards} open={xi.open.forwards} />
            <LineRow label="Midfield" players={xi.midfielders} open={xi.open.midfielders} />
            <LineRow label="Defence" players={xi.defenders} open={xi.open.defenders} />
            <LineRow label="Goalkeeper" players={[xi.goalkeeper]} />
          </ul>
          <p className={styles.caveat}>
            This is a prediction, not an official line-up. It is built from who FPL says is available and how often each player has started this season (the most-used player has started {xi.matches}
            {xi.matches === 1 ? " match" : " matches"})
            {xi.matches < 4 ? ", so it is early days: treat it loosely" : ""}. Managers rotate; the real team is only announced about an hour before kick-off.
          </p>
        </>
      ) : (
        <p className={insights.fact}>No prediction yet: it needs a few matches played and enough fit players to name most of a side.</p>
      )}
    </Card>
  );
}

function Outside<T>({ title, data, children }: { title: string; data: Outside<T>; children: (items: T) => ReactNode }) {
  if (data.status === "off") return null; // not set up: nothing to show, and nothing to apologise for
  return (
    <Card title={title} headingLevel={2} className={styles.wide}>
      {data.status === "ok" ? children(data.items) : <p className={insights.fact}>This is unavailable right now. The rest of the page is unaffected; try again in a few minutes.</p>}
    </Card>
  );
}

export function ClubView({ model }: { model: Ok }) {
  const { club, next } = model;
  const upcoming = next[0];
  return (
    <>
      <PageHeader
        back={<Link href="/fixtures">← Fixtures</Link>}
        eyebrow="Premier League club"
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
                Next: {upcoming.home ? "" : "at "}
                {upcoming.opponent.name}, <LocalTime iso={upcoming.kickoff} options={when} fallback="time to be confirmed" />
              </span>
            ) : (
              <span>No fixture scheduled</span>
            )}
          </>
        }
      />

      <div className={styles.cards}>
        <Fixtures title="Up next" matches={model.next} empty="Nothing scheduled: the fixture list has no more matches for this club." />
        <Fixtures title="Recent results" matches={model.recent} empty="No results yet this season." />
        <TeamNews news={model.news} />
        <Lineup xi={model.lineup} />

        <Outside title="In Europe" data={model.europe}>
          {(matches) =>
            matches.length === 0 ? (
              <p className={insights.fact}>No European fixtures coming up. (This source covers the Champions League; Europa League and Conference League games are not included.)</p>
            ) : (
              <ul className={styles.list}>
                {matches.map((m) => (
                  <li key={m.id} className={styles.euroRow}>
                    <span className={styles.comp}>{m.competition.replace(/^UEFA\s+/i, "")}</span>
                    <strong>
                      {m.home} v {m.away}
                    </strong>
                    <span className={styles.kickoff}>
                      <LocalTime iso={m.utcDate} options={when} fallback="Date to be confirmed" />
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </Outside>

        <Outside title="Headlines" data={model.headlines}>
          {({ items, creditUrl }) =>
            items.length === 0 ? (
              <p className={insights.fact}>Nothing new from BBC Sport for this club at the moment.</p>
            ) : (
              <>
                <ul className={styles.news}>
                  {items.map((h) => (
                    <li key={h.url}>
                      <a href={h.url} target="_blank" rel="noopener noreferrer" className={styles.headline}>
                        {h.title}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      {h.summary ? <p className={styles.summary}>{h.summary}</p> : null}
                      {h.publishedAt ? (
                        <p className={styles.published}>
                          <LocalTime iso={h.publishedAt} options={when} />
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className={styles.credit}>
                  From{" "}
                  <a href={creditUrl} target="_blank" rel="noopener noreferrer">
                    BBC Sport
                  </a>
                  , shown as the BBC publishes it.
                </p>
              </>
            )
          }
        </Outside>
      </div>

      {model.news.length === 0 && model.next.length === 0 && model.recent.length === 0 ? (
        <StateMessage title="Nothing to show yet">
          <p>FPL has no fixtures or news for this club yet.</p>
        </StateMessage>
      ) : null}
    </>
  );
}
