import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Flipbook, type FlipbookPage } from "@/components/ui/Flipbook";
import { expectNoAxeViolations } from "./axe";

const makePages = (n: number, withText = true): FlipbookPage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    src: `/p-${i + 1}-m.webp`,
    srcSet: `/p-${i + 1}-s.webp 240w, /p-${i + 1}-m.webp 640w`,
    thumb: `/p-${i + 1}-s.webp`,
    width: 640,
    height: 905,
    fullSrc: `/p-${i + 1}-l.webp`,
    text: withText ? `Headline ${i + 1}\nSecond line ${i + 1}` : undefined,
  }));

const status = () => screen.getAllByRole("status").find((el) => el.getAttribute("aria-live") === "polite")!;
const prevBtn = () => screen.getByRole("button", { name: /^previous/i });
const nextBtn = () => screen.getByRole("button", { name: /^next/i });
/** The page counter, ignoring the hidden alternative for the other layout. */
const counter = (c: HTMLElement) => c.querySelector("p[class*='status']")!;

describe("Flipbook basics", () => {
  it("shows the first page with a useful name, srcset and reserved size", () => {
    render(<Flipbook pages={makePages(5)} label="Issue 5" />);
    const img = screen.getByRole("img", { name: "Page 1 of 5" });
    expect(img).toHaveAttribute("src", "/p-1-m.webp");
    expect(img).toHaveAttribute("srcset", expect.stringContaining("240w"));
    expect(img).toHaveAttribute("width", "640");
    expect(img).toHaveAttribute("loading", "eager"); // the page being read is not lazy
    expect(screen.getByRole("region", { name: "Issue 5" })).toHaveAttribute("aria-roledescription", "flipbook");
  });

  it("clamps an out-of-range or fractional starting page", () => {
    const { rerender } = render(<Flipbook pages={makePages(5)} label="x" defaultPage={99} />);
    expect(screen.getByRole("img", { name: "Page 5 of 5" })).toBeInTheDocument();
    rerender(<Flipbook key="b" pages={makePages(5)} label="x" defaultPage={-3} />);
    expect(screen.getByRole("img", { name: "Page 1 of 5" })).toBeInTheDocument();
  });

  it("turns pages with the buttons and says where you are", async () => {
    const user = userEvent.setup();
    const { container } = render(<Flipbook pages={makePages(5)} label="x" layout="single" />);
    expect(counter(container)).toHaveTextContent("Page 1 of 5");
    await user.click(nextBtn());
    expect(screen.getByRole("img", { name: "Page 2 of 5" })).toBeInTheDocument();
    expect(counter(container)).toHaveTextContent("Page 2 of 5");
    await user.click(prevBtn());
    expect(screen.getByRole("img", { name: "Page 1 of 5" })).toBeInTheDocument();
  });

  it("keeps the button focusable at the ends (aria-disabled, not disabled) and ignores clicks there", async () => {
    const user = userEvent.setup();
    render(<Flipbook pages={makePages(2)} label="x" layout="single" />);
    expect(prevBtn()).toHaveAttribute("aria-disabled", "true");
    expect(prevBtn()).not.toBeDisabled();
    await user.click(nextBtn()); // a real click moves focus to the button, which is then on the last page
    expect(nextBtn()).toHaveAttribute("aria-disabled", "true");
    expect(nextBtn()).toHaveFocus(); // focus is not lost when the button becomes inert (we never called .focus() ourselves)
    await user.click(nextBtn());
    expect(screen.getByRole("img", { name: "Page 2 of 2" })).toBeInTheDocument();
  });

  it("announces the new page to screen readers after a turn, but not on first render", async () => {
    const user = userEvent.setup();
    render(<Flipbook pages={makePages(5)} label="x" layout="single" />);
    expect(status()).toHaveTextContent("");
    await user.click(nextBtn());
    expect(status()).toHaveTextContent("Page 2 of 5");
  });
});

