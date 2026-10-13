/**
 * Craft: the touch-and-glass details from the iPhone audit, pinned in the stylesheets so they don't quietly regress.
 * Finger-sized targets, anchors that land below the sticky header, hover effects only where there is a real pointer,
 * a floor on text size, the trip view's browser chrome colour, scroll cues on wide tables, and the heading order.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "@/components/ui/DataTable";
import { THEME_COLOR, THEME_SCRIPT, TRIP_THEME_COLOR } from "@/lib/domain";

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function cssFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}
const ALL_CSS = [...cssFiles("app"), ...cssFiles("components")];

interface Rule {
  selector: string;
  body: string;
  /** The at-rules this rule sits inside, outermost first. */
  within: string[];
}

/** A small CSS walker: every style rule with its declarations and enclosing at-rules. Comments are dropped first. */
function rules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const stack: string[] = [];
  let buf = "";
  for (const ch of src) {
    if (ch === "{") {
      stack.push(buf.trim());
      buf = "";
    } else if (ch === "}") {
      const prelude = stack.pop() ?? "";
      const keyframeStep = stack.some((p) => p.startsWith("@keyframes"));
      if (!prelude.startsWith("@") && !keyframeStep) out.push({ selector: prelude, body: buf.trim(), within: stack.filter((p) => p.startsWith("@")) });
      buf = "";
    } else {
      buf += ch;
    }
  }
  return out;
}

const remOf = (value: string): number | null => {
  const m = /^(-?\d*\.?\d+)(rem|px)$/.exec(value.trim());
  if (!m) return null;
  return m[2] === "rem" ? Number(m[1]) : Number(m[1]) / 16;
};

/** True when some rule matching `selector` (exactly, after whitespace normalising) sets min-height to at least 44px. */
function hasTarget(file: string, selector: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return rules(read(file)).some((r) => {
    if (!r.selector.split(",").map(norm).includes(norm(selector))) return false;
    const m = /(?:^|;)\s*min-height:\s*([^;]+)/.exec(r.body);
    const rem = m ? remOf(m[1]) : null;
    return rem !== null && rem >= 2.75;
  });
}

describe("finger-sized targets (44px)", () => {
  it.each([
    ["components/views/sheet.module.css", ".neighbour"],
    ["components/views/sheet.module.css", ".back a"],
    ["components/ui/PageHeader.module.css", ".back a"],
    ["components/views/tools.module.css", ".jump a"],
    ["components/views/tools.module.css", ".tab"],
    ["components/views/tools.module.css", ".input"],
    ["components/views/tools.module.css", ".check"],
    ["components/views/fixtureFeed.module.css", ".side"],
    ["components/ui/TripSwitch.module.css", ".sun"],
  ])("%s %s", (file, selector) => {
    expect(hasTarget(file, selector)).toBe(true);
  });

  it("the tools filters grow after their base sizes, so the touch rule actually wins", () => {
    const css = read("components/views/tools.module.css");
    expect(css.lastIndexOf("@media (pointer: coarse), (max-width: 699px)")).toBeGreaterThan(css.indexOf(".check {"));
  });

  it("the Stats toggle gets its hit area from an overhanging input, not by growing the pill and shifting the row", () => {
    const toggle = rules(read("components/views/leagueExtras.module.css"));
    const input = toggle.find((r) => r.selector === ".toggleInput" && r.within.length === 0);
    expect(input?.body).toMatch(/inset:\s*-8px -6px/);
    expect(hasTarget("components/views/leagueExtras.module.css", ".togglePill")).toBe(false);
  });

  it("inline team links in table rows overhang to a bigger target", () => {
    expect(read("components/views/views.module.css")).toMatch(/\.teamLink::before, a\.clubCell::before \{[^}]*inset: -0\.75rem/);
    expect(read("components/views/tools/leagueTools.module.css")).toMatch(/\.teamLink::before \{[^}]*inset: -0\.5rem/);
  });
});

