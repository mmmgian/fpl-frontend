import { describe, expect, it } from "vitest";
import {
  ISSUE_KINDS, KIND_LABEL, compareIssues, filterIssues, formatBytes, isIssueId, issueAssets, kindCounts, latestEdition, neighbours,
  parseIssueKind, parsePageNumber, sortIssues,
} from "@/lib/domain";
import { LIBRARY, summary } from "./times-fixtures";

describe("isIssueId", () => {
  it.each(["lobster-times-gw5", "a", "gw3-khang-dang-plan", "x1-y2"])("accepts %j", (id) => expect(isIssueId(id)).toBe(true));
  it.each(["", "Upper", "a_b", "a--b", "-a", "a-", "../x", "a/b", "a b", "a.b", "é", "a".repeat(81)])("rejects %j", (id) => expect(isIssueId(id)).toBe(false));
});

describe("issueAssets", () => {
  it("names files the way the pipeline writes them", () => {
    expect(issueAssets.pdf("x-y")).toBe("/times/x-y/x-y.pdf");
    expect(issueAssets.text("x-y")).toBe("/times/x-y/text.json");
    expect(issueAssets.page("x-y", 7, "m")).toBe("/times/x-y/p-007-m.webp");
    expect(issueAssets.page("x-y", 123, "l")).toBe("/times/x-y/p-123-l.webp");
  });
  it("builds a srcset from small to large", () => {
    expect(issueAssets.srcSet("x", 1)).toBe("/times/x/p-001-s.webp 240w, /times/x/p-001-m.webp 640w, /times/x/p-001-l.webp 1080w");
  });
});

describe("parsing query values", () => {
  it.each([["plan", "plan"], ["times", "times"], ["nonsense", null], ["", null], [undefined, null], [["report", "plan"], "report"], ["PLAN", null], ["__proto__", null]])(
    "parseIssueKind(%j) = %j",
    (raw, expected) => expect(parseIssueKind(raw as string)).toBe(expected),
  );
  it.each([
    ["3", 10, 3], ["1", 10, 1], ["10", 10, 10], ["11", 10, 10], ["0", 10, 1], [undefined, 10, 1], ["", 10, 1], ["abc", 10, 1], ["-2", 10, 1],
    ["2.5", 10, 1], ["1e3", 10, 1], ["99999", 10, 1], [["4", "5"], 10, 4], ["5", 0, 1], ["7", 1, 1],
  ])("parsePageNumber(%j of %j) = %j", (raw, count, expected) => expect(parsePageNumber(raw as string, count)).toBe(expected));
});

describe("ordering", () => {
  it("is newest first, then higher gameweek, then kind, then title", () => {
    const a = summary({ id: "a", title: "B", published: "2026-09-02", gameweek: 3, kind: "report" });
    const b = summary({ id: "b", title: "A", published: "2026-09-02", gameweek: 3, kind: "report" });
    const c = summary({ id: "c", published: "2026-09-02", gameweek: 4, kind: "report" });
    const d = summary({ id: "d", published: "2026-09-02", gameweek: 3, kind: "times" });
    const e = summary({ id: "e", published: "2026-09-03" });
    expect(sortIssues([a, b, c, d, e]).map((i) => i.id)).toEqual(["e", "c", "d", "b", "a"]);
  });
  it("is a consistent total order (antisymmetric), with id as the last tie-break", () => {
    const x = summary({ id: "x" });
    const y = summary({ id: "y" });
    expect(Math.sign(compareIssues(x, y))).toBe(-Math.sign(compareIssues(y, x)));
    expect(compareIssues(x, x)).toBe(0);
  });
  it("does not mutate its input", () => {
    const copy = [...LIBRARY];
    sortIssues(LIBRARY);
    expect(LIBRARY).toEqual(copy);
  });
});

describe("filtering and grouping", () => {
  it("filters by kind, or returns everything for null", () => {
    expect(filterIssues(LIBRARY, "times").map((i) => i.id)).toEqual(["times-gw5", "times-gw4"]);
    expect(filterIssues(LIBRARY, "recap")).toEqual([]);
    expect(filterIssues(LIBRARY, null)).toBe(LIBRARY);
  });
  it("counts kinds in canonical order and skips empty ones", () => {
    expect(kindCounts(LIBRARY)).toEqual([{ kind: "times", count: 2 }, { kind: "plan", count: 1 }, { kind: "dossier", count: 1 }, { kind: "report", count: 1 }]);
    expect(kindCounts([])).toEqual([]);
  });
  it("every kind has a label", () => {
    for (const k of ISSUE_KINDS) expect(KIND_LABEL[k].singular && KIND_LABEL[k].plural).toBeTruthy();
  });
});

describe("latest edition and neighbours", () => {
  it("features the most recent newspaper, not just the most recent issue", () => {
    expect(latestEdition(sortIssues(LIBRARY))?.id).toBe("times-gw5"); // plan-gw6 is newer but is not a newspaper
    expect(latestEdition(sortIssues(LIBRARY.filter((i) => i.kind !== "times")))).toBeNull();
    expect(latestEdition([])).toBeNull();
  });
  it("finds the issue before and after in a sorted list", () => {
    const sorted = sortIssues(LIBRARY);
    expect(neighbours(sorted, sorted[0].id)).toEqual({ newer: null, older: sorted[1] });
    expect(neighbours(sorted, sorted[2].id)).toEqual({ newer: sorted[1], older: sorted[3] });
    expect(neighbours(sorted, sorted[sorted.length - 1].id).older).toBeNull();
    expect(neighbours(sorted, "missing")).toEqual({ newer: null, older: null });
  });
});

describe("formatBytes", () => {
  it.each([[0, "0 B"], [512, "512 B"], [1024, "1 KB"], [273 * 1024, "273 KB"], [1024 * 1024, "1.0 MB"], [3_400_687, "3.2 MB"], [-5, ""], [NaN, ""]])("%j -> %j", (n, s) =>
    expect(formatBytes(n)).toBe(s),
  );
});