describe("keyboard and touch", () => {
  it("turns with the arrow, page and home/end keys", async () => {
    const user = userEvent.setup();
    render(<Flipbook pages={makePages(6)} label="x" layout="single" />);
    const viewport = screen.getByRole("group", { name: "Pages" });
    viewport.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("img", { name: "Page 3 of 6" })).toBeInTheDocument();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("img", { name: "Page 2 of 6" })).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(screen.getByRole("img", { name: "Page 6 of 6" })).toBeInTheDocument();
    await user.keyboard("{Home}");
    expect(screen.getByRole("img", { name: "Page 1 of 6" })).toBeInTheDocument();
    await user.keyboard("{PageDown}{PageDown}{PageUp}");
    expect(screen.getByRole("img", { name: "Page 2 of 6" })).toBeInTheDocument();
  });

  it("leaves browser shortcuts alone", async () => {
    const user = userEvent.setup();
    render(<Flipbook pages={makePages(4)} label="x" layout="single" />);
    screen.getByRole("group", { name: "Pages" }).focus();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}"); // Alt+Right is "browser forward"
    expect(screen.getByRole("img", { name: "Page 1 of 4" })).toBeInTheDocument();
  });

  it("does not turn pages while typing in the page-number box", async () => {
    const user = userEvent.setup();
    render(<Flipbook pages={makePages(5)} label="x" layout="single" />);
    await user.click(screen.getByLabelText("Go to page"));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("img", { name: "Page 1 of 5" })).toBeInTheDocument();
  });

  it("turns on a horizontal swipe, not on a vertical scroll", () => {
    render(<Flipbook pages={makePages(5)} label="x" layout="single" />);
    const viewport = screen.getByRole("group", { name: "Pages" });
    const drag = (dx: number, dy: number, pointerType = "touch") => {
      fireEvent.pointerDown(viewport, { clientX: 200, clientY: 200, pointerId: 1, pointerType });
      fireEvent.pointerUp(viewport, { clientX: 200 + dx, clientY: 200 + dy, pointerId: 1, pointerType });
    };
    drag(0, -120); // scrolling down the page
    drag(-20, 0); // too short
    drag(-120, 0, "mouse"); // mouse drags select text instead
    expect(screen.getByRole("img", { name: "Page 1 of 5" })).toBeInTheDocument();
    drag(-120, 0);
    expect(screen.getByRole("img", { name: "Page 2 of 5" })).toBeInTheDocument();
    drag(120, 10);
    expect(screen.getByRole("img", { name: "Page 1 of 5" })).toBeInTheDocument();
  });
});

