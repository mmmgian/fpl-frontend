/**
 * The refresh control: it says when the page was last updated (visibly, from the first moment), never triggers a full
 * page load while offline, catches up when the connection returns, and follows the interval the server asks for.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "./axe";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ refresh }) }));

const setOnline = (value: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
const load = async () => (await import("@/components/ui/LiveRefresh")).LiveRefresh;

beforeEach(() => {
  vi.resetModules();
  refresh.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T14:03:00Z"));
  setOnline(true);
});
afterEach(() => {
  vi.useRealTimers();
  setOnline(true);
});

describe("the last-updated time", () => {
  it("is on the page from the start, not only after the first refresh", async () => {
    const LiveRefresh = await load();
    const { container } = render(<LiveRefresh enabled />);
    expect(container.textContent).toMatch(/Updated \d{1,2}:\d{2}/);
  });

  it("is plain visible text (a phone has no tooltip), not hidden for screen readers only", async () => {
    const css = (await import("node:fs")).readFileSync("components/ui/LiveRefresh.module.css", "utf8");
    const rule = css.split("\n").find((l) => l.startsWith(".status {")) ?? "";
    expect(rule).not.toMatch(/clip-path|position:\s*absolute/);
    expect(rule).toMatch(/tabular-nums/);
  });

  it("has nothing to say when the page does not refresh", async () => {
    const LiveRefresh = await load();
    const { container } = render(<LiveRefresh enabled={false} />);
    expect(container.textContent).not.toMatch(/Updated/);
  });
});

describe("offline", () => {
  it("does not refresh while offline (it would swap the page for the browser's error page) and says so", async () => {
    const LiveRefresh = await load();
    const { container } = render(<LiveRefresh enabled intervalMs={60_000} />);
    setOnline(false);
    await act(async () => vi.advanceTimersByTime(5 * 60_000));
    expect(refresh).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/Offline · showing \d{1,2}:\d{2}/);
  });

  it("shows offline as soon as the browser says so, and catches up the moment it is back", async () => {
    const LiveRefresh = await load();
    const { container } = render(<LiveRefresh enabled intervalMs={60_000} />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(container.textContent).toMatch(/Offline/);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toMatch(/Offline/);
  });

  it("a tap on the button while offline does nothing instead of reloading the page", async () => {
    const LiveRefresh = await load();
    render(<LiveRefresh enabled />);
    setOnline(false);
    act(() => screen.getByRole("button").click());
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("the interval the server asks for", () => {
  it("refreshes on the given interval, and follows a new one without stacking timers", async () => {
    const LiveRefresh = await load();
    const { rerender } = render(<LiveRefresh enabled intervalMs={60_000} />);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<LiveRefresh enabled intervalMs={15 * 60_000} />);
    refresh.mockClear();
    await act(async () => vi.advanceTimersByTime(14 * 60_000));
    expect(refresh).not.toHaveBeenCalled(); // the quiet gap: no minute-by-minute polling
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("accessibility", () => {
  it("passes axe in the normal and the offline state", async () => {
    const LiveRefresh = await load();
    vi.useRealTimers();
    const { container } = render(<LiveRefresh enabled />);
    await expectNoAxeViolations(container);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    await expectNoAxeViolations(container);
  });
});
