"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "../Button";
import { useControllableState, useIsClient, useMediaQuery, useSwipe } from "./hooks";
import { PageImage } from "./PageImage";
import { PageThumbs } from "./PageThumbs";
import { useT } from "../I18nProvider";
import { canStep, clampPage, describePages, spreadOf, step } from "./spreads";
import styles from "./Flipbook.module.css";

export interface FlipbookPage {
  /** Stable key, usually the page number. */
  id: string | number;
  /** The image to use when `srcSet` isn't supported or doesn't match. */
  src: string;
  /** Size candidates, e.g. "p-001-s.webp 240w, p-001-m.webp 640w, p-001-l.webp 1080w". */
  srcSet?: string;
  /** Small image for the thumbnail strip. Falls back to `src`. */
  thumb?: string;
  /** Intrinsic pixel size. Reserves the space so nothing shifts while images load. */
  width: number;
  height: number;
  /** Accessible name for the image. Defaults to "Page N of M". */
  label?: string;
  /** The page's text, one line per line, offered as a text alternative. For large documents use `loadText` instead. */
  text?: string;
  /** Link to the full-size image, offered as "Open page full size". */
  fullSrc?: string;
}

export interface FlipbookProps {
  pages: FlipbookPage[];
  /** Accessible name for the whole viewer, e.g. "The Lobster Times, issue 5". */
  label: string;
  /** Current page (1-based). Pass it, with `onPageChange`, to control the viewer; omit it to let it manage itself. */
  page?: number;
  /** First page to show when uncontrolled. Out-of-range values are clamped. */
  defaultPage?: number;
  /** Called with the new page after every turn, jump or thumbnail click. */
  onPageChange?: (page: number) => void;
  /**
   * "auto": two-page spreads from 960px up, one page below. "single" / "double" force a layout. Both layouts
   * are produced by CSS, so the server-rendered markup is correct before any JavaScript runs.
   */
  layout?: "auto" | "single" | "double";
  /**
   * Load a page's text on demand. It is called only once the reader opens "Read as text", for the pages in view,
   * so a long document doesn't ship every page's text up front. Resolve with "" for a page without text; reject
   * if it can't be loaded (a retry is offered). Used for pages that have no static `text`.
   */
  loadText?: (page: number) => Promise<string>;
  /** Extra controls on the toolbar, e.g. a download link. */
  actions?: ReactNode;
  /** Offered if a page image can't load (e.g. the PDF). */
  fallbackHref?: string;
  /** The language the pages' text is written in, if that isn't the page's (a screen reader needs to know). */
  textLang?: string;
  className?: string;
}

const WIDE_QUERY = "(min-width: 960px)";
/** Matches the CSS: a spread's page is at most 540px wide; a single page is at most 560px, less the stage's padding. */
const SIZES = "(min-width: 960px) 540px, min(560px, calc(100vw - 48px))";

/** Elements that use the arrow keys themselves (text fields, sliders, radio groups, tabs, menus). */
const ARROW_OWNERS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="radiogroup"], [role="radio"], [role="tablist"], [role="tab"], [role="slider"], [role="listbox"], [role="menu"], [role="menubar"], [role="grid"], [role="tree"]';
export const ownsArrows = (el: Element): boolean => el.closest(ARROW_OWNERS) !== null;

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

type TextState = { status: "loading" } | { status: "ready"; text: string } | { status: "error" };

