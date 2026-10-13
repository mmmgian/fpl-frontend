"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
// Deep imports on purpose: the components/ui barrel also exports the server-side i18n, which pulls every language into the browser bundle.
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ClubLink } from "@/components/ui/ClubLink";
import { Crest } from "@/components/ui/Crest";
import { FdrChip } from "@/components/ui/FdrChip";
import { useIntlLocale, useT } from "@/components/ui/I18nProvider";
import { LocalTime } from "@/components/ui/LocalTime";
import { CLOCK, KICKOFF } from "@/components/ui/timeFormats";
// Deep imports on purpose: the domain barrel would pull every language into the browser bundle.
import type { FdrBand } from "@/lib/domain/fdr";
import { dateIn, LEAGUE_TIME_ZONE, regroupDays, scoreLine, type FeedGameweek, type FeedMatch } from "@/lib/domain/fixtureFeed";
import type { FeedTeamRef } from "@/lib/services/models";
import styles from "./fixtureFeed.module.css";

/** Gameweeks added each time the end (or the start) of the feed is reached. */
const STEP = 3;

interface FixtureFeedProps {
  gameweeks: FeedGameweek[];
  teams: Record<number, FeedTeamRef>;
  /** Index into `gameweeks` to open on. */
  startIndex: number;
}

const subscribe = () => () => {};
const readerZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || LEAGUE_TIME_ZONE;

/**
 * The reader's time zone, known only in the browser: null while rendering on the server and hydrating, so the first
 * paint matches the server's UK days exactly, then the days regroup under the reader's own dates.
 */
function useTimeZone() {
  return useSyncExternalStore(subscribe, readerZone, () => null);
}

/** A match that has kicked off: its score leads to the bonus page, and difficulty no longer matters. */
const played = (m: FeedMatch) => m.state === "live" || m.state === "provisional" || m.state === "finished";

function names(ids: number[], teams: Record<number, FeedTeamRef>) {
  return ids.map((id) => teams[id]?.short ?? "?").join(", ");
}