describe("anchors land below the sticky header", () => {
  it("one --header-h token drives the scroll padding", () => {
    const globals = read("app/globals.css");
    expect(globals).toMatch(/--header-h:\s*81px/);
    expect(globals).toMatch(/scroll-padding-top:\s*calc\(var\(--header-h\)/);
  });

  it("no stylesheet hard-codes the old 72px / 8rem offsets", () => {
    for (const file of ALL_CSS) {
      const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
      expect(css, file).not.toMatch(/scroll-margin-top:\s*(72px|8rem)/);
      expect(css, file).not.toMatch(/(^|[;{\s])top:\s*72px/);
    }
  });

  it("the interview figure sticks below the header, whatever its height", () => {
    expect(read("components/views/interview.module.css")).toMatch(/top:\s*calc\(var\(--header-h\)/);
  });

  it("the price filter comes back to the prices table, not the top of the page", () => {
    expect(read("components/views/ToolsView.tsx")).toContain('action="/tools#prices"');
  });
});

describe("hover effects only where there is a real pointer", () => {
  // LiveRefresh styles are owned separately and are out of scope here.
  const files = ALL_CSS.filter((f) => !f.includes("LiveRefresh"));
  it.each(files.map((f) => [f]))("%s", (file) => {
    const loose = rules(read(file)).filter((r) => r.selector.includes(":hover") && !r.within.some((w) => /hover:\s*hover/.test(w)));
    expect(loose.map((r) => r.selector), relative(ROOT, file)).toEqual([]);
  });
});

describe("text size floor", () => {
  const SVG = ["components/ui/MiniBars.module.css", "components/ui/Charts.module.css"];
  it("HTML text is never below 11px (.6875rem)", () => {
    for (const file of ALL_CSS.filter((f) => !SVG.includes(f))) {
      for (const r of rules(read(file))) {
        for (const m of r.body.matchAll(/(?:^|;)\s*font-size:\s*([^;]+)/g)) {
          const rem = remOf(m[1]);
          if (rem !== null) expect(rem, `${file} ${r.selector} ${m[1]}`).toBeGreaterThanOrEqual(0.6875);
        }
      }
    }
  });
  it("SVG chart labels, drawn at 1:1, are never below 10px", () => {
    for (const file of SVG) {
      for (const r of rules(read(file))) {
        for (const m of r.body.matchAll(/(?:^|;)\s*font-size:\s*([^;]+)/g)) {
          const rem = remOf(m[1]);
          if (rem !== null) expect(rem * 16, `${file} ${r.selector}`).toBeGreaterThanOrEqual(10);
        }
      }
    }
  });
});

describe("browser chrome in the trip view", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.trip;
    delete document.documentElement.dataset.theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  });
  const run = () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined }));
    new Function(THEME_SCRIPT)();
    return document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-theme-color]')?.content;
  };
  it("the no-flash script paints the status bar purple when the trip view is on", () => {
    document.documentElement.dataset.trip = "on";
    expect(run()).toBe(TRIP_THEME_COLOR);
  });
  it("and the theme's own colour otherwise", () => {
    expect(run()).toBe(THEME_COLOR.light);
  });
});

describe("wide tables", () => {
  it("show scroll shadows on the panel", () => {
    const region = rules(read("components/ui/DataTable.module.css")).find((r) => r.selector === ".region" && r.within.length === 0);
    expect(region?.body).toMatch(/no-repeat local/);
    expect(region?.body).toMatch(/no-repeat scroll/);
  });
  it("can keep the first column in view (opt in, nothing changes without it)", () => {
    const columns = [{ key: "a", header: "A", cell: (r: { a: string }) => r.a }];
    const plain = render(<DataTable caption="c" columns={columns} rows={[{ a: "x" }]} rowKey={(r) => r.a} />);
    expect(plain.container.querySelector("table")?.className).not.toMatch(/stickyFirst/);
    plain.unmount();
    const sticky = render(<DataTable caption="c" columns={columns} rows={[{ a: "x" }]} rowKey={(r) => r.a} stickyFirst />);
    expect(sticky.container.querySelector("table")?.className).toMatch(/stickyFirst/);
  });
});

describe("home screen and safe areas", () => {
  it("has an apple-touch-icon and a manifest", () => {
    expect(statSync(join(ROOT, "app/apple-icon.png")).size).toBeGreaterThan(1000);
    expect(read("app/manifest.ts")).toContain("/brand/lobster-league-icon-192.png");
    expect(statSync(join(ROOT, "public/brand/lobster-league-icon-192.png")).size).toBeGreaterThan(1000);
  });
  it("draws edge to edge and pads content clear of the notch", () => {
    expect(read("app/layout.tsx")).toContain('viewportFit: "cover"');
    expect(read("app/globals.css")).toMatch(/env\(safe-area-inset-left/);
  });
});

describe("heading order in the Times reader", () => {
  it("per-page headings under 'read as text' are h2 (the page title is the h1)", () => {
    const src = read("components/ui/Flipbook/Flipbook.tsx");
    expect(src).toContain("<h2>{t.pageHeading(n)}</h2>");
    expect(src).not.toContain("<h3>{t.pageHeading(n)}</h3>");
  });
});
