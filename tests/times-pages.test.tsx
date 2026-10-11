/** The /times routes, rendered through the real container with a fixed library (so snapshots don't churn as issues are added). */
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIBRARY, fakeTimes } from "./times-fixtures";

const html = (el: ReactElement) => renderToStaticMarkup(el).replace(/></g, ">\n<").replace(/_R_[0-9a-z]+_/g, "_ID_") + "\n";
const golden = (name: string) => `./golden/${name}.html`;

async function load(library = LIBRARY) {
  vi.doMock("@/lib/times", () => ({ timesGateway: fakeTimes(library) }));
  const library_ = (await import("@/app/times/page")).default;
  const issue = await import("@/app/times/[issue]/page");
  return { Library: library_, Issue: issue.default, generateMetadata: issue.generateMetadata };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock("@/lib/times"));

describe("/times", () => {
  it("front page: masthead, latest edition, filters, archive", async () => {
    const { Library } = await load();
    await expect(html(await Library({ searchParams: Promise.resolve({}) }))).toMatchFileSnapshot(golden("times-library"));
  });
  it("filtered by type", async () => {
    const { Library } = await load();
    await expect(html(await Library({ searchParams: Promise.resolve({ kind: "plan" }) }))).toMatchFileSnapshot(golden("times-library-plans"));
  });
  it("ignores an unknown type", async () => {
    const { Library } = await load();
    const unknown = html(await Library({ searchParams: Promise.resolve({ kind: "<script>alert(1)</script>" }) }));
    expect(unknown).toBe(html(await Library({ searchParams: Promise.resolve({}) }))); // same as no filter, and nothing echoed back
    expect(unknown).not.toContain("<script>");
  });
  it("an empty library", async () => {
    const { Library } = await load([]);
    await expect(html(await Library({ searchParams: Promise.resolve({}) }))).toMatchFileSnapshot(golden("times-library-empty"));
  });
});

describe("/times/[issue]", () => {
  const props = (issue: string, p?: string) => ({ params: Promise.resolve({ issue }), searchParams: Promise.resolve(p ? { p } : {}) });

  it("opens an issue at the requested page", async () => {
    const { Issue } = await load();
    await expect(html(await Issue(props("times-gw5", "3")))).toMatchFileSnapshot(golden("times-issue-page-3"));
  });
  it("opens a one-page issue", async () => {
    const { Issue } = await load();
    await expect(html(await Issue(props("one-pager")))).toMatchFileSnapshot(golden("times-issue-single-page"));
  });
  it("clamps a page number that is out of range, and ignores junk", async () => {
    const { Issue } = await load();
    expect(html(await Issue(props("times-gw5", "999")))).toContain('alt="Page 6 of 6"');
    expect(html(await Issue(props("times-gw5", "-4")))).toContain('alt="Page 1 of 6"');
    expect(html(await Issue(props("times-gw5", "<img src=x onerror=alert(1)>")))).toContain('alt="Page 1 of 6"');
  });
  it.each(["nope", "../library", "..%2F..%2Fetc%2Fpasswd", "UPPER", "a/b", "times-gw5/../x", ""])("is not found for %j", async (id) => {
    const { Issue } = await load();
    await expect(Issue(props(id))).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("keeps the private material out of search results", async () => {
    const { generateMetadata, Issue } = await load();
    expect(await generateMetadata(props("times-gw5"))).toMatchObject({ title: "The Lobster Times", robots: { index: false, follow: false } });
    expect(await generateMetadata(props("nope"))).toMatchObject({ title: "The Times", robots: { index: false } });
    expect(Issue).toBeTypeOf("function");
  });
  it("the library page is noindex too", async () => {
    const mod = await import("@/app/times/page");
    expect(mod.metadata).toMatchObject({ title: "The Times", robots: { index: false, follow: false } });
  });
});
