import { describe, expect, it, vi } from "vitest";
import { createTimesService } from "@/lib/services/times";
import { LIBRARY, fakeTimes, summary } from "./times-fixtures";

describe("library", () => {
  const svc = createTimesService(fakeTimes());

  it("features the latest newspaper and lists the rest, newest first, without repeating it", async () => {
    const m = await svc.library(undefined);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.hero?.id).toBe("times-gw5");
    expect(m.issues.map((i) => i.id)).toEqual(["plan-gw6", "dossier-gw6", "times-gw4", "one-pager"]);
    expect(m.total).toBe(5);
    expect(m.active).toBeNull();
  });

  it("offers an All filter and one per kind, with counts, marking the active one", async () => {
    const m = await svc.library("plan");
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.filters.map((f) => [f.label, f.count, f.active])).toEqual([
      ["All", 5, false], ["Newspapers", 2, false], ["Plans", 1, true], ["Dossiers", 1, false], ["Reports", 1, false],
    ]);
    expect(m.filters[0].value).toBeNull();
  });

  it("a filter drops the hero and shows every match, including the newest newspaper", async () => {
    const m = await svc.library("times");
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.hero).toBeNull();
    expect(m.issues.map((i) => i.id)).toEqual(["times-gw5", "times-gw4"]);
  });

  it.each([["nonsense"], [""], [undefined], [["plan", "times"]]])("treats %j sensibly", async (raw) => {
    const m = await svc.library(raw as string);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.active).toBe(Array.isArray(raw) ? "plan" : null); // the first value wins; junk means everything
  });

  it("a valid kind with no issues gives an empty list, not an error", async () => {
    const m = await svc.library("recap");
    expect(m).toMatchObject({ kind: "ok", issues: [], hero: null, active: "recap" });
  });

  it("without any newspaper there is no hero and everything is listed", async () => {
    const m = await createTimesService(fakeTimes(LIBRARY.filter((i) => i.kind !== "times"))).library(undefined);
    if (m.kind !== "ok") throw new Error("expected ok");
    expect(m.hero).toBeNull();
    expect(m.issues).toHaveLength(3);
  });

  it("an empty library is its own state", async () => {
    expect(await createTimesService(fakeTimes([])).library(undefined)).toEqual({ kind: "empty", press: { gw: null, phase: null, awaiting: null, variety: expect.any(Number) } }); // no FPL, so nothing to say about the presses
  });
});

describe("issue", () => {
  const svc = createTimesService(fakeTimes());

  it("opens an issue at the requested page, clamped into range", async () => {
    const at = async (p: string | undefined) => {
      const m = await svc.issue("times-gw5", p);
      if (m.kind !== "ok") throw new Error("expected ok");
      return m.page;
    };
    expect(await at("3")).toBe(3);
    expect(await at(undefined)).toBe(1);
    expect(await at("0")).toBe(1);
    expect(await at("999")).toBe(6);
    expect(await at("abc")).toBe(1);
  });

  it("gives the neighbouring issues of the same kind, by date", async () => {
    // Newspapers walk to newspapers: the dossier and plan published between them are skipped.
    const gw4 = await svc.issue("times-gw4", undefined);
    expect(gw4).toMatchObject({ kind: "ok", newer: { id: "times-gw5" }, older: null });
    const gw5 = await svc.issue("times-gw5", undefined);
    expect(gw5).toMatchObject({ kind: "ok", newer: null, older: { id: "times-gw4" } });
    // The only dossier has no neighbours, even though other kinds were published either side of it.
    expect(await svc.issue("dossier-gw6", undefined)).toMatchObject({ kind: "ok", newer: null, older: null });
  });

  it("reports an unknown issue as not found", async () => {
    expect(await svc.issue("nope", undefined)).toEqual({ kind: "not-found" });
  });

  it("a one-page issue always opens on page 1", async () => {
    expect(await svc.issue("one-pager", "5")).toMatchObject({ kind: "ok", page: 1 });
  });

  it("asks the port once for the issue and once for the library", async () => {
    const port = fakeTimes();
    const library = vi.spyOn(port, "library");
    const issue = vi.spyOn(port, "issue");
    await createTimesService(port).issue("times-gw5", "2");
    expect(issue).toHaveBeenCalledTimes(1);
    expect(library).toHaveBeenCalledTimes(1);
  });

  it("does not need the library for an unknown issue", async () => {
    const port = fakeTimes();
    const library = vi.spyOn(port, "library");
    await createTimesService(port).issue("nope", undefined);
    expect(library).not.toHaveBeenCalled();
  });

  it("copes with a library entry the port can't open", async () => {
    const port = { library: async () => [summary({ id: "ghost" })], issue: async () => null };
    expect(await createTimesService(port).issue("ghost", undefined)).toEqual({ kind: "not-found" });
  });
});