describe("jump and thumbnails", () => {
  it("jumps to a typed page and ignores nonsense", async () => {
    const user = userEvent.setup();
    render(<Flipbook pages={makePages(10)} label="x" layout="single" />);
    const box = screen.getByLabelText("Go to page");
    await user.type(box, "7{Enter}");
    expect(screen.getByRole("img", { name: "Page 7 of 10" })).toBeInTheDocument();
    await user.type(box, "99{Enter}"); // clamps to the last page
    expect(screen.getByRole("img", { name: "Page 10 of 10" })).toBeInTheDocument();
    await user.type(box, "{Enter}"); // empty: nothing happens
    await user.type(box, "-4{Enter}");
    expect(screen.getByRole("img", { name: "Page 1 of 10" })).toBeInTheDocument();
  });

  it("opens thumbnails, marks the current page and jumps on click", async () => {
    const user = userEvent.setup();
    render(<Flipbook pages={makePages(6)} label="Issue" layout="single" />);
    const toggle = screen.getByRole("button", { name: "Thumbnails" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide thumbnails" })).toHaveAttribute("aria-expanded", "true");
    const nav = screen.getByRole("navigation", { name: "Issue: page thumbnails" });
    expect(within(nav).getAllByRole("button")).toHaveLength(6);
    expect(within(nav).getByRole("button", { name: "Go to page 1" })).toHaveAttribute("aria-current", "true");
    await user.click(within(nav).getByRole("button", { name: "Go to page 4" }));
    expect(screen.getByRole("img", { name: "Page 4 of 6" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Go to page 4" })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("button", { name: "Go to page 1" })).not.toHaveAttribute("aria-current");
  });
});

describe("controlled use", () => {
  it("reports changes and shows exactly the page it is given", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const { rerender } = render(<Flipbook pages={makePages(5)} label="x" layout="single" page={2} onPageChange={onPageChange} />);
    expect(screen.getByRole("img", { name: "Page 2 of 5" })).toBeInTheDocument();
    await user.click(nextBtn());
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(screen.getByRole("img", { name: "Page 2 of 5" })).toBeInTheDocument(); // the parent hasn't accepted the change
    rerender(<Flipbook pages={makePages(5)} label="x" layout="single" page={3} onPageChange={onPageChange} />);
    expect(screen.getByRole("img", { name: "Page 3 of 5" })).toBeInTheDocument();
  });
  it("clamps a controlled page that is out of range", () => {
    render(<Flipbook pages={makePages(3)} label="x" page={40} />);
    expect(screen.getByRole("img", { name: "Page 3 of 3" })).toBeInTheDocument();
  });
  it("reports uncontrolled changes too", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Flipbook pages={makePages(3)} label="x" layout="single" onPageChange={onPageChange} />);
    await user.click(nextBtn());
    expect(onPageChange).toHaveBeenCalledExactlyOnceWith(2);
  });
});

describe("spreads (wide layout)", () => {
  it("shows the cover alone, then facing pages, and steps a spread at a time", async () => {
    const user = userEvent.setup();
    const { container } = render(<Flipbook pages={makePages(6)} label="x" layout="double" />);
    const figures = () => container.querySelectorAll("figure");
    expect(figures()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Next spread" }));
    expect(figures()).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Page 2 of 6" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Page 3 of 6" })).toBeInTheDocument();
    expect(status()).toHaveTextContent("Pages 2 and 3 of 6");
    await user.click(screen.getByRole("button", { name: "Next spread" }));
    expect(screen.getByRole("img", { name: "Page 4 of 6" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Page 5 of 6" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous spread" }));
    expect(screen.getByRole("img", { name: "Page 2 of 6" })).toBeInTheDocument();
  });

  it("only the page being read loads eagerly", () => {
    render(<Flipbook pages={makePages(6)} label="x" layout="double" defaultPage={3} />);
    expect(screen.getByRole("img", { name: "Page 3 of 6" })).toHaveAttribute("loading", "eager");
    expect(screen.getByRole("img", { name: "Page 2 of 6" })).toHaveAttribute("loading", "lazy");
  });
});

