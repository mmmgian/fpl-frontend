/**
 * The Tools page streams: it paints with the cheap tools (bootstrap, schedule, standings) and the league fan-out
 * (effective ownership and the league tools) fills in behind <Suspense>. These pin the split service, the view's
 * slots, the placeholders and the page's slot wiring.
 */
import { render, screen, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toolsSlots } from "@/app/tools/Deferred";
import { setRequestLocale } from "@/components/ui/i18n";
import { setRequestTrip } from "@/components/ui/tripSlot";
import { ToolsEoCard, ToolsEoPending, ToolsInjuries, ToolsInjuriesNav, ToolsLeagueNav, ToolsLeaguePending, ToolsLeagueSections, ToolsView, type ToolsDeferredSlots } from "@/components/views/ToolsView";
import { MESSAGES, tripMessagesFor } from "@/lib/domain/i18n";
import type { Bootstrap, EntryHistory, EntryPicks } from "@/lib/domain/types";
import type { ToolsModel } from "@/lib/services/models";
import type { FplPort } from "@/lib/services/ports";
import { STATS_DEADLINE_MS } from "@/lib/services/shared";
import { createToolsService, type ToolsQuery, type ToolsStream } from "@/lib/services/tools";
import { expectNoAxeViolations } from "./axe";
import { testLanguage } from "./language";
import { fakeFpl } from "./support";
import { NOW, bootstrap as world, league, picksFor, schedule } from "./toolsWorld";

afterEach(() => vi.useRealTimers());

const CHIPS = ["wildcard", "freehit", "bboost", "3xc"].flatMap((name) => [
  { name, start_event: 1, stop_event: 19 },
  { name, start_event: 20, stop_event: 38 },
]);
const bs: Bootstrap = { ...world, chips: CHIPS };
const historyOf = async (e: number): Promise<EntryHistory> => ({ current: [], past: [], chips: e === 100 ? [{ name: "wildcard", event: 2 }] : [] });
const hang = <T,>() => new Promise<T>(() => {});

const ports = (over: Partial<FplPort> = {}, managers = 12) =>
  fakeFpl({ bootstrap: async () => bs, standings: async () => league(managers), allFixtures: async () => schedule, picks: async (e: number) => picksFor(e), history: historyOf, ...over });
const service = (over: Partial<FplPort> = {}, managers = 12) => createToolsService(ports(over, managers), { now: () => NOW });

type Ok = Extract<ToolsModel, { kind: "ok" }>;
const ok = (m: ToolsModel): Ok => {
  if (m.kind !== "ok") throw new Error("expected ok");
  return m;
};
/** Whether a promise has settled after the microtasks queued so far have run. */
async function settled(p: Promise<unknown>): Promise<boolean> {
  let done = false;
  void p.then(() => (done = true));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return done;
}

