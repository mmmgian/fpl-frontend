/**
 * Renders the real pages from the shared in-memory season (tests/journeys/world.ts, `season("final")`), in the regular and the
 * blotter view, as parsed documents, for the composition rules. Same wiring as tests/journeys/*: fresh modules, the world behind
 * fetch, the request's language/trip cookie, then the page function and its provider; the Tools page's streamed slots are
 * resolved the way the page's own wiring resolves them.
 */
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";
import type { ToolsDeferredSlots } from "@/components/views/ToolsView";
import { testLanguage } from "../language";
import { LIBRARY, fakeTimes } from "../times-fixtures";
import { install, season, uninstall } from "../journeys/world";

export type Mode = "normal" | "blotter";
export interface RenderedPage {
  name: string;
  mode: Mode;
  doc: Document;
}

type Open = () => Promise<ReactElement>;
const resolveSlot = async (n: ReactNode): Promise<ReactNode> => {
  const child = (n as ReactElement<{ children: ReactElement }>).props.children;
  return await (child.type as (p: unknown) => Promise<ReactElement>)(child.props);
};

const PAGES: { name: string; open: Open }[] = [
  { name: "league", open: async () => (await (await import("@/app/page")).default()) as ReactElement },
  { name: "team", open: async () => (await (await import("@/app/team/[entryId]/page")).default({ params: Promise.resolve({ entryId: "gaucho-f-c" }), searchParams: Promise.resolve({}) })) as ReactElement },
  {
    name: "tools",
    open: async () => {
      const element = (await (await import("@/app/tools/page")).default({ searchParams: Promise.resolve({}) })) as ReactElement<{ model: never; deferred: ToolsDeferredSlots }>;
      const { ToolsView } = await import("@/components/views/ToolsView");
      const d = element.props.deferred;
      const arrived = { kept: d.kept } as ToolsDeferredSlots;
      for (const k of ["eo", "league", "nav", "injuries", "injuriesNav"] as const) arrived[k] = await resolveSlot(d[k]);
      return <ToolsView model={element.props.model} deferred={arrived} />;
    },
  },
  { name: "bonus", open: async () => (await (await import("@/app/bonus/page")).default({ searchParams: Promise.resolve({}) })) as ReactElement },
  { name: "fixtures grid", open: async () => (await (await import("@/app/fixtures/page")).default({ searchParams: Promise.resolve({ n: "5" }) })) as ReactElement },
  { name: "fixtures feed", open: async () => (await (await import("@/app/fixtures/page")).default({ searchParams: Promise.resolve({}) })) as ReactElement },
  { name: "club", open: async () => (await (await import("@/app/club/[id]/page")).default({ params: Promise.resolve({ id: "arsenal" }) })) as ReactElement },
  { name: "times library", open: async () => (await (await import("@/app/times/page")).default({ searchParams: Promise.resolve({}) })) as ReactElement },
  { name: "history", open: async () => (await (await import("@/app/history/[gw]/page")).default({ params: Promise.resolve({ gw: "5" }) })) as ReactElement },
];

export const PAGE_NAMES = PAGES.map((p) => p.name);

export async function renderPage(name: string, mode: Mode): Promise<RenderedPage> {
  const page = PAGES.find((p) => p.name === name)!;
  vi.resetModules();
  uninstall();
  install(season("final"));
  testLanguage.cookie = "en";
  testLanguage.trip = mode === "blotter" ? "1" : undefined;
  vi.doMock("@/lib/times", () => ({ timesGateway: fakeTimes(LIBRARY) }));
  // Mark every Card so the composition rules can find them (the real Card has no attribute that tells it from other .card classes).
  vi.doMock("@/components/ui/Card", async (original) => {
    const real = await original<typeof import("@/components/ui/Card")>();
    return { ...real, Card: (props: Parameters<typeof real.Card>[0]) => <div data-design-card="">{real.Card(props)}</div> };
  });
  const el = await page.open();
  const { I18nProvider } = await import("@/components/ui/I18nProvider");
  const html = renderToStaticMarkup(<I18nProvider locale="en" trip={mode === "blotter"}>{el}</I18nProvider>);
  uninstall();
  return { name, mode, doc: new DOMParser().parseFromString(html, "text/html") };
}