function Side({ team, band, align }: { team: FeedTeamRef | undefined; band: FdrBand | null; align: "home" | "away" }) {
  const t = useT();
  const label = team?.name ?? t.feed.unknownClub;
  const crest = <Crest code={team?.code} name={label} size={28} />;
  const text = (
    <span className={styles.sideText}>
      <span className={styles.short} aria-hidden="true">
        {team?.short ?? "?"}
      </span>
      <span className="sr-only">{label}</span>
      {band ? (
        <FdrChip band={band} label={t.fdr.difficulty(band)}>
          <span aria-hidden="true">{band}</span>
        </FdrChip>
      ) : null}
    </span>
  );
  const inner =
    align === "home" ? (
      <>
        {text}
        {crest}
      </>
    ) : (
      <>
        {crest}
        {text}
      </>
    );
  const cls = `${styles.side} ${align === "home" ? styles.home : styles.away}`;
  return team ? (
    <ClubLink name={team.name} className={cls}>
      {inner}
    </ClubLink>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

/** A started match's score, linked to that gameweek's bonus page when there is one. */
function Played({ m, gw, teams, children }: { m: FeedMatch; gw: number | null; teams: Record<number, FeedTeamRef>; children: ReactNode }) {
  const t = useT().feed;
  if (gw === null) return <span className={styles.middle}>{children}</span>;
  const name = (id: number) => teams[id]?.name ?? t.unknownClub;
  return (
    <Link href={`/bonus?gw=${gw}`} className={`${styles.middle} ${styles.scoreLink}`} prefetch={false}>
      {children}
      <span className="sr-only">, {t.bonusFor(name(m.home), name(m.away))}</span>
    </Link>
  );
}

function Middle({ m, gw, teams }: { m: FeedMatch; gw: number | null; teams: Record<number, FeedTeamRef> }) {
  const t = useT().feed;
  const score = scoreLine(m);
  switch (m.state) {
    case "live":
      return (
        <Played m={m} gw={gw} teams={teams}>
          <span className={styles.score}>{score ?? "0–0"}</span>
          <span className={`${styles.state} ${styles.stateLive}`}>{t.live}</span>
        </Played>
      );
    case "provisional":
      return (
        <Played m={m} gw={gw} teams={teams}>
          <span className={styles.score}>
            {score ?? "–"}
            <span className="sr-only"> {t.fullTime}</span>
          </span>
          <span className={styles.pending}>{t.provisional}</span>
        </Played>
      );
    case "finished":
      return (
        <Played m={m} gw={gw} teams={teams}>
          <span className={styles.score}>
            {score ?? "–"}
            <span className="sr-only"> {t.fullTime}</span>
          </span>
        </Played>
      );
    case "tbc":
      return (
        <span className={styles.middle}>
          <span className={styles.time}>{t.tbc}</span>
        </span>
      );
    default:
      return (
        <span className={styles.middle}>
          <span className={styles.time}>
            <LocalTime iso={m.kickoff} options={CLOCK} />
          </span>
        </span>
      );
  }
}

function Match({ m, gw, teams }: { m: FeedMatch; gw: number | null; teams: Record<number, FeedTeamRef> }) {
  const done = played(m);
  return (
    <li className={styles.match}>
      <Side team={teams[m.home]} band={done ? null : m.homeBand} align="home" />
      <Middle m={m} gw={gw} teams={teams} />
      <Side team={teams[m.away]} band={done ? null : m.awayBand} align="away" />
    </li>
  );
}

function Gameweek({ g, teams, timeZone }: { g: FeedGameweek; teams: Record<number, FeedTeamRef>; timeZone: string | null }) {
  const t = useT().feed;
  const days = useMemo(() => (timeZone && timeZone !== LEAGUE_TIME_ZONE ? regroupDays(g.days, timeZone) : g.days), [g.days, timeZone]);
  const today = timeZone ? dateIn(new Date(), timeZone) : null;
  const intl = useIntlLocale();
  const dayLabel = (date: string) => new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const id = `gw-${g.gw ?? "tbc"}`;
  return (
    <section className={styles.gameweek} aria-labelledby={`${id}-title`} id={id}>
      <header className={styles.gwHead}>
        <h2 className={styles.gwTitle} id={`${id}-title`}>
          {g.gw === null ? t.postponedHeading : t.gameweek(g.gw)}
        </h2>
        {g.status === "live" ? <Badge tone="live">{t.thisWeek}</Badge> : g.status === "finished" ? <Badge tone="positive">{t.played}</Badge> : null}
        {g.gw !== null && g.status !== "upcoming" ? (
          <Link href={`/bonus?gw=${g.gw}`} className={styles.bonusLink} prefetch={false}>
            {t.bonusLink}
          </Link>
        ) : null}
        {g.deadline ? (
          <span className={styles.deadline}>
            {t.deadline} <LocalTime iso={g.deadline} options={KICKOFF} />
          </span>
        ) : null}
      </header>
      {g.doubles.length || g.blanks.length ? (
        <p className={styles.flags}>
          {g.doubles.length ? (
            <span>
              <strong>{t.double}</strong> <span className={styles.flagTeams}>{names(g.doubles, teams)}</span>
            </span>
          ) : null}
          {g.blanks.length ? (
            <span>
              <strong>{t.blank}</strong> <span className={styles.flagTeams}>{names(g.blanks, teams)}</span>
            </span>
          ) : null}
        </p>
      ) : null}
      {days.map((day) => (
        <div key={day.date} className={styles.day}>
          <h3 className={styles.dayTitle}>
            <time dateTime={day.date === "tbc" ? undefined : day.date}>{day.date === "tbc" ? t.kickoffTbc : dayLabel(day.date)}</time>
            {today && day.date === today ? <Badge tone="accent">{t.today}</Badge> : null}
          </h3>
          <ul className={styles.matches}>
            {day.matches.map((m) => (
              <Match key={m.id} m={m} gw={g.gw} teams={teams} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * The whole season, opening on the current gameweek and growing as you scroll: three more gameweeks whenever the
 * end comes into view (a button does the same for anyone who can't or won't scroll), and a button to bring in
 * earlier ones. The server renders the opening gameweeks, so the page works before any script has loaded.
 */
export function FixtureFeed({ gameweeks, teams, startIndex }: FixtureFeedProps) {
  const t = useT().feed;
  const [from, setFrom] = useState(startIndex);
  const [to, setTo] = useState(Math.min(gameweeks.length, startIndex + STEP));
  const timeZone = useTimeZone();
  const sentinel = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; y: number } | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const refocus = useRef(false);

  const more = useCallback(() => setTo((t) => Math.min(gameweeks.length, t + STEP)), [gameweeks.length]);
  const earlier = () => {
    // When this was the last batch the button goes away; the focus it held goes to the next control, not the page.
    refocus.current = from - STEP <= 0;
    anchor.current = { height: document.documentElement.scrollHeight, y: window.scrollY };
    setFrom((f) => Math.max(0, f - STEP));
  };

  // Content added above the viewport pushes everything down; put the reader back where they were.
  useLayoutEffect(() => {
    if (!anchor.current) return;
    const { height, y } = anchor.current;
    anchor.current = null;
    window.scrollTo(0, y + (document.documentElement.scrollHeight - height));
  }, [from]);

  useEffect(() => {
    if (refocus.current && from === 0) {
      selectRef.current?.focus();
      refocus.current = false;
    }
  }, [from]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && more(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, to]); // re-observe after each load, so a sentinel that is still on screen asks again

  const jump = (index: number) => {
    setFrom(index);
    setTo(Math.min(gameweeks.length, index + STEP));
    top.current?.scrollIntoView({ block: "start" });
  };

  const shown = gameweeks.slice(from, to);
  return (
    <div className={styles.feed}>
      <div ref={top} className={styles.tools}>
        <label className={styles.jump}>
          <span>{t.jumpTo}</span>
          <select ref={selectRef} value={from} onChange={(e) => jump(Number(e.target.value))} className={styles.select}>
            {gameweeks.map((g, i) => (
              <option key={g.gw ?? "tbc"} value={i}>
                {g.gw === null ? t.postponed : t.gw(g.gw)}
              </option>
            ))}
          </select>
        </label>
        {from > 0 ? (
          <Button size="sm" onClick={earlier}>
            {t.earlier}
          </Button>
        ) : null}
        <p className={styles.zone}>{t.localTimes}</p>
      </div>

      <div className={styles.weeks}>
        {shown.map((g) => (
          <Gameweek key={g.gw ?? "tbc"} g={g} teams={teams} timeZone={timeZone} />
        ))}
      </div>

      <div ref={sentinel} className={styles.end}>
        {to < gameweeks.length ? (
          <Button onClick={more}>{t.showMore}</Button>
        ) : (
          <p className={styles.done}>{t.end}</p>
        )}
      </div>
    </div>
  );
}
