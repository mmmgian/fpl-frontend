import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initLocale } from "@/app/locale";
import { I18nProvider } from "@/components/ui/I18nProvider";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { getFormat, getLocale, setRequestLocale } from "@/components/ui";
import { formatBytes, localizeIssue, negotiateLocale, resolveLocale, LOCALES, ISSUE_TEXT } from "@/lib/domain";
import { en } from "@/lib/domain/i18n/en";
import { es } from "@/lib/domain/i18n/es";
import { fr } from "@/lib/domain/i18n/fr";
import { clientEn } from "@/lib/domain/i18n/client/en";
import { clientEs } from "@/lib/domain/i18n/client/es";
import { clientFr } from "@/lib/domain/i18n/client/fr";
import issues from "@/content/times/issues.json";
import { englishLeaks, visibleTexts } from "./i18nLeaks";
import { testLanguage } from "./language";


describe("choosing a language", () => {
  it("takes the first supported language the browser prefers, by quality then order", () => {
    expect(negotiateLocale("es-PA,es;q=0.9,en;q=0.5")).toBe("es");
    expect(negotiateLocale("es-MX")).toBe("es");
    expect(negotiateLocale("fr-CA,fr;q=0.9")).toBe("fr");
    expect(negotiateLocale("de,fr;q=0.4,es;q=0.8")).toBe("es"); // de isn't ours; es outranks fr
    expect(negotiateLocale("fr;q=0.2,en;q=0.9")).toBe("en");
    expect(negotiateLocale("fr;q=0,es;q=0")).toBe("en"); // q=0 means "not acceptable"
  });
  it("falls back to English for nothing, junk or a language we don't have", () => {
    for (const v of [undefined, null, "", "*", "de-DE,de;q=0.9", ";;;,,,", "es;q=abc"]) expect(negotiateLocale(v), String(v)).toBe("en");
  });
  it("lets a saved choice win over the browser, and ignores a saved value it doesn't know", () => {
    expect(resolveLocale("fr", "es")).toBe("fr");
    expect(resolveLocale("es", undefined)).toBe("es");
    expect(resolveLocale("klingon", "es")).toBe("es");
    expect(resolveLocale(undefined, undefined)).toBe("en");
  });
  it("sets the language each request renders in, from the cookie, then the header", async () => {
    testLanguage.cookie = "fr";
    testLanguage.acceptLanguage = "es";
    expect(await initLocale()).toBe("fr");
    expect(getLocale()).toBe("fr");
    testLanguage.cookie = undefined;
    expect(await initLocale()).toBe("es");
  });
});

describe("the language button", () => {
  const show = (locale: "en" | "es" | "fr" = "en") =>
    render(
      <I18nProvider locale={locale}>
        <LanguageSwitcher />
      </I18nProvider>,
    );

  it("lists every language in its own words and shows the current one", () => {
    show("es");
    const select = screen.getByRole("combobox", { name: /idioma/i }) as HTMLSelectElement;
    expect(select.value).toBe("es");
    expect([...select.options].map((o) => o.value)).toEqual([...LOCALES]);
    expect([...select.options].map((o) => o.text)).toEqual(["English", "Español (Centroamérica)", "Français"]);
  });
  const reload = vi.fn();
  const realLocation = window.location;
  beforeEach(() => {
    reload.mockClear();
    Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, protocol: "http:", reload } });
  });
  afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: realLocation }));

  it("remembers the choice on this device and reloads the page in that language", () => {
    document.cookie = "lobster-lang=; max-age=0; path=/";
    show("en");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fr" } });
    expect(document.cookie).toContain("lobster-lang=fr");
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("does nothing when the current language is picked again", () => {
    document.cookie = "lobster-lang=; max-age=0; path=/";
    show("en");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "en" } });
    expect(reload).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("lobster-lang");
  });
  it("is labelled in the page's language", () => {
    for (const [locale, label] of [["en", /language/i], ["es", /idioma/i], ["fr", /langue/i]] as const) {
      const { unmount } = show(locale);
      expect(screen.getByRole("combobox", { name: label })).toBeInTheDocument();
      unmount();
    }
  });
});

