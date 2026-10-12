/** Colour themes: the pure rules, the inline no-flash script (executed for real), the toggle, and the palettes' contrast. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { applyTheme } from "@/components/ui/applyTheme";
import { isTheme, resolveTheme, THEME_COLOR, THEME_SCRIPT, THEME_STORAGE_KEY, THEMES } from "@/lib/domain";
import { expectNoAxeViolations } from "./axe";

/** A matchMedia stand-in that can flip, and tell listeners. */
function fakeMedia(initialDark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: initialDark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  return { mq, flip: (dark: boolean) => { mq.matches = dark; listeners.forEach((fn) => fn()); } };
}

const html = () => document.documentElement.dataset.theme;
const chrome = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-theme-color]')?.content;

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveTheme", () => {
  it("uses a saved theme, whatever the device prefers", () => {
    expect(resolveTheme("night", false)).toBe("night");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("follows the device when nothing valid is saved", () => {
    for (const junk of [null, undefined, "", "Dark", "sepia", 3, {}, ["dark"]]) {
      expect(resolveTheme(junk, true)).toBe("dark");
      expect(resolveTheme(junk, false)).toBe("light");
    }
  });
  it("knows exactly three themes", () => {
    expect(THEMES).toEqual(["light", "night", "dark"]);
    expect(isTheme("night")).toBe(true);
    expect(isTheme("auto")).toBe(false);
  });
});

describe("the inline script that runs before first paint", () => {
  const run = (media = fakeMedia(false)) => {
    vi.stubGlobal("matchMedia", () => media.mq);
    new Function(THEME_SCRIPT)();
    return media;
  };

  it("applies the device's setting when nothing is saved, and sets the browser chrome colour to match", () => {
    run(fakeMedia(true));
    expect(html()).toBe("dark");
    expect(chrome()).toBe(THEME_COLOR.dark);
    delete document.documentElement.dataset.theme;
    run(fakeMedia(false));
    expect(html()).toBe("light");
    expect(chrome()).toBe(THEME_COLOR.light);
  });

  it.each(THEMES)("applies a saved %s theme even against the device setting", (t) => {
    localStorage.setItem(THEME_STORAGE_KEY, t);
    run(fakeMedia(t === "light"));
    expect(html()).toBe(t);
    expect(chrome()).toBe(THEME_COLOR[t]);
  });

  it("ignores a junk saved value", () => {
    for (const junk of ["", "auto", "constructor", "toString", "__proto__", "Dark"]) {
      localStorage.setItem(THEME_STORAGE_KEY, junk);
      delete document.documentElement.dataset.theme;
      run(fakeMedia(true));
      expect(html(), `saved ${JSON.stringify(junk)}`).toBe("dark");
    }
  });

  it("still works when storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    run(fakeMedia(true));
    expect(html()).toBe("dark");
  });

  it("follows the device while nothing is chosen, and stops following once something is", () => {
    const media = run(fakeMedia(false));
    expect(html()).toBe("light");
    media.flip(true);
    expect(html()).toBe("dark");
    localStorage.setItem(THEME_STORAGE_KEY, "night");
    media.flip(false);
    expect(html()).toBe("dark");          // a saved choice is not overridden by the device changing
  });

  it("adds one browser-chrome meta tag, in front of any others, however many times it runs", () => {
    const other = document.createElement("meta");
    other.name = "theme-color";
    other.content = "#fff";
    document.head.append(other);
    run();
    run();
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    expect(metas).toHaveLength(2);
    expect(metas[0].hasAttribute("data-theme-color")).toBe(true);
  });

  it("is plain ES5-style code with no imports (it is pasted into <head>)", () => {
    expect(THEME_SCRIPT).not.toMatch(/\b(import|export|const |let )|=>/);
  });

  it("agrees with applyTheme on what to set", () => {
    for (const t of THEMES) {
      localStorage.setItem(THEME_STORAGE_KEY, t);
      run();
      const fromScript = { theme: html(), color: chrome() };
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
      delete document.documentElement.dataset.theme;
      applyTheme(t, false);
      expect({ theme: html(), color: chrome() }).toEqual(fromScript);
    }
  });
});

