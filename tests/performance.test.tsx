import { render } from "@testing-library/react";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BarChart, LineChart } from "@/components/ui/Charts";
import { MiniBars } from "@/components/ui/MiniBars";

describe("charts stay light", () => {
  // Coordinates live in attributes; the numbers printed as labels are the data itself.
  const longest = (html: string) => Math.max(0, ...[...html.matchAll(/ (?:x|y|cx|cy|width|height|points)="([^"]*)"/g)].flatMap((m) => [...m[1].matchAll(/-?\d+\.(\d+)/g)].map((n) => n[1].length)));

  it("never print more than two decimals in a coordinate", () => {
    const awkward = [39, 115, 77, 92, 50, 33.3333, 61.987654321];
    const bars = render(<MiniBars values={awkward} labels={["a", "b", "c", "d", "e", "f", "g"]} reference={71.666666} showValues showLabels barWidth={28} height={56} label="bars" />).container.innerHTML;
    expect([...bars.matchAll(/ [a-z0-9]+="[^"]*\d\.\d{3,}[^"]*"/g)].map((m) => m[0])).toEqual([]);
    const bar = render(<BarChart bars={awkward.map((value, i) => ({ label: `GW${i}`, value, marker: value / 3 }))} label="bar" />).container.innerHTML;
    expect(longest(bar)).toBeLessThanOrEqual(2);
    const line = render(<LineChart points={awkward.map((value, i) => ({ label: `GW${i}`, value: value * 1000.123456 }))} invert log label="line" />).container.innerHTML;
    expect(longest(line)).toBeLessThanOrEqual(2);
  });

  it("still put the bars in the right places", () => {
    const { container } = render(<MiniBars values={[0, 50, 100]} height={100} label="bars" />);
    const heights = [...container.querySelectorAll("rect")].map((r) => Number(r.getAttribute("height")));
    expect(heights).toEqual([2, 50, 100]);
  });
});

describe("what is sent to every page", () => {
  it("is a header logo at twice its shown size, much lighter than the original, kept for a year", async () => {
    const dir = join(process.cwd(), "public", "brand");
    expect(existsSync(join(dir, "lobster-league-192.webp"))).toBe(true);
    expect(statSync(join(dir, "lobster-league-192.webp")).size).toBeLessThan(statSync(join(dir, "lobster-league.webp")).size / 1.8);
    const rules = await (await import("../next.config")).default.headers!();
    const cache = (source: string) => rules.filter((r) => r.source === source).flatMap((r) => r.headers).find((h) => h.key === "Cache-Control")?.value;
    expect(cache("/brand/lobster-league-192.webp")).toBe("public, max-age=31536000, immutable");
    expect(cache("/avatars/:path*")).toContain("immutable");
    expect(cache("/mascots/:path*")).toContain("immutable");
    expect(cache("/times/:path*")).toMatch(/max-age=86400, stale-while-revalidate/);
    expect(cache("/favicon.ico")).toBe("public, max-age=86400");
  });
  it("uses that logo in the header", async () => {
    const { SiteHeader } = await import("@/components/ui/SiteHeader");
    const { container } = render(<SiteHeader siteName="The Lobster League" />);
    expect(container.querySelector('img[src="/brand/lobster-league-192.webp"]')).toHaveAttribute("width", "96");
  });
});

describe("optional outside sources do not hold a page up", () => {
  it("give up after three seconds", async () => {
    const fs = await import("node:fs");
    for (const file of ["lib/europe/footballData.ts", "lib/news/bbcSport.ts"]) {
      const code = fs.readFileSync(join(process.cwd(), file), "utf8");
      expect(code, file).toMatch(/AbortSignal\.timeout\(3000\)/);
    }
  });
});