describe("tools service: loadStreaming", () => {
  it("hands over the cheap part without waiting for squads or histories that never come", async () => {
    vi.useFakeTimers();
    const s = await service({ picks: hang, history: hang }).loadStreaming(1, {});
    const m = ok(s.model);
    expect(m.eo).toBeNull();
    expect(m.leagueTools).toBeNull();
    expect(m.xi?.gw).toBe(7);
    expect(m.prices.rows.length).toBeGreaterThan(0);
    expect(m.teams).toHaveLength(12);
    expect(m.deadline?.gw).toBe(7);
    // the league fan-out is still waiting, and gives up at the page's deadline for extras, resolving rather than rejecting
    expect(await settled(s.deferred)).toBe(false);
    await vi.advanceTimersByTimeAsync(STATS_DEADLINE_MS - 1);
    expect(await settled(s.deferred)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const late = await s.deferred;
    expect(late.eo).toBeNull();
    expect(late.leagueTools?.squads ?? 0).toBe(0);
  });

  it("load is exactly the cheap part with the league-dependent parts merged in", async () => {
    const queries: ToolsQuery[] = [{}, { eo: "top10" }, { eo: "all", by: "captain" }, { vs: "100,101", q: "player", pos: "2" }, { vs: "garbage", eo: "bogus" }];
    for (const q of queries) {
      const s = await service().loadStreaming(1, q);
      const full = await service().load(1, q);
      expect({ ...s.model, ...(await s.deferred) }, JSON.stringify(q)).toEqual(full);
      expect(ok(full).eo, JSON.stringify(q)).not.toBeNull();
      expect(ok(full).leagueTools, JSON.stringify(q)).not.toBeNull();
    }
  });

  it("the league-dependent parts never reject, whether FPL fails, hangs or sends nonsense", async () => {
    const boom = async () => {
      throw new Error("down");
    };
    for (const over of [{ picks: boom, history: boom }, { picks: async () => "nonsense" as unknown as EntryPicks, history: async () => 42 as unknown as EntryHistory }]) {
      const s = await service(over).loadStreaming(1, {});
      await expect(s.deferred).resolves.toMatchObject({ eo: null });
    }
    // no league at all: nothing to wait for
    const none = await service({ standings: boom }).loadStreaming(1, {});
    await expect(none.deferred).resolves.toEqual({ eo: null, leagueTools: null });
  });

  it("leaves no unhandled rejection behind when nobody awaits the league-dependent parts", async () => {
    const seen: unknown[] = [];
    const listener = (e: unknown) => seen.push(e);
    process.on("unhandledRejection", listener);
    try {
      const boom = vi.fn(async () => {
        throw new Error("down");
      });
      await service({ picks: boom, history: boom }).loadStreaming(1, {}); // deferred dropped on the floor
      await new Promise((r) => setTimeout(r, 20));
      expect(boom).toHaveBeenCalled();
      expect(seen).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
    }
  });

  it("asks for each manager's squad exactly once, shared by effective ownership and the league tools", async () => {
    for (const eo of ["top4", "top10", "all"]) {
      const picks = vi.fn(async (e: number) => picksFor(e));
      const history = vi.fn(historyOf);
      const s = await service({ picks, history }).loadStreaming(1, { eo });
      await s.deferred;
      expect(picks, eo).toHaveBeenCalledTimes(12);
      expect(new Set(picks.mock.calls.map(([e]) => e)).size).toBe(12);
      expect(history).toHaveBeenCalledTimes(12);
    }
  });

  it("starts the league fan-out before the schedule has arrived, so the two waits overlap", async () => {
    let release!: (v: typeof schedule) => void;
    const allFixtures = () => new Promise<typeof schedule>((r) => (release = r));
    const picks = vi.fn(async (e: number) => picksFor(e));
    const pending = service({ allFixtures, picks }).loadStreaming(1, {});
    for (let i = 0; i < 50 && picks.mock.calls.length === 0; i++) await Promise.resolve();
    expect(picks).toHaveBeenCalled();
    release(schedule);
    expect(ok((await pending).model).xi).not.toBeNull();
  });

  it("keeps the query's league-dependent choices, validated, for the links and forms painted first", async () => {
    const kept = async (q: ToolsQuery, managers = 12) => (await service({}, managers).loadStreaming(1, q)).kept;
    expect(await kept({})).toEqual({ eo: "top4", by: null, vs: null });
    expect(await kept({ eo: "top10", by: "captain", vs: "100,101" })).toEqual({ eo: "top10", by: "captain", vs: "100,101" });
    expect(await kept({ eo: ["all", "top4"], vs: ["101", "100"] })).toEqual({ eo: "all", by: null, vs: "101,100" });
    expect(await kept({ eo: "bogus", by: "nonsense", vs: "100,999999" })).toEqual({ eo: "top4", by: null, vs: null }); // 999999 isn't in the league
    expect(await kept({ vs: "100,100" })).toMatchObject({ vs: null });
    // too big a league for effective ownership: no group to keep, and no captain order without one
    expect(await kept({ eo: "top10", by: "captain" }, 80)).toEqual({ eo: null, by: null, vs: null });
  });

  it("keeps the same choices a full model would", async () => {
    for (const q of [{}, { eo: "top10", by: "captain" }, { eo: "all", vs: "100,103" }] as ToolsQuery[]) {
      const s = await service().loadStreaming(1, q);
      const full = ok(await service().load(1, q));
      expect(s.kept).toEqual({ eo: full.eo?.tier ?? null, by: full.eo?.by === "captain" ? "captain" : null, vs: full.leagueTools?.rivals?.selected?.join(",") ?? null });
    }
  });
});

const stream = (q: ToolsQuery = {}, over: Partial<FplPort> = {}) => service(over).loadStreaming(1, q);
const merged = async (s: ToolsStream): Promise<Ok> => ok({ ...s.model, ...(await s.deferred) });
/** The slots as the page fills them once the league fan-out has arrived. */
const arrivedSlots = (s: ToolsStream, full: Ok): ToolsDeferredSlots => ({
  kept: s.kept,
  eo: <ToolsEoCard model={full} />,
  league: <ToolsLeagueSections model={full} />,
  nav: <ToolsLeagueNav model={full} />,
  injuries: <ToolsInjuries model={full} />,
  injuriesNav: <ToolsInjuriesNav model={full} />,
});
/** The slots as the page paints them first: each Suspense boundary's fallback, from the page's own wiring. */
const fallbackSlots = (s: ToolsStream): ToolsDeferredSlots => {
  const slots = toolsSlots(s);
  const fallback = (n: ReactNode) => (n as ReactElement<{ fallback: ReactNode }>).props.fallback;
  return {
    kept: slots.kept,
    eo: fallback(slots.eo),
    league: fallback(slots.league),
    nav: fallback(slots.nav),
    injuries: fallback(slots.injuries),
    injuriesNav: fallback(slots.injuriesNav),
  };
};
/** Renders what one of the page's async slots resolves to. */
async function resolveSlot(n: ReactNode): Promise<string> {
  const child = (n as ReactElement<{ children: ReactElement }>).props.children;
  const out = await (child.type as (p: unknown) => Promise<ReactElement>)(child.props);
  return renderToStaticMarkup(out);
}

describe("ToolsView with streamed slots", () => {
  it("renders exactly as before once the slots hold the arrived parts", async () => {
    for (const q of [{}, { eo: "top10", by: "captain" }, { vs: "100,101", q: "player", pos: "2", moving: "1" }] as ToolsQuery[]) {
      const s = await stream(q);
      const full = await merged(s);
      const before = renderToStaticMarkup(<ToolsView model={full} />);
      expect(renderToStaticMarkup(<ToolsView model={ok(s.model)} deferred={arrivedSlots(s, full)} />), JSON.stringify(q)).toBe(before);
    }
  });

  it("does the same in the altered view", async () => {
    setRequestTrip(true);
    const s = await stream({ eo: "all" });
    const full = await merged(s);
    expect(renderToStaticMarkup(<ToolsView model={ok(s.model)} deferred={arrivedSlots(s, full)} />)).toBe(renderToStaticMarkup(<ToolsView model={full} />));
  });

  it("puts each slot where its part goes: injuries first, EO inside #eo, the league tools before the teams, their links in the nav", async () => {
    const s = await stream();
    const { container } = render(
      <ToolsView
        model={ok(s.model)}
        deferred={{
          kept: s.kept,
          eo: <p>eo-slot</p>,
          league: <section id="league-slot">league-slot</section>,
          nav: <li><a href="#league-slot">league-link</a></li>,
          injuries: <section id="injuries-slot">injuries-slot</section>,
          injuriesNav: <li><a href="#injuries-slot">injuries-link</a></li>,
        }}
      />,
    );
    expect(container.querySelector("#eo")).toHaveTextContent("eo-slot");
    const ids = [...container.querySelectorAll("section[id]")].map((x) => x.id);
    expect(ids[0]).toBe("brief");
    expect(ids[1]).toBe("injuries-slot");
    expect(ids.indexOf("league-slot")).toBeGreaterThan(ids.indexOf("eo"));
    expect(ids.indexOf("league-slot")).toBeLessThan(ids.indexOf("teams"));
    const nav = screen.getByRole("navigation", { name: "Tools" });
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#injuries-slot", "#xi", "#prices", "#eo", "#league-slot", "#teams"]);
  });

  it("still renders a full model on its own, with no slots", async () => {
    const full = await merged(await stream());
    const { container } = render(<ToolsView model={full} />);
    expect(container.querySelector("#eo")).toHaveTextContent("Effective ownership");
    expect(container.querySelector("#head-to-head")).not.toBeNull();
  });
});

describe("the first paint, before the league's squads arrive", () => {
  it("holds the EO card's place under its heading and says what it is waiting for, with only links that lead somewhere", async () => {
    const s = await stream();
    const { container } = render(<ToolsView model={ok(s.model)} deferred={fallbackSlots(s)} />);
    const eo = container.querySelector("#eo") as HTMLElement;
    expect(within(eo).getByRole("heading", { level: 2, name: "Effective ownership" })).toBeInTheDocument();
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(3);
    expect(MESSAGES.en.loading.injuries).toContain(statuses[0].textContent);
    expect(MESSAGES.en.loading.eo).toContain(statuses[1].textContent);
    expect(MESSAGES.en.loading.league).toContain(statuses[2].textContent);
    // every jump link points at something already on the page; the league tools' links come with their sections
    const nav = screen.getByRole("navigation", { name: "Tools" });
    for (const a of within(nav).getAllByRole("link")) expect(container.querySelector(a.getAttribute("href")!), a.getAttribute("href")!).not.toBeNull();
    expect(within(nav).queryByRole("link", { name: "Head to head" })).toBeNull();
  });

  it("is accessible", async () => {
    const s = await stream();
    const { container } = render(<ToolsView model={ok(s.model)} deferred={fallbackSlots(s)} />);
    await expectNoAxeViolations(container);
  });

  it("speaks the reader's language and the altered view's voice while it waits", async () => {
    const s = await stream();
    for (const locale of ["es", "fr"] as const) {
      setRequestLocale(locale);
      render(<ToolsEoPending variety={ok(s.model).phase.variety} />);
      render(<ToolsLeaguePending variety={ok(s.model).phase.variety} />);
      const [eo, lg] = screen.getAllByRole("status");
      expect(MESSAGES[locale].loading.eo).toContain(eo.textContent);
      expect(MESSAGES[locale].loading.league).toContain(lg.textContent);
      document.body.innerHTML = "";
    }
    setRequestLocale("en");
    setRequestTrip(true);
    const { container } = render(<ToolsView model={ok(s.model)} deferred={fallbackSlots(s)} />);
    const [inj, eo, lg] = screen.getAllByRole("status");
    expect(tripMessagesFor("en").loading.injuries).toContain(inj.textContent);
    expect(tripMessagesFor("en").loading.eo).toContain(eo.textContent);
    expect(tripMessagesFor("en").loading.league).toContain(lg.textContent);
    await expectNoAxeViolations(container);
  });

  it("keeps the head to head, EO group and captain order in the price filters without the league's data", async () => {
    const s = await stream({ q: "player", pos: "2", moving: "1", eo: "top10", by: "captain", vs: "100,101" });
    expect(ok(s.model).leagueTools).toBeNull();
    const { container } = render(<ToolsView model={ok(s.model)} deferred={fallbackSlots(s)} />);
    const form = container.querySelector('#prices form[action="/tools#prices"]') as HTMLFormElement;
    const hidden = Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => [i.name, i.value]));
    expect(hidden).toEqual({ eo: "top10", by: "captain", vs: "100,101" });
    expect(within(form).getByLabelText("Player")).toHaveValue("player");
    expect(within(form).getByLabelText("Position")).toHaveValue("2");
    expect(within(form).getByLabelText("Only players on the move")).toBeChecked();
    // and the same fields a full render would keep
    const full = await merged(s);
    const { container: c2 } = render(<ToolsView model={full} />);
    const fullHidden = Object.fromEntries([...c2.querySelectorAll<HTMLInputElement>('#prices form[action="/tools#prices"] input[type="hidden"]')].map((i) => [i.name, i.value]));
    expect(hidden).toEqual(fullHidden);
  });

  it("drops a head to head that isn't two of the league's managers, as the full page would", async () => {
    const s = await stream({ vs: "100,424242" });
    const { container } = render(<ToolsView model={ok(s.model)} deferred={fallbackSlots(s)} />);
    expect(container.querySelector('#prices input[name="vs"]')).toBeNull();
  });
});

