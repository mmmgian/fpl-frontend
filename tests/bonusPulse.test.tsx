/**
 * Bonus page between and after matches: the page refreshes on the match clock (not every minute of a quiet Tuesday),
 * says so when the week is paused, and only explains the labels its cards actually wear.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BonusView } from "@/components/views/BonusView";
import { FixtureBonusCard, sourceKey } from "@/components/views/FixtureBonusCard";
import { MESSAGES } from "@/lib/domain/i18n";
import { createBonusService } from "@/lib/services/bonus";
import { bootstrap, fixture } from "./fixtures";

const en = MESSAGES.en.bonus;
const load = async (fixtures: ReturnType<typeof fixture>[], iso: string) => {
  const model = await createBonusService({ bootstrap: async () => bootstrap, fixtures: async () => fixtures }, { now: () => new Date(iso) }).load(undefined);
  if (model.kind !== "ok") throw new Error("expected ok");
  return model;
};
const bonusStat = { identifier: "bonus", h: [{ element: 3, value: 3 }], a: [{ element: 4, value: 2 }] };
const played = (id: number) => fixture({ id, finished: true, finished_provisional: true, minutes: 90, stats: [...fixture().stats.filter((s) => s.identifier === "bps"), bonusStat] });
const later = (id: number, kickoff: string) => fixture({ id, started: false, kickoff_time: kickoff, team_h_score: null, team_a_score: null, minutes: 0, stats: [] });

describe("refresh on the match clock", () => {
  it("polls every minute while a match is on", async () => {
    const model = await load([fixture()], "2026-10-10T12:30:00Z");
    expect(model.pulse?.state).toBe("playing");
    expect(model.refreshMs).toBe(60_000);
  });

  it("sleeps until shortly before the next kick-off on a quiet day of a live week", async () => {
    const model = await load([played(1), later(2, "2026-10-12T19:00:00Z")], "2026-10-11T09:00:00Z");
    expect(model.gameweek.status).toBe("live");
    expect(model.pulse).toEqual({ state: "between", nextKickoff: "2026-10-12T19:00:00.000Z" });
    expect(model.refreshMs).toBe(15 * 60_000);
  });

  it("wakes two minutes before kick-off as it nears", async () => {
    const model = await load([played(1), later(2, "2026-10-12T19:00:00Z")], "2026-10-12T18:50:00Z");
    expect(model.refreshMs).toBe(8 * 60_000);
  });

  it("treats a match FPL still reports in play as playing, even past the usual length", async () => {
    const model = await load([fixture({ kickoff_time: "2026-10-10T08:00:00Z" })], "2026-10-10T13:00:00Z");
    expect(model.pulse?.state).toBe("playing");
    expect(model.refreshMs).toBe(60_000);
  });

  it("slows to five minutes once everything is played and FPL is checking", async () => {
    const model = await load([played(1)], "2026-10-12T09:00:00Z");
    expect(model.pulse?.state).toBe("over");
    expect(model.refreshMs).toBe(5 * 60_000);
  });

  it("never refreshes a confirmed week", async () => {
    const events = [{ ...bootstrap.events[0] }, { ...bootstrap.events[1], finished: true, data_checked: true }];
    const model = await createBonusService({ bootstrap: async () => ({ ...bootstrap, events }), fixtures: async () => [played(1)] }, { now: () => new Date("2026-10-13T09:00:00Z") }).load(undefined);
    if (model.kind !== "ok") throw new Error("expected ok");
    expect(model.gameweek.status).toBe("final");
    expect(model.refreshMs).toBeNull();
    expect(model.pulse).toBeNull();
  });
});

describe("the page between matches", () => {
  it("says the week is paused until the next kick-off instead of 'in play'", async () => {
    const model = await load([played(1), later(2, "2026-10-12T19:00:00Z")], "2026-10-11T09:00:00Z");
    const { container } = render(<BonusView model={model} />);
    expect(screen.getByText(en.paused)).toBeTruthy();
    expect(screen.queryByText(MESSAGES.en.status.live)).toBeNull();
    const lede = container.querySelector("p time");
    expect(lede?.getAttribute("dateTime")).toBe("2026-10-12T19:00:00.000Z");
    expect(container.textContent).not.toMatch(/in play|undefined|NaN|\uE000/);
  });

  it("reads as provisional once every match is played, even before FPL moves the week on", async () => {
    const model = await load([played(1)], "2026-10-12T09:00:00Z");
    render(<BonusView model={model} />);
    expect(screen.getByText(MESSAGES.en.status.provisional)).toBeTruthy();
    expect(screen.queryByText(en.paused)).toBeNull();
  });
});

describe("the legend", () => {
  it("lists only the labels on screen, once each, and no counts line", async () => {
    const model = await load([played(1), played(2)], "2026-10-12T09:00:00Z");
    const { container } = render(<BonusView model={model} />);
    expect(container.textContent).toContain(en.sources.confirmed.help);
    expect(container.textContent).not.toContain(en.sources.projected.help);
    expect(container.textContent).not.toContain(en.sources.provisional.help);
    expect(container.textContent?.split(en.sources.confirmed.help)).toHaveLength(2);
    expect(container.textContent).not.toMatch(new RegExp(`\\d+ ${en.toCome}`));
  });

  it("has no legend at all before kick-off", async () => {
    const model = await load([later(1, "2026-10-12T19:00:00Z")], "2026-10-10T09:00:00Z");
    const { container } = render(<BonusView model={model} />);
    for (const s of Object.values(en.sources)) expect(container.textContent).not.toContain(s.help);
  });
});

describe("projected bonus after full time", () => {
  it("uses the full-time wording, not 'as the match goes on'", async () => {
    const ft = fixture({ finished_provisional: true, minutes: 90 }); // no bonus stat yet: projected from final BPS
    const model = await load([ft], "2026-10-12T09:00:00Z");
    expect(model.fixtures[0].bonus.source).toBe("projected");
    expect(sourceKey("projected", model.fixtures[0].state)).toBe("projectedFt");
    const { container } = render(<FixtureBonusCard card={model.fixtures[0]} />);
    expect(container.querySelector(`[title="${en.sources.projectedFt.help}"]`)).toBeTruthy();
    expect(container.innerHTML).not.toContain(en.sources.projected.help);
  });

  it("keeps the live wording while the match is on", () => {
    expect(sourceKey("projected", "live")).toBe("projected");
    expect(sourceKey("confirmed", "final")).toBe("confirmed");
    expect(sourceKey("none", "upcoming")).toBeNull();
  });
});