/** The names of everything in a catalog, and for a function message how many arguments it takes. */
function shape(value: unknown, path = ""): string[] {
  if (typeof value === "function") return [`${path}(${value.length})`];
  if (typeof value === "string") return [`${path}:string`];
  if (Array.isArray(value)) return value.flatMap((v, i) => shape(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => shape(v, `${path}.${k}`));
  return [`${path}:${typeof value}`];
}
const strings = (value: unknown): string[] => (typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : []);

describe("the catalogs", () => {
  it("have exactly the same strings and functions in every language", () => {
    const sorted = (v: unknown) => shape(v).sort();
    expect(sorted(es)).toEqual(sorted(en));
    expect(sorted(fr)).toEqual(sorted(en));
    expect(sorted(clientEs)).toEqual(sorted(clientEn));
    expect(sorted(clientFr)).toEqual(sorted(clientEn));
  });
  it("have no empty strings", () => {
    for (const [name, catalog] of Object.entries({ en, es, fr, clientEn, clientEs, clientFr })) {
      expect(strings(catalog).filter((s) => s === ""), name).toEqual([]);
    }
  });
  it("are actually translated, not copied from English", () => {
    for (const [name, other, english] of [["es", es, en], ["fr", fr, en], ["clientEs", clientEs, clientEn], ["clientFr", clientFr, clientEn]] as const) {
      const a = strings(english);
      const b = strings(other);
      const same = a.filter((s, i) => s === b[i] && /\p{L}{3}/u.test(s)).length;
      expect(same / a.length, name).toBeLessThan(0.12); // shared words (Total, Free Hit, Bench Boost...) exist, but only a few
    }
  });
  it("carry no leftover template markers or JavaScript noise", () => {
    for (const s of [...strings(es), ...strings(fr), ...strings(clientEs), ...strings(clientFr)]) {
      expect(s).not.toMatch(/\$\{|\{\{|undefined|\[object/);
    }
  });
  it("give the same answer for plurals and numbers in each language's own words", () => {
    expect(en.common.points(1)).toBe("1 point");
    expect(en.common.points(2)).toBe("2 points");
    expect(es.common.points(1)).toBe("1 punto");
    expect(es.common.points(5)).toBe("5 puntos");
    expect(fr.common.points(1)).toBe("1 point");
    expect(fr.common.points(0)).toBe("0 point"); // French singular covers 0 and 1
    expect(fr.common.points(2)).toBe("2 points");
    expect(fr.times.pages(0)).toBe("0 page");
    expect(es.common.gameweek(6)).toBe("Jornada 6");
    expect(fr.common.gameweek(6)).toBe("Journée 6");
  });
});

describe("sentences built from pieces", () => {
  it("French counts weeks as 'N semaines sur M', not 'N M semaines'", () => {
    const { beatAverageBefore: before, beatAverageAfter: after } = fr.season;
    expect(`${before}5${after(5, 8)}`).toBe("Vous avez fait mieux que le manager moyen lors de 5 semaines sur 8, avant malus.");
    expect(`${before}1${after(1, 1)}`).toContain("1 semaine sur 1");
    expect(`${es.season.beatAverageBefore}5${es.season.beatAverageAfter(5, 8)}`).toBe("Superaste al manager promedio en 5 de 8 semanas, antes de penalizaciones.");
  });
  it("Spanish puts the article before a gameweek: 'de la Jornada 6'", () => {
    const gw = es.common.gameweek(6);
    expect(es.team.summary(gw)).toBe("Resumen de la Jornada 6");
    expect(es.team.noPicksTitle(gw)).toBe("No hay alineación para la Jornada 6");
    expect(es.matchday.heading(gw)).toBe("Claves de la Jornada 6");
    expect(es.team.notStartedBody(gw)).toContain("cierre de la Jornada 6");
  });
  it("French says 'la date limite de la Journée 6'", () => {
    expect(fr.team.notStartedBody(fr.common.gameweek(6))).toContain("date limite de la Journée 6");
  });
  it("percentages follow each language's typography", () => {
    expect(en.common.percent("9.2")).toBe("9.2%");
    expect(es.common.percent("9.2")).toBe("9.2\u00a0%");
    expect(fr.common.percent("9,2")).toBe("9,2\u00a0%");
  });
});

describe("numbers, sizes and dates", () => {
  it("use each language's separators", () => {
    expect(formatBytes(3_400_000, "en")).toBe("3.2 MB");
    expect(formatBytes(3_400_000, "fr", fr.times.bytes)).toBe("3,2 Mo");
    expect(formatBytes(273 * 1024, "fr", fr.times.bytes)).toBe("273 Ko");
    expect(formatBytes(500, "fr", fr.times.bytes)).toBe("500 o");
    expect(formatBytes(-1)).toBe("");
  });
});

describe("Lobster Times blurbs", () => {
  const ids = issues.map((i) => i.id);
  it("exist in every language for every issue in the library", () => {
    for (const locale of ["es", "fr"] as const) {
      expect(Object.keys(ISSUE_TEXT[locale]).sort(), locale).toEqual([...ids].sort());
      for (const i of issues) {
        const words = ISSUE_TEXT[locale][i.id];
        if (i.kicker) expect(words.kicker, `${locale} ${i.id} kicker`).toBeTruthy();
        if (i.summary) expect(words.summary, `${locale} ${i.id} summary`).toBeTruthy();
      }
    }
  });
  it("leave the title (a proper name) and the English as the fallback", () => {
    const issue = { id: "lobster-times-gw5", title: "The Lobster Times", kicker: "Vol. V · Issue 5", summary: "English." };
    expect(localizeIssue(issue, "en")).toBe(issue);
    expect(localizeIssue(issue, "es")).toMatchObject({ title: "The Lobster Times", kicker: "Vol. V · Edición 5" });
    expect(localizeIssue({ id: "brand-new", title: "T", kicker: "K", summary: "S" }, "fr")).toEqual({ id: "brand-new", title: "T", kicker: "K", summary: "S" });
    expect(localizeIssue({ id: "gw3-preview", title: "T", kicker: null, summary: null }, "es")).toMatchObject({ kicker: null, summary: null }); // never invents text where there was none
  });
});

describe("number style on the page", () => {
  it("groups and separates the way the reader's language does", async () => {
    testLanguage.cookie = "fr";
    await initLocale();
    expect(getFormat().oneDecimal(25.8)).toBe("25,8");
    expect(getFormat().decimal(28)).toBe("28");
    testLanguage.cookie = "en";
    await initLocale();
    expect(getFormat().oneDecimal(25.8)).toBe("25.8");
  });
});

// --- Source guards: the properties no render test would notice losing ---------------------------------------------

const root = join(__dirname, "..");
function walk(dir: string, match: (f: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, match, out);
    else if (match(p)) out.push(p);
  }
  return out;
}
const read = (p: string) => readFileSync(p, "utf8");

describe("every route sets its language", () => {
  it("calls initLocale first in each page, so a visitor never gets English by accident", () => {
    const pages = walk(join(root, "app"), (f) => /\/page\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(8);
    const inDefaultExport = (src: string) => src.slice(src.indexOf("export default")).includes("await initLocale()"); // not just in generateMetadata
    const missing = pages.filter((f) => !inDefaultExport(read(f))).map((f) => relative(root, f));
    expect(missing).toEqual([]);
  });
  it("does the same in each loading skeleton and the 404 page, which Next renders alongside the layout rather than after it", () => {
    const files = walk(join(root, "app"), (f) => /\/(loading|not-found)\.tsx$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(8);
    const missing = files.filter((f) => !/export default async function/.test(read(f)) || !read(f).includes("await initLocale()")).map((f) => relative(root, f));
    expect(missing).toEqual([]);
  });
  it("has no loading.tsx at the root of the app: it stops router.refresh() from applying on the league page, so live updates and anything else that refreshes would silently do nothing there", () => {
    expect(existsSync(join(root, "app/loading.tsx"))).toBe(false);
  });
  it("sets it in the layout too, and says which language the document is", () => {
    const layout = read(join(root, "app/layout.tsx"));
    expect(layout).toContain("await initLocale()");
    expect(layout).toMatch(/<html lang=\{/);
  });
});

describe("the browser bundle stays small", () => {
  const clientFiles = walk(root, (f) => /\.(tsx?)$/.test(f) && !/\/(tests|node_modules|\.next)\//.test(f) && /^["']use client["']/.test(read(f)));
  it("finds the client components", () => {
    expect(clientFiles.length).toBeGreaterThan(10);
  });
  it("never imports the server catalogs, the domain barrel or the components/ui barrel (each would ship every language to every visitor)", () => {
    const bad: string[] = [];
    // UI modules that read the server-side language: a client file importing one of these would drag the catalogs in.
    const serverOnlyUi = new Set(
      walk(join(root, "components/ui"), (f) => /\.tsx?$/.test(f) && /from ["']\.\/i18n["']/.test(read(f))).map((f) => f.replace(/\.tsx?$/, "")),
    );
    for (const f of clientFiles) {
      const src = read(f);
      const imports = [...src.matchAll(/^import (type )?[\s\S]*?from ["']([^"']+)["']/gm)].map((m) => ({ typeOnly: Boolean(m[1]), spec: m[2] }));
      for (const { typeOnly, spec } of imports) {
        if (typeOnly) continue;
        const name = relative(root, f);
        if (spec === "@/lib/domain") bad.push(`${name}: domain barrel`);
        if (spec === "@/components/ui" || spec === "./index" || (spec === "." && f.includes("/components/ui/"))) bad.push(`${name}: components/ui barrel`);
        if (/lib\/domain\/i18n\/(en|es|fr|index)$/.test(spec)) bad.push(`${name}: server catalog`);
        const target = spec.startsWith("@/") ? join(root, spec.slice(2)) : spec.startsWith(".") ? join(f, "..", spec) : null;
        if (target && serverOnlyUi.has(target)) bad.push(`${name}: server-only ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// --- The frame around every page, and the pages that aren't data ---------------------------------------------------

describe("the frame around the pages", () => {
  const markup = (el: ReactElement) => renderToStaticMarkup(el).replace(/></g, ">\n<").replace(/_R_[0-9a-z]+_/g, "_ID_");

  async function frame(locale: "en" | "es" | "fr") {
    testLanguage.cookie = locale;
    const { default: Layout } = await import("@/app/layout");
    return markup(await Layout({ children: <p>content</p> }));
  }
  async function standalone(locale: "en" | "es" | "fr", load: () => Promise<ReactElement>) {
    testLanguage.cookie = locale;
    await initLocale();
    return markup(<I18nProvider locale={locale}>{await load()}</I18nProvider>);
  }

  it("tells the browser, the screen reader and the search engine which language the document is in", async () => {
    expect(await frame("en")).toContain('<html lang="en-GB"');
    expect(await frame("es")).toContain('<html lang="es-419"');
    expect(await frame("fr")).toContain('<html lang="fr"');
  });
  it("puts the language button in the footer, beside the disclaimer, in every language", async () => {
    for (const locale of ["en", "es", "fr"] as const) {
      const out = await frame(locale);
      const footer = out.slice(out.indexOf("<footer"), out.indexOf("</footer>"));
      expect(footer, locale).toContain("<select");
      expect(visibleTexts(footer), locale).toContain({ en, es, fr }[locale].footer.disclaimer);
      expect(footer, locale).toContain(`<option value="${locale}" lang="${{ en: "en-GB", es: "es-419", fr: "fr" }[locale]}" selected="">`);
    }
  });
  it("translates the skip link, the navigation, the theme control and the footer", async () => {
    const english = await frame("en");
    for (const locale of ["es", "fr"] as const) {
      const out = await frame(locale);
      expect(englishLeaks(english, out, locale, { allow: ["The Lobster League", "The Lobster Times", "content", "Lobster"] }), locale).toEqual([]);
      expect(visibleTexts(out).length).toBeGreaterThan(8);
    }
  });

  const loading = [
    "@/app/bonus/loading", "@/app/club/[id]/loading", "@/app/fixtures/loading", "@/app/history/loading",
    "@/app/team/[entryId]/loading", "@/app/times/loading", "@/app/times/[issue]/loading",
  ];
  it.each(loading)("%s announces itself in the reader's language", async (path) => {
    // Next renders a loading skeleton alongside the layout, not after it, so nothing has set the language yet.
    // (`standalone` would do that for it and hide the bug, so go straight to the component.)
    const run = async () => {
      setRequestLocale("en");
      const element = await (await import(/* @vite-ignore */ path)).default();
      return element as ReactElement;
    };
    const direct = async (locale: "en" | "es" | "fr") => {
      testLanguage.cookie = locale;
      const element = await run();
      return markup(<I18nProvider locale={locale}>{element}</I18nProvider>);
    };
    const english = await direct("en");
    for (const locale of ["es", "fr"] as const) {
      const out = await direct(locale);
      expect(out).not.toBe(english);
      expect(englishLeaks(english, out, locale)).toEqual([]);
    }
  });

  it("explains a missing page in each language", async () => {
    const run = async () => (await import("@/app/not-found")).default();
    const english = await standalone("en", run);
    for (const locale of ["es", "fr"] as const) {
      const out = await standalone(locale, run);
      expect(out).toContain({ es, fr }[locale].notFound.title);
      expect(englishLeaks(english, out, locale)).toEqual([]);
    }
  });

  it.each(["@/app/error", "@/app/history/error"])("%s offers recovery in the reader's language", async (path) => {
    const run = async () => {
      const { default: Boundary } = await import(/* @vite-ignore */ path);
      return <Boundary error={new Error("boom")} reset={() => {}} />;
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const english = await standalone("en", run);
    for (const locale of ["es", "fr"] as const) {
      const out = await standalone(locale, run);
      expect(out).not.toBe(english);
      expect(englishLeaks(english, out, locale)).toEqual([]);
    }
  });
});

describe("the site's address", () => {
  it("sends www.lobsterleague.fyi to lobsterleague.fyi, keeping the path, and does nothing for any other host", async () => {
    const config = (await import("../next.config")).default;
    const rules = await config.redirects!();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ source: "/:path*", destination: "https://lobsterleague.fyi/:path*", permanent: true, has: [{ type: "host", value: "www.lobsterleague.fyi" }] });
  });
});