describe("applyTheme", () => {
  it("remembers a choice, and only when asked to", () => {
    applyTheme("night", false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    applyTheme("night", true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("night");
  });
  it("still switches the theme when the browser won't let it save", () => {
    applyTheme("dark", true, document, { setItem: () => { throw new Error("quota"); } });
    expect(html()).toBe("dark");
  });
  it("tells listeners", () => {
    const seen = vi.fn();
    window.addEventListener("lobster-theme", seen);
    applyTheme("dark", false);
    window.removeEventListener("lobster-theme", seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("ThemeToggle", () => {
  it("offers Regular, Night reader and Dark as one labelled radio group, in that order", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("group", { name: "Colour theme" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["light", "night", "dark"]);
    expect(screen.getByRole("radio", { name: "Regular" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Night reader" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeInTheDocument();
  });

  it("shows the theme that is in force as checked", () => {
    document.documentElement.dataset.theme = "night";
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "Night reader" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });

  it("switches the page and remembers the choice when a segment is picked, and moves the checkmark", () => {
    document.documentElement.dataset.theme = "light";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(html()).toBe("dark");
    expect(chrome()).toBe(THEME_COLOR.dark);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Regular" })).not.toBeChecked();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ThemeToggle />);
    await expectNoAxeViolations(container);
  });
});

// ---------------------------------------------------------------------------------------------------- palettes

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

/** The `--token: value` pairs of the block that opens with `selector {` (up to its closing brace). */
function block(selector: string): Record<string, string> {
  const open = css.indexOf("{", css.indexOf(`${selector} {`));
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) { end = i; break; }
  }
  return Object.fromEntries([...css.slice(open + 1, end).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

type RGBA = [number, number, number, number];
function parse(color: string): RGBA {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [...[0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)), 1] as RGBA;
  const rgba = color.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1].split(",").map((s) => s.trim());
    return [+r, +g, +b, +a];
  }
  throw new Error(`cannot parse ${color}`);
}
const over = (top: RGBA, bottom: RGBA): RGBA => [...[0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])), 1] as RGBA;
const luminance = ([r, g, b]: RGBA) => {
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (fg: RGBA, bg: RGBA) => {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

const palettes = {
  light: block(":root"),
  night: block(':root[data-theme="night"]'),
  dark: block(':root[data-theme="dark"]'),
} as const;

describe("palettes", () => {
  it("the dark theme is the same whether it is picked or comes from the device setting", () => {
    expect(block(":root:not([data-theme])")).toEqual(palettes.dark);
  });

  it("every theme defines every colour token the regular theme does", () => {
    const layout = new Set(["--font-sans", "--font-mono", "--radius", "--radius-lg", "--radius-pill", "--radius-in", "--content-max", "--dot-gap", "--dot-size", "--glass-blur", "--frost"]);
    const wanted = Object.keys(palettes.light).filter((k) => !layout.has(k) && !k.startsWith("--space-"));
    for (const t of ["night", "dark"] as const) expect(wanted.filter((k) => !(k in palettes[t])), t).toEqual([]);
  });

  it("the browser chrome colour of each theme is that theme's background", () => {
    for (const t of THEMES) expect(parse(palettes[t]["--bg"]).slice(0, 3), t).toEqual(parse(THEME_COLOR[t]).slice(0, 3));
  });

  it("the reduce-transparency and high-contrast override beats every theme", () => {
    const at = css.indexOf("prefers-reduced-transparency");
    const rule = css.slice(at, css.indexOf("}", css.indexOf("}", at) ));
    expect(rule).toContain(":root[data-theme]");
    expect(rule).toContain(":root:not([data-theme])");
  });

  describe.each(THEMES)("%s theme contrast", (t) => {
    const p = palettes[t];
    const bg = parse(p["--bg"]);
    const panel = over(parse(p["--surface"]), bg);                       // the translucent glass as it actually looks
    const solid = parse(p["--surface-solid"]);
    const on = (fg: string, base: RGBA) => ratio(over(parse(fg), base), base);

    it("body text is at least 7:1 on the page and on panels", () => {
      for (const base of [bg, panel, solid]) expect(on(p["--text"], base)).toBeGreaterThanOrEqual(7);
    });
    it("secondary text, links and status colours are at least 4.5:1", () => {
      for (const token of ["--text-muted", "--accent", "--positive", "--negative", "--warning"]) {
        for (const base of [bg, panel, solid]) expect(on(p[token], base), `${token}`).toBeGreaterThanOrEqual(4.5);
      }
    });
    it("the focus ring is at least 3:1 against the page and panels", () => {
      for (const base of [bg, panel, solid]) expect(on(p["--focus"], base)).toBeGreaterThanOrEqual(3);
    });
    it("every fixture-difficulty chip is readable (text at least 7:1 on its own background)", () => {
      for (const d of [1, 2, 3, 4, 5]) expect(ratio(parse(p[`--fdr-${d}-fg`]), parse(p[`--fdr-${d}-bg`])), `FDR ${d}`).toBeGreaterThanOrEqual(7);
    });
  });
});