describe("edge cases", () => {
  it("a one-page document needs no navigation", () => {
    render(<Flipbook pages={makePages(1)} label="Single" />);
    expect(screen.getByRole("img", { name: "Page 1 of 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next|previous/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /thumbnails/i })).toBeNull();
    expect(screen.queryByLabelText("Go to page")).toBeNull();
  });

  it("says so when there are no pages", () => {
    render(<Flipbook pages={[]} label="Empty" />);
    expect(screen.getByRole("status")).toHaveTextContent("There are no pages to show.");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("offers a text alternative only when there is text, and shows it", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Flipbook pages={makePages(3, false)} label="x" />);
    expect(screen.queryByText("Read as text")).toBeNull();
    unmount();
    render(<Flipbook pages={makePages(3)} label="x" layout="single" />);
    await user.click(screen.getByText("Read as text"));
    expect(screen.getByText("Headline 1")).toBeInTheDocument();
    expect(screen.getByText("Second line 1")).toBeInTheDocument();
    await user.click(nextBtn());
    expect(screen.getByText("Headline 2")).toBeInTheDocument();
  });

  it("says a page has no text rather than showing an empty box", async () => {
    const user = userEvent.setup();
    const pages = makePages(2);
    pages[0].text = "   ";
    render(<Flipbook pages={pages} label="x" layout="single" />);
    await user.click(screen.getByText("Read as text"));
    expect(screen.getByText("This page has no text.")).toBeInTheDocument();
  });

  it("links to the full-size page and renders extra actions", () => {
    render(<Flipbook pages={makePages(3)} label="x" actions={<a href="/x.pdf">Download</a>} />);
    expect(screen.getByRole("link", { name: "Open page 1 full size" })).toHaveAttribute("href", "/p-1-l.webp");
    expect(screen.getByRole("link", { name: "Open page 1 full size" })).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument();
  });

  it("recovers from a page that fails to load", async () => {
    const user = userEvent.setup();
    render(<Flipbook pages={makePages(3)} label="x" fallbackHref="/issue.pdf" />);
    fireEvent.error(screen.getByRole("img", { name: "Page 1 of 3" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This page couldn't be loaded.");
    expect(screen.getByRole("link", { name: "Open the PDF instead" })).toHaveAttribute("href", "/issue.pdf");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    const img = screen.getByRole("img", { name: "Page 1 of 3" });
    expect(img.getAttribute("src")).toContain("retry=1"); // cache-busted, so a transient failure can actually recover
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/** A controllable matchMedia: `layout="auto"` follows it, and `set()` simulates a resize. */
function mockViewport(initialWide: boolean) {
  let wide = initialWide;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() { return wide; },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  return { set: (w: boolean) => { wide = w; listeners.forEach((fn) => fn()); } };
}

describe("auto layout follows the viewport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("steps a spread on a wide screen and a page on a narrow one", async () => {
    const user = userEvent.setup();
    mockViewport(true);
    const { unmount } = render(<Flipbook pages={makePages(8)} label="x" defaultPage={3} />);
    await user.click(prevBtn()); // wide: back from (2,3) to the cover
    expect(screen.getByRole("img", { name: "Page 1 of 8" })).toBeInTheDocument();
    unmount();
    mockViewport(false);
    render(<Flipbook pages={makePages(8)} label="x" defaultPage={3} />);
    await user.click(prevBtn()); // narrow: just page 2
    expect(screen.getByRole("img", { name: "Page 2 of 8" })).toBeInTheDocument();
  });

  it("keeps the page when the window is resized, on an odd page too, and changes how far a turn goes", async () => {
    const user = userEvent.setup();
    const viewport = mockViewport(true);
    render(<Flipbook pages={makePages(9)} label="x" defaultPage={5} />);
    expect(status()).toHaveTextContent(""); // nothing announced just because we resized or rendered
    expect(screen.getByRole("button", { name: "Next spread" })).toBeInTheDocument();
    act(() => viewport.set(false)); // resized below the breakpoint, on page 5 (the right half of the (4,5) spread)
    expect(screen.getByRole("img", { name: "Page 5 of 9" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("img", { name: "Page 6 of 9" })).toBeInTheDocument(); // one page, not a spread
    act(() => viewport.set(true));
    await user.click(screen.getByRole("button", { name: "Next spread" }));
    expect(screen.getByRole("img", { name: "Page 8 of 9" })).toBeInTheDocument(); // (6,7) -> (8,9)
  });
});

describe("robustness of the kit itself", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("survives `pages` getting shorter while mounted", () => {
    const { rerender } = render(<Flipbook pages={makePages(8)} label="x" defaultPage={7} layout="single" />);
    expect(screen.getByRole("img", { name: "Page 7 of 8" })).toBeInTheDocument();
    rerender(<Flipbook pages={makePages(3)} label="x" defaultPage={7} layout="single" />);
    expect(screen.getByRole("img", { name: "Page 3 of 3" })).toBeInTheDocument(); // clamped, no crash
    rerender(<Flipbook pages={[]} label="x" layout="single" />);
    expect(screen.getByRole("status")).toHaveTextContent("There are no pages to show.");
  });

  it("announces only what is really showing: not a refused turn, but a change the parent makes", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn(); // the parent ignores every request
    const { rerender } = render(<Flipbook pages={makePages(5)} label="x" layout="single" page={2} onPageChange={onPageChange} />);
    await user.click(nextBtn());
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(screen.getByRole("img", { name: "Page 2 of 5" })).toBeInTheDocument();
    expect(status()).toHaveTextContent(""); // still on page 2, so nothing is said about page 3
    rerender(<Flipbook pages={makePages(5)} label="x" layout="single" page={4} onPageChange={onPageChange} />);
    expect(status()).toHaveTextContent("Page 4 of 5"); // the parent moved it itself: that is announced
  });

  it("warms the next page, not the whole neighbourhood, and only when idle", () => {
    vi.useFakeTimers();
    const srcs: string[] = [];
    vi.stubGlobal("Image", class { set src(v: string) { srcs.push(v); } set srcset(_v: string) {} set sizes(_v: string) {} });
    render(<Flipbook pages={makePages(6)} label="x" layout="single" defaultPage={2} />);
    expect(srcs).toEqual([]); // nothing before the browser is idle
    act(() => { vi.advanceTimersByTime(400); });
    expect([...srcs].sort()).toEqual(["/p-1-m.webp", "/p-3-m.webp"]); // next and previous, not the spread's other pages
    vi.useRealTimers();
  });

  it("retries only the page that failed, and ignores an answer meant for a previous loader", async () => {
    const user = userEvent.setup();
    const calls: number[] = [];
    const loadText = vi.fn(async (n: number) => {
      calls.push(n);
      if (n === 3 && calls.filter((c) => c === 3).length === 1) throw new Error("flaky");
      return `Text of ${n}`;
    });
    render(<Flipbook pages={makePages(4, false)} label="x" layout="double" defaultPage={2} loadText={loadText} />);
    await user.click(screen.getByText("Read as text"));
    expect(await screen.findByText("Text of 2")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be loaded");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Text of 3")).toBeInTheDocument();
    expect(calls).toEqual([2, 3, 3]); // page 2 was not fetched again, and it did not flip back to "Loading"
    expect(screen.getByText("Text of 2")).toBeInTheDocument();
  });

  it("starts afresh when given a different loader, whatever the old one later says", async () => {
    const user = userEvent.setup();
    let late!: (t: string) => void;
    const slow = () => new Promise<string>((r) => (late = r));
    const { rerender } = render(<Flipbook pages={makePages(2, false)} label="x" layout="single" loadText={slow} />);
    await user.click(screen.getByText("Read as text"));
    rerender(<Flipbook pages={makePages(2, false)} label="x" layout="single" loadText={async () => "From the new document"} />);
    expect(await screen.findByText("From the new document")).toBeInTheDocument();
    late("From the old document"); // arrives after the switch
    await Promise.resolve();
    expect(screen.queryByText("From the old document")).toBeNull();
    expect(screen.getByText("From the new document")).toBeInTheDocument();
  });

  it("a browser that refuses full screen does not cause an unhandled rejection", async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
    const original = HTMLElement.prototype.requestFullscreen;
    HTMLElement.prototype.requestFullscreen = vi.fn().mockRejectedValue(new Error("denied"));
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    render(<Flipbook pages={makePages(3)} label="x" />);
    await user.click(await screen.findByRole("button", { name: "Full screen" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
    process.off("unhandledRejection", unhandled);
    HTMLElement.prototype.requestFullscreen = original;
    Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: undefined });
  });

  it("a failed page keeps its retina candidates when retried", () => {
    render(<Flipbook pages={makePages(2)} label="x" />);
    fireEvent.error(screen.getByRole("img", { name: "Page 1 of 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const img = screen.getByRole("img", { name: "Page 1 of 2" });
    expect(img.getAttribute("srcset")).toBe("/p-1-s.webp?retry=1 240w, /p-1-m.webp?retry=1 640w");
  });
});

describe("text loaded on demand", () => {
  it("fetches nothing until the reader opens it, then only the page in view, once", async () => {
    const user = userEvent.setup();
    const loadText = vi.fn(async (n: number) => `Loaded text for ${n}\nsecond line`);
    render(<Flipbook pages={makePages(5, false)} label="x" layout="single" loadText={loadText} />);
    expect(loadText).not.toHaveBeenCalled(); // the cost is paid only by people who want it
    await user.click(screen.getByText("Read as text"));
    expect(await screen.findByText("Loaded text for 1")).toBeInTheDocument();
    expect(screen.getByText("second line")).toBeInTheDocument();
    expect(loadText).toHaveBeenCalledExactlyOnceWith(1);
    await user.click(nextBtn());
    expect(await screen.findByText("Loaded text for 2")).toBeInTheDocument();
    await user.click(prevBtn());
    expect(await screen.findByText("Loaded text for 1")).toBeInTheDocument();
    expect(loadText.mock.calls.map((c) => c[0])).toEqual([1, 2]); // page 1 was not requested a second time
  });

  it("shows a loading state while waiting", async () => {
    const user = userEvent.setup();
    let resolve!: (t: string) => void;
    render(<Flipbook pages={makePages(2, false)} label="x" layout="single" loadText={() => new Promise<string>((r) => (resolve = r))} />);
    await user.click(screen.getByText("Read as text"));
    expect(screen.getByText("Loading the text…")).toBeInTheDocument();
    resolve("Arrived");
    expect(await screen.findByText("Arrived")).toBeInTheDocument();
    expect(screen.queryByText("Loading the text…")).toBeNull();
  });

  it("offers a retry when loading fails, and recovers", async () => {
    const user = userEvent.setup();
    const loadText = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("Back online");
    render(<Flipbook pages={makePages(2, false)} label="x" layout="single" loadText={loadText} />);
    await user.click(screen.getByText("Read as text"));
    expect(await screen.findByRole("alert")).toHaveTextContent("The text couldn't be loaded.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Back online")).toBeInTheDocument();
    expect(loadText).toHaveBeenCalledTimes(2);
  });

  it("says a page has no text when the loader returns nothing", async () => {
    const user = userEvent.setup();
    render(<Flipbook pages={makePages(2, false)} label="x" layout="single" loadText={async () => ""} />);
    await user.click(screen.getByText("Read as text"));
    expect(await screen.findByText("This page has no text.")).toBeInTheDocument();
  });

  it("loads both pages of a spread, and prefers text that came with the page", async () => {
    const user = userEvent.setup();
    const pages = makePages(4, false);
    pages[2].text = "Static text for page 3";
    const loadText = vi.fn(async (n: number) => `Loaded ${n}`);
    render(<Flipbook pages={pages} label="x" layout="double" defaultPage={2} loadText={loadText} />);
    await user.click(screen.getByText("Read as text"));
    expect(await screen.findByText("Loaded 2")).toBeInTheDocument();
    expect(screen.getByText("Static text for page 3")).toBeInTheDocument();
    expect(loadText).toHaveBeenCalledExactlyOnceWith(2); // page 3 needed no request
  });
});

describe("rendering without JavaScript", () => {
  it("server-renders the current page as a plain image", () => {
    const html = renderToString(<Flipbook pages={makePages(5)} label="Issue" defaultPage={3} />);
    expect(html).toContain('src="/p-3-m.webp"');
    expect(html).toContain('width="640"');
    expect(html).toContain("aspect-ratio");
    expect(html).toContain('aria-roledescription="flipbook"');
  });
  it("server-renders the partner page of a spread so CSS can reveal it on wide screens", () => {
    const html = renderToString(<Flipbook pages={makePages(5)} label="Issue" defaultPage={2} />);
    expect(html).toContain("/p-2-m.webp");
    expect(html).toContain("/p-3-m.webp");
  });
});

describe("accessibility", () => {
  it("has no axe violations: default, thumbnails open, error state", async () => {
    const user = userEvent.setup();
    const { container } = render(<Flipbook pages={makePages(5)} label="Issue 5" actions={<a href="/x.pdf">Download PDF</a>} />);
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Thumbnails" }));
    await user.click(screen.getByText("Read as text"));
    await expectNoAxeViolations(container);
    fireEvent.error(screen.getByRole("img", { name: "Page 1 of 5" }));
    await expectNoAxeViolations(container);
  });
});
