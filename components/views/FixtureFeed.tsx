"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge, Button, ClubLink, Crest, FdrChip, LocalTime } from "@/components/ui";
import { scoreLine, type FeedGameweek, type FeedMatch } from "@/lib/domain";
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
const ukToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's UK date, known only in the browser (null while rendering on the server, so there is no mismatch). */
function useToday() {
  return useSyncExternalStore(subscribe, () => ukToday.format(new Date()), () => null);
}

const clock: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const deadlineFmt: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };

function names(ids: number[], teams: Record<number, FeedTeamRef>) {
  return ids.map((id) => teams[id]?.short ?? "?").join(", ");
}

function Side({ team, band, align }: { team: FeedTeamRef | undefined; band: 1 | 2 | 3 | 4 | 5; align: "home" | "away" }) {
  const label = team?.name ?? "Unknown club";
  const crest = <Crest code={team?.code} name={label} size={28} />;
  const text = (
    <span className={styles.sideText}>
      <span className={styles.short} aria-hidden="true">
        {team?.short ?? "?"}
      </span>
      <span className="sr-only">{label}</span>
      <FdrChip band={band}>
        <span aria-hidden="true">{band}</span>
      </FdrChip>
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
    <ClubLink id={team.id} name={team.name} className={cls}>
      {inner}
    </ClubLink>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

function Middle({ m }: { m: FeedMatch }) {
  const score = scoreLine(m);
  switch (m.state) {
    case "live":
      return (
        <span className={styles.middle}>
          <span className={styles.score}>{score ?? "0–0"}</span>
          <Badge tone="live">Live</Badge>
        </span>
      );
    case "provisional":
      return (
        <span className={styles.middle}>
          <span className={styles.score}>{score ?? "–"}</span>
          <Badge tone="warning" title="Full time, but bonus points aren't confirmed yet">Provisional</Badge>
        </span>
      );
    case "finished":
      return (
        <span className={styles.middle}>
          <span className={styles.score}>{score ?? "–"}</span>
          <span className={styles.ft}>FT</span>
        </span>
      );
    case "tbc":
      return (
        <span className={styles.middle}>
          <span className={styles.time}>TBC</span>
        </span>
      );
    default:
      return (
        <span className={styles.middle}>
          <span className={styles.time}>
            <LocalTime iso={m.kickoff} options={clock} />
          </span>
        </span>
      );
  }
}

function Match({ m, teams }: { m: FeedMatch; teams: Record<number, FeedTeamRef> }) {
  return (
    <li className={styles.match}>
      <Side team={teams[m.home]} band={m.homeBand} align="home" />
      <Middle m={m} />
      <Side team={teams[m.away]} band={m.awayBand} align="away" />
    </li>
  );
}

function Gameweek({ g, teams, today }: { g: FeedGameweek; teams: Record<number, FeedTeamRef>; today: string | null }) {
  const id = `gw-${g.gw ?? "tbc"}`;
  return (
    <section className={styles.gameweek} aria-labelledby={`${id}-title`} id={id}>
      <header className={styles.gwHead}>
        <h2 className={styles.gwTitle} id={`${id}-title`}>
          {g.name}
        </h2>
        {g.status === "live" ? <Badge tone="live">This week</Badge> : g.status === "finished" ? <Badge tone="positive">Played</Badge> : null}
        {g.deadline ? (
          <span className={styles.deadline}>
            Deadline <LocalTime iso={g.deadline} options={deadlineFmt} />
          </span>
        ) : null}
      </header>
      {g.doubles.length || g.blanks.length ? (
        <p className={styles.flags}>
          {g.doubles.length ? (
            <span>
              <strong>Double gameweek</strong> <span className={styles.flagTeams}>{names(g.doubles, teams)}</span>
            </span>
          ) : null}
          {g.blanks.length ? (
            <span>
              <strong>Blank</strong> <span className={styles.flagTeams}>{names(g.blanks, teams)}</span>
            </span>
          ) : null}
        </p>
      ) : null}
      {g.days.map((day) => (
        <div key={day.date} className={styles.day}>
          <h3 className={styles.dayTitle}>
            <time dateTime={day.date === "tbc" ? undefined : day.date}>{day.label}</time>
            {today && day.date === today ? <Badge tone="accent">Today</Badge> : null}
          </h3>
          <ul className={styles.matches}>
            {day.matches.map((m) => (
              <Match key={m.id} m={m} teams={teams} />
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
  const [from, setFrom] = useState(startIndex);
  const [to, setTo] = useState(Math.min(gameweeks.length, startIndex + STEP));
  const today = useToday();
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
          <span>Jump to</span>
          <select ref={selectRef} value={from} onChange={(e) => jump(Number(e.target.value))} className={styles.select}>
            {gameweeks.map((g, i) => (
              <option key={g.gw ?? "tbc"} value={i}>
                {g.gw === null ? "Postponed" : `GW${g.gw}`}
              </option>
            ))}
          </select>
        </label>
        {from > 0 ? (
          <Button size="sm" onClick={earlier}>
            Earlier gameweeks
          </Button>
        ) : null}
      </div>

      {shown.map((g) => (
        <Gameweek key={g.gw ?? "tbc"} g={g} teams={teams} today={today} />
      ))}

      <div ref={sentinel} className={styles.end}>
        {to < gameweeks.length ? (
          <Button onClick={more}>Show more gameweeks</Button>
        ) : (
          <p className={styles.done}>That&apos;s the lot: the whole season, to the last whistle.</p>
        )}
      </div>
    </div>
  );
}