export function Flipbook({ pages, label, page, defaultPage = 1, onPageChange, layout = "auto", loadText, actions, fallbackHref, textLang, className }: FlipbookProps) {
  const t = useT().flipbook;
  const count = pages.length;
  const uid = useId();
  const rootRef = useRef<HTMLElement>(null);
  const [storedPage, setCurrent] = useControllableState(page, defaultPage, onPageChange);
  const current = clampPage(storedPage, count); // `pages` can shrink while mounted, and a parent can pass anything
  const autoWide = useMediaQuery(WIDE_QUERY);
  const wide = layout === "double" ? true : layout === "single" ? false : autoWide;

  // The turn animation follows the page that is actually shown: adjusting state during render is React's
  // supported way to derive it from a change in `current`, so the direction is right on the very frame it changes.
  const [direction, setDirection] = useState<"none" | "next" | "prev">("none"); // no animation on first paint
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setDirection(current > seen ? "next" : "prev");
  }
  const [announcement, setAnnouncement] = useState("");
  const [showThumbs, setShowThumbs] = useState(false);
  const [jump, setJump] = useState("");
  const canFullscreen = useIsClient() && typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
  const [fullscreen, setFullscreen] = useState(false);

  const shown = spreadOf(current, count); // the pages a wide layout shows; a narrow one shows only `current`

  // Text alternative, loaded on demand: only once opened, only for the pages in view, once per page.
  // Each page has its own attempt number, so a retry touches one page and an answer to an older attempt
  // (or to a previous `loadText`) is ignored instead of overwriting a newer one.
  const [textOpen, setTextOpen] = useState(false);
  const [texts, setTexts] = useState<Record<number, TextState>>({});
  const attempts = useRef<Record<number, number>>({});
  const requested = useRef(new Set<string>());
  const generation = useRef(0);
  const [retryTick, setRetryTick] = useState(0); // bumped by a retry so the loading effect runs again
  useEffect(() => {
    generation.current += 1; // a new loader means new documents: forget everything about the old one
    attempts.current = {};
    requested.current.clear();
    setTexts({});
  }, [loadText]);

  // Only the pages the reader can see: a narrow layout hides the spread's partner page with CSS.
  const shownKey = (wide ? shown : [current]).join(",");
  useEffect(() => {
    if (!loadText || !textOpen) return;
    const mine = generation.current;
    for (const n of shownKey.split(",").map(Number)) {
      const attempt = attempts.current[n] ?? 0;
      const key = `${n}:${attempt}`;
      if (pages[n - 1]?.text !== undefined || requested.current.has(key)) continue;
      requested.current.add(key);
      setTexts((t) => ({ ...t, [n]: { status: "loading" } }));
      const fresh = () => generation.current === mine && (attempts.current[n] ?? 0) === attempt;
      loadText(n).then(
        (text) => fresh() && setTexts((t) => ({ ...t, [n]: { status: "ready", text } })),
        () => fresh() && setTexts((t) => ({ ...t, [n]: { status: "error" } })),
      );
    }
  }, [loadText, textOpen, shownKey, pages, retryTick]);
  const retryText = (n: number) => {
    attempts.current[n] = (attempts.current[n] ?? 0) + 1;
    setTexts((t) => Object.fromEntries(Object.entries(t).filter(([k]) => Number(k) !== n)));
    setRetryTick((x) => x + 1);
  };

  const go = (next: number) => {
    const target = clampPage(next, count);
    if (target !== current) setCurrent(target);
  };
  const turn = (dir: 1 | -1) => go(step(current, count, dir, wide));

  // Announce what is now showing to screen readers: after real changes only, not on first render, and
  // whoever caused it (a click, a key, or the parent changing `page`).
  const announced = useRef(current);
  useEffect(() => {
    if (announced.current === current) return;
    announced.current = current;
    setAnnouncement(describePages(wide ? spreadOf(current, count) : [current], count, t));
  }, [current, count, wide, t]);

  const swipe = useSwipe(turn);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const keys: Record<string, () => void> = {
      ArrowRight: () => turn(1),
      PageDown: () => turn(1),
      ArrowLeft: () => turn(-1),
      PageUp: () => turn(-1),
      Home: () => go(1),
      End: () => go(wide ? spreadOf(count, count)[0] : count),
    };
    const action = keys[e.key];
    if (!action) return;
    e.preventDefault();
    action();
  };

  // ← and → turn the page from anywhere on the page, not only once the pages have focus, as in any reader.
  // Keys meant for something else are left alone: typing, a control that uses arrows itself, or a modifier.
  const turnRef = useRef(turn);
  turnRef.current = turn;
  useEffect(() => {
    if (count < 2) return;
    const onDocKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      if (!(e.target instanceof Element) || ownsArrows(e.target)) return;
      e.preventDefault();
      turnRef.current(e.key === "ArrowRight" ? 1 : -1);
    };
    document.addEventListener("keydown", onDocKey);
    return () => document.removeEventListener("keydown", onDocKey);
  }, [count]);

  const submitJump = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(jump);
    if (jump.trim() !== "" && Number.isInteger(n)) go(n);
    setJump("");
  };

  // Warm the cache for the page a reader is most likely to turn to: the next one (and the previous), as the
  // current layout would show them. Deferred to idle time so it never competes with the page being read.
  const warm = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    const neighbours = ([1, -1] as const)
      .map((d) => step(current, count, d, wide))
      .filter((n) => n !== current)
      .flatMap((n) => (wide ? spreadOf(n, count) : [n]));
    const run = () => {
      warm.current = [...new Set(neighbours)].map((n) => {
        const img = new Image();
        const p = pages[n - 1];
        if (p.srcSet) {
          img.srcset = p.srcSet;
          img.sizes = SIZES;
        }
        img.src = p.src;
        return img;
      });
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, 300);
    return () => clearTimeout(id);
  }, [current, wide, count, pages]);

  // Keep the thumbnail for the page on show in view.
  const thumbsId = `${uid}-thumbs`;
  useEffect(() => {
    if (!showThumbs) return;
    rootRef.current?.querySelector<HTMLElement>(`#${CSS.escape(thumbsId)} [aria-current="true"]`)?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [showThumbs, current, thumbsId]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    // Browsers refuse in some contexts (iframes, permissions policy); the button simply does nothing then.
    const request = document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen();
    request?.catch(() => {});
  };

  if (count === 0) {
    return (
      <p className={styles.empty} role="status">
        {t.noPages}
      </p>
    );
  }

  const currentPage = pages[current - 1];
  const hasText = Boolean(loadText) || pages.some((p) => p.text?.trim());
  const single = count === 1;
  const atStart = !canStep(current, count, -1, wide);
  const atEnd = !canStep(current, count, 1, wide);

  return (
    <section ref={rootRef} className={cx(styles.root, className)} data-layout={layout} data-fullscreen={fullscreen || undefined} aria-roledescription={t.roleDescription} aria-label={label}>
      <div
        className={styles.viewport}
        role="group"
        tabIndex={0}
        aria-label={t.pages}
        aria-describedby={single ? undefined : `${uid}-help`}
        aria-keyshortcuts={single ? undefined : "ArrowLeft ArrowRight PageUp PageDown Home End"}
        onKeyDown={onKeyDown}
        {...swipe}
      >
        <div key={shown.join("-")} className={styles.spread} data-direction={direction}>
          {shown.map((n) => {
            const p = pages[n - 1];
            return (
              <figure key={p.id} className={styles.slot} data-current={n === current || undefined}>
                <PageImage
                  src={p.src}
                  srcSet={p.srcSet}
                  sizes={SIZES}
                  alt={p.label ?? t.pageOf(n, count)}
                  width={p.width}
                  height={p.height}
                  priority={n === current}
                  fallbackHref={fallbackHref}
                />
              </figure>
            );
          })}
        </div>
      </div>

      {single ? null : (
        <span id={`${uid}-help`} className="sr-only">
          {t.help}
        </span>
      )}

      <div className={styles.controls} role="group" aria-label={t.controls}>
        {single ? null : (
          <Button className={styles.turn} aria-label={wide ? t.previousSpread : t.previousPage} aria-disabled={atStart || undefined} onClick={() => !atStart && turn(-1)}>
            <span aria-hidden="true">←</span> <span className={styles.turnText}>{t.previous}</span>
          </Button>
        )}
        <p className={styles.status}>
          <span className={styles.narrowOnly}>{describePages([current], count, t)}</span>
          <span className={styles.wideOnly}>{describePages(shown, count, t)}</span>
        </p>
        {single ? null : (
          <Button className={styles.turn} aria-label={wide ? t.nextSpread : t.nextPage} aria-disabled={atEnd || undefined} onClick={() => !atEnd && turn(1)}>
            <span className={styles.turnText}>{t.next}</span> <span aria-hidden="true">→</span>
          </Button>
        )}
      </div>

      <div className={styles.tools}>
        {single ? null : (
          <form className={styles.jump} onSubmit={submitJump} noValidate /* out-of-range numbers are clamped, not rejected with a browser tooltip */>
            <label htmlFor={`${uid}-jump`}>{t.goToPage}</label>
            <input id={`${uid}-jump`} type="number" inputMode="numeric" min={1} max={count} value={jump} placeholder={String(current)} onChange={(e) => setJump(e.target.value)} />
            <Button type="submit" size="sm">
              {t.go}
            </Button>
          </form>
        )}
        {single ? null : (
          <Button size="sm" aria-expanded={showThumbs} aria-controls={thumbsId} onClick={() => setShowThumbs((v) => !v)}>
            {showThumbs ? t.hideThumbs : t.thumbs}
          </Button>
        )}
        {canFullscreen ? (
          <Button size="sm" aria-pressed={fullscreen} onClick={toggleFullscreen}>
            {fullscreen ? t.exitFullscreen : t.fullscreen}
          </Button>
        ) : null}
        {currentPage.fullSrc ? (
          <a className={styles.link} href={currentPage.fullSrc} target="_blank" rel="noreferrer">
            {t.openFull(current)}
          </a>
        ) : null}
        {actions}
      </div>

      {showThumbs && !single ? (
        <PageThumbs
          id={thumbsId}
          pages={pages.map((p) => ({ id: p.id, thumb: p.thumb ?? p.src, width: p.width, height: p.height }))}
          current={wide ? shown : [current]}
          onSelect={(n) => go(n)}
          label={t.thumbsLabel(label)}
        />
      ) : null}

      {hasText ? (
        <details className={styles.text} onToggle={(e) => setTextOpen(e.currentTarget.open)}>
          <summary>{t.readAsText}</summary>
          {shown.map((n) => {
            const staticText = pages[n - 1].text;
            const loaded = staticText !== undefined ? ({ status: "ready", text: staticText } as const) : texts[n];
            return (
              <div key={n} className={styles.textPage} data-current={n === current || undefined}>
                <h2>{t.pageHeading(n)}</h2>
                {!loaded || loaded.status === "loading" ? (
                  <p role="status">{t.loadingText}</p>
                ) : loaded.status === "error" ? (
                  <p role="alert">
                    {t.textError}{" "}
                    <Button size="sm" onClick={() => retryText(n)}>
                      {t.retry}
                    </Button>
                  </p>
                ) : loaded.text.trim() ? (
                  loaded.text.split("\n").map((line, i) => (
                    <p key={i} lang={textLang}>
                      {line}
                    </p>
                  ))
                ) : (
                  <p>{t.noText}</p>
                )}
              </div>
            );
          })}
        </details>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
