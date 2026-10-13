/**
 * Fortify: the app shell. FPL answering with something that isn't JSON, a live page mounted in a background tab, a
 * deadline FPL sent in an unreadable form or that has passed, the security headers, and reduced motion everywhere.
 */
import { act, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh }) }));

const setVisibility = (state: "visible" | "hidden", dispatch = true) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  if (dispatch) document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.resetModules();
  refresh.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setVisibility("visible", false);
});

describe("FPL answering with something that isn't JSON", () => {
  it.each([
    ["an HTML maintenance page", "<html><body>The game is being updated</body></html>", "text/html"],
    ["a cut-off body", '{"events": [', "application/json"],
    ["an empty body", "", "application/json"],
  ])("%s is an FPL error (the page's error state), not a SyntaxError", async (_, body, type) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { "content-type": type } })));
    const { fplGet, FplError } = await import("@/lib/fpl/http");
    const err: unknown = await fplGet("/bootstrap-static/").catch((e: unknown) => e);
    if (!(err instanceof FplError)) throw new Error(`expected an FplError, got ${String(err)}`);
    expect(err).toBeInstanceOf(FplError);
    expect(err.status).toBe(502);
  });

  it("still reads real JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 })));
    const { fplGet } = await import("@/lib/fpl/http");
    await expect(fplGet("/x/")).resolves.toEqual({ ok: true });
  });
});

describe("a live page opened in a background tab", () => {
  it("doesn't poll until the tab is looked at", async () => {
    vi.useFakeTimers();
    setVisibility("hidden", false);
    const { LiveRefresh } = await import("@/components/ui/LiveRefresh");
    render(<LiveRefresh enabled intervalMs={60_000} minFocusGapMs={15_000} />);
    await act(async () => vi.advanceTimersByTime(5 * 60_000));
    expect(refresh).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    expect(refresh).toHaveBeenCalledTimes(1); // stale after five minutes: refreshed on sight
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("the deadline countdown", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] }));

  it("never shows NaN when FPL sends a deadline it can't read", async () => {
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    const { DeadlineTimer } = await import("@/components/ui/DeadlineTimer");
    const { container } = render(<DeadlineTimer at="soon" now="2026-10-11T12:00:00Z" gameweek="Gameweek 7" />);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(container.textContent).not.toMatch(/NaN/);
    expect(container.querySelector('[role="timer"]')).toBeNull();
  });

  it("stops ticking once the deadline has passed", async () => {
    vi.setSystemTime(new Date("2026-10-17T09:59:58Z"));
    const { DeadlineTimer } = await import("@/components/ui/DeadlineTimer");
    render(<DeadlineTimer at="2026-10-17T10:00:00Z" now="2026-10-17T09:59:58Z" gameweek="Gameweek 7" />);
    await act(async () => vi.advanceTimersByTime(5000));
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("security headers", () => {
  it("every page refuses framing, plugins, foreign base URLs and foreign form targets, and turns off unused APIs", async () => {
    const { default: config } = await import("@/next.config");
    const rules = await config.headers!();
    const all = rules.find((r) => r.source === "/:path*")!.headers;
    const get = (key: string) => all.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value ?? "";
    const csp = get("Content-Security-Policy");
    for (const d of ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) expect(csp).toContain(d);
    expect(get("Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("reduced motion", () => {
  const css = (file: string) => readFileSync(join(process.cwd(), "app", file), "utf8");

  it.each(["globals.css", "trip.css"])("%s stills every element and both pseudo-elements", (file) => {
    const blocks = [...css(file).matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
    expect(blocks).toMatch(/\*::before/);
    expect(blocks).toMatch(/\*::after/);
  });
});
