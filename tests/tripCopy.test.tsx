import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getT } from "@/components/ui";
import { I18nProvider, useT } from "@/components/ui/I18nProvider";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { MESSAGES, messagesFor, tripMessagesFor } from "@/lib/domain/i18n";
import { CLIENT_MESSAGES } from "@/lib/domain/i18n/client";
import { CLIENT_TRIP } from "@/lib/domain/i18n/client/trip";
import { TRIP_OVERLAYS, overlay } from "@/lib/domain/i18n/trip";
import { LOCALES } from "@/lib/domain/i18n/locales";

afterEach(() => setRequestTrip(false));

/** Every leaf of `over` must exist in `base` with the same kind, and functions must take the same arguments. */
function sameShape(over: unknown, base: unknown, path: string, problems: string[]) {
  if (typeof over === "function") {
    if (typeof base !== "function") problems.push(`${path}: not a function in the regular catalog`);
    else if (over.length !== base.length) problems.push(`${path}: ${over.length} arguments, regular has ${base.length}`);
    return;
  }
  if (typeof over === "object" && over !== null) {
    if (typeof base !== "object" || base === null) return void problems.push(`${path}: no such section`);
    for (const [k, v] of Object.entries(over)) sameShape(v, (base as Record<string, unknown>)[k], `${path}.${k}`, problems);
    return;
  }
  if (typeof over !== typeof base) problems.push(`${path}: ${typeof over}, regular is ${typeof base}`);
}

describe("the altered view's catalogs", () => {
  it("only replace strings that exist, with functions that take the same arguments", () => {
    for (const locale of LOCALES) {
      const problems: string[] = [];
      sameShape(TRIP_OVERLAYS[locale], MESSAGES[locale], locale, problems);
      sameShape(CLIENT_TRIP[locale], CLIENT_MESSAGES[locale], `${locale}.client`, problems);
      expect(problems).toEqual([]);
    }
  });
  it("cover the same strings in every language", () => {
    const keys = (o: object, p = ""): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" && v !== null ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    const en = keys(TRIP_OVERLAYS.en).sort();
    expect(keys(TRIP_OVERLAYS.es).sort()).toEqual(en);
    expect(keys(TRIP_OVERLAYS.fr).sort()).toEqual(en);
    expect(keys(CLIENT_TRIP.es).sort()).toEqual(keys(CLIENT_TRIP.en).sort());
    expect(keys(CLIENT_TRIP.fr).sort()).toEqual(keys(CLIENT_TRIP.en).sort());
  });
  it("say something different from the regular words for most of what they replace", () => {
    for (const locale of LOCALES) {
      const t = tripMessagesFor(locale);
      const r = messagesFor(locale);
      expect(t.league.leader).not.toBe(r.league.leader);
      expect(t.tools.heading).not.toBe(r.tools.heading);
      expect(t.sheet.startingXi).not.toBe(r.sheet.startingXi);
      expect(t.common.gw(5)).toBe(r.common.gw(5)); // units stay put
      expect(t.interview).toBe(r.interview); // the press conference has its own altered voices
    }
  });
  it("keep every figure", () => {
    for (const locale of LOCALES) {
      const t = tripMessagesFor(locale);
      expect(t.movement.up(3)).toContain("3");
      expect(t.team.notStartedTitle("Alpha", 7)).toMatch(/Alpha.*7/);
      expect(t.matchday.somePlayed(4, 11, 7)).toMatch(/4[\s\S]*11[\s\S]*7|7[\s\S]*4[\s\S]*11/);
      expect(t.season.averagingAfter("GW6", "GW2", 94, "GW1", 51)).toMatch(/94[\s\S]*51/);
      expect(t.tools.prices.showing(5, 9)).toMatch(/5[\s\S]*9/);
      expect(t.bonus.finishedOf(3, 10)).toMatch(/3[\s\S]*10/);
      expect(t.fixtures.gridIntro(7, 12)).toMatch(/7[\s\S]*12/);
    }
  });
  it("lay sections over each other without touching the originals", () => {
    const base = { a: { b: "x", c: "y" }, d: "z" };
    expect(overlay(base, { a: { b: "X" } })).toEqual({ a: { b: "X", c: "y" }, d: "z" });
    expect(base.a.b).toBe("x");
  });
  it("is what getT returns, only in the altered view", () => {
    expect(getT().league.leader).toBe("Leader");
    setRequestTrip(true);
    expect(getT().league.leader).toBe("The Sun");
    expect(getT().table.zones.good).toBe("Ascending");
  });
});

describe("client strings in the altered view", () => {
  function Nav() {
    const t = useT();
    return <p>{[t.nav.table, t.nav.tools, t.nav.times, t.deadline.title, t.language.label].join(" | ")}</p>;
  }
  it("swap in through the provider and keep the rest", () => {
    render(<I18nProvider locale="en" trip><Nav /></I18nProvider>);
    expect(screen.getByText("Cosmos | Lab | Tides | The next portal closes in | Language")).toBeInTheDocument();
  });
  it("stay regular without it", () => {
    render(<I18nProvider locale="en"><Nav /></I18nProvider>);
    expect(screen.getByText("Table | Tools | The Times | Next deadline | Language")).toBeInTheDocument();
  });
  it("keep the header's nav labels no longer than the regular ones allow", () => {
    for (const locale of LOCALES) {
      const longest = Math.max(...Object.values(CLIENT_MESSAGES[locale].nav).slice(1, 6).map((s) => s.length));
      for (const k of ["table", "tools", "bonus", "fixtures", "times"] as const) expect(CLIENT_TRIP[locale].nav![k]!.length, `${locale} ${k}`).toBeLessThanOrEqual(longest);
    }
  });
});