describe("the page's streamed slots", () => {
  it("resolve to the arrived parts, the same markup a full render has", async () => {
    const s = await stream({ vs: "100,101", eo: "all" });
    const full = await merged(s);
    const slots = toolsSlots(s);
    expect(slots.kept).toBe(s.kept);
    expect(await resolveSlot(slots.eo)).toBe(renderToStaticMarkup(<ToolsEoCard model={full} />));
    expect(await resolveSlot(slots.league)).toBe(renderToStaticMarkup(<ToolsLeagueSections model={full} />));
    expect(await resolveSlot(slots.nav)).toBe(renderToStaticMarkup(<ToolsLeagueNav model={full} />));
    expect(await resolveSlot(slots.league)).toContain('id="head-to-head"');
  });

  it("leave no hole when there is nothing to show: no league sections and no links, and EO says it has nothing", async () => {
    const boom = async () => {
      throw new Error("down");
    };
    const s = await stream({}, { standings: boom });
    const slots = toolsSlots(s);
    expect(await resolveSlot(slots.league)).toBe("");
    expect(await resolveSlot(slots.nav)).toBe("");
    expect(await resolveSlot(slots.eo)).toContain("Effective ownership");
  });

  it("render in the reader's language once they arrive", async () => {
    testLanguage.cookie = "fr";
    const s = await stream();
    expect(await resolveSlot(toolsSlots(s).eo)).toContain(MESSAGES.fr.tools.eo.title);
  });
});
