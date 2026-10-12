import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StandingsTable } from "@/components/views/StandingsTable";
import { zoneOf } from "@/lib/domain";
import { standing } from "./fixtures";

describe("zoneOf", () => {
  it("puts the top four in green, fifth and sixth in amber and the bottom four in red", () => {
    const zones = Array.from({ length: 21 }, (_, i) => zoneOf(i + 1, 21));
    expect(zones.slice(0, 4)).toEqual(["good", "good", "good", "good"]);
    expect(zones.slice(4, 6)).toEqual(["warn", "warn"]);
    expect(zones.slice(6, 17).every((z) => z === undefined)).toBe(true);
    expect(zones.slice(17)).toEqual(["bad", "bad", "bad", "bad"]);
  });
  it("counts the bottom from the size of the league", () => {
    expect([10, 9, 8, 7, 6].map((r) => zoneOf(r, 10))).toEqual(["bad", "bad", "bad", "bad", "warn"]);
    expect(zoneOf(16, 20)).toBeUndefined();
    expect(zoneOf(17, 20)).toBe("bad");
    expect(zoneOf(17, 21)).toBeUndefined();
    expect(zoneOf(18, 21)).toBe("bad");
  });
  it("has no zones in a league too small for them to be distinct", () => {
    for (let r = 1; r <= 9; r++) expect(zoneOf(r, 9)).toBeUndefined();
  });
});

describe("the league table's zones", () => {
  const rows = Array.from({ length: 12 }, (_, i) => standing({ entry: i + 1, entry_name: `T${i + 1}`, rank: i + 1, total: 500 - i }));
  const tones = (container: HTMLElement) => [...container.querySelectorAll("tbody tr[data-tone]")].map((tr) => `${tr.querySelector("th, td")?.textContent?.trim()}:${tr.getAttribute("data-tone")}`);

  it("tints the right rows when asked, and says so in words for people who can't see colour", () => {
    const { container } = render(<StandingsTable rows={rows} caption="t" zones />);
    expect(container.querySelectorAll('tbody tr[data-tone="good"]')).toHaveLength(4);
    expect(container.querySelectorAll('tbody tr[data-tone="warn"]')).toHaveLength(2);
    expect(container.querySelectorAll('tbody tr[data-tone="bad"]')).toHaveLength(4);
    expect(screen.getByRole("list", { name: "Zones" })).toHaveTextContent("Top 4");
    expect(screen.getAllByText("(Top 4)", { exact: false })).toHaveLength(4);
    expect(screen.getAllByText("(Bottom 4)", { exact: false })).toHaveLength(4);
    expect(tones(container)).toHaveLength(10);
  });
  it("tints nothing and shows no key when not asked (a frozen history table)", () => {
    const { container } = render(<StandingsTable rows={rows} caption="t" />);
    expect(container.querySelectorAll("tbody tr[data-tone]")).toHaveLength(0);
    expect(screen.queryByRole("list", { name: "Zones" })).toBeNull();
  });
  it("tints nothing in a league of fewer than ten", () => {
    const { container } = render(<StandingsTable rows={rows.slice(0, 8)} caption="t" zones />);
    expect(container.querySelectorAll("tbody tr[data-tone]")).toHaveLength(0);
    expect(screen.queryByRole("list", { name: "Zones" })).toBeNull();
  });
});
