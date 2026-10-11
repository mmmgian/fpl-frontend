/** The shipped content, checked end to end through the real adapter: every issue opens and every file exists. */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ISSUE_KINDS, PAGE_IMAGE_WIDTHS, issueAssets, isIssueId } from "@/lib/domain";
import { parseIssue, parseSummary, timesGateway } from "@/lib/times";

const PUBLIC = join(__dirname, "..", "public");
const file = (url: string) => join(PUBLIC, url);

/** Width of a WebP file from its header (lossy, lossless or extended), without decoding it. */
function webpWidth(path: string): number {
  const fd = openSync(path, "r");
  const b = Buffer.alloc(32);
  readSync(fd, b, 0, 32, 0);
  closeSync(fd);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") throw new Error(`${path} is not a WebP file`);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8 ") return b.readUInt16LE(26) & 0x3fff;
  if (kind === "VP8L") return (b.readUInt32LE(21) & 0x3fff) + 1;
  if (kind === "VP8X") return 1 + b.readUIntLE(24, 3);
  throw new Error(`unknown WebP variant ${kind}`);
}

describe("the shipped library", async () => {
  const library = await timesGateway.library();

  it("has the issues we expect, with unique, URL-safe ids", () => {
    expect(library.length).toBe(20);
    expect(new Set(library.map((i) => i.id)).size).toBe(library.length);
    expect(library.every((i) => isIssueId(i.id))).toBe(true);
    expect(library.every((i) => (ISSUE_KINDS as readonly string[]).includes(i.kind))).toBe(true);
  });

  it.each(library.map((i) => [i.id, i] as const))("opens %s with all of its pages and files", async (id, summary) => {
    const issue = await timesGateway.issue(id);
    expect(issue, `issue ${id} did not load`).not.toBeNull();
    expect(issue!.pages).toHaveLength(summary.pageCount);

    // The PDF download and every page image in every size exist on disk, and the PDF matches the recorded size.
    expect(existsSync(file(issueAssets.pdf(id)))).toBe(true);
    // the text alternative: one entry per page, fetched on demand
    const text = JSON.parse(readFileSync(file(issueAssets.text(id)), "utf8")) as { id: string; pages: unknown[] };
    expect(text.id).toBe(id);
    expect(text.pages).toHaveLength(summary.pageCount);
    expect(text.pages.every((t) => typeof t === "string")).toBe(true);
    expect(statSync(file(issueAssets.pdf(id))).size).toBe(summary.bytes);
    for (const p of issue!.pages) {
      for (const size of ["s", "m", "l"] as const) {
        expect(existsSync(file(issueAssets.page(id, p.n, size))), `${id} p${p.n} ${size}`).toBe(true);
        // the srcset says "240w / 640w / 1080w": the files must really be that wide, or browsers pick the wrong one
        expect(webpWidth(file(issueAssets.page(id, p.n, size))), `${id} p${p.n} ${size} width`).toBe(PAGE_IMAGE_WIDTHS[size]);
      }
      expect(p.width / p.height).toBeCloseTo(summary.cover.width / summary.cover.height, 1); // pages share a shape, so layouts don't jump
    }
  });
});

describe("what is served", () => {
  it("has no folder for an issue that is not in the library (it would stay public)", async () => {
    const ids = new Set((await timesGateway.library()).map((i) => i.id));
    const folders = readdirSync(join(PUBLIC, "times"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    expect(folders.filter((f) => !ids.has(f))).toEqual([]);
  });

  it("contains no email address, link or local path in any shipped text", async () => {
    const leaks: string[] = [];
    for (const { id } of await timesGateway.library()) {
      const { pages } = JSON.parse(readFileSync(file(issueAssets.text(id)), "utf8")) as { pages: string[] };
      pages.forEach((t, i) => {
        if (/[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+|\/Users\/|\/home\//.test(t)) leaks.push(`${id} page ${i + 1}`);
      });
    }
    expect(leaks).toEqual([]);
  });

  it("asks crawlers to stay away from the static files, which a meta tag can't cover", async () => {
    const config = (await import("../next.config")).default;
    const rules = await config.headers!();
    const times = rules.find((r) => r.source === "/times/:path*");
    expect(times?.headers).toContainEqual({ key: "X-Robots-Tag", value: expect.stringContaining("noindex") });
    expect(rules.some((r) => r.source === "/:path*")).toBe(true); // the site-wide security headers are still there
  });
});

describe("the adapter's boundary", () => {
  const good = { id: "a-b", title: "T", kicker: null, kind: "plan", gameweek: 3, published: "2026-09-01", summary: null, pageCount: 2, bytes: 10, cover: { width: 10, height: 14 } };

  it("accepts a well-formed summary and normalises optional fields", () => {
    expect(parseSummary(good)).toMatchObject({ id: "a-b", gameweek: 3, kicker: null });
    expect(parseSummary({ ...good, gameweek: undefined, kicker: undefined })).toMatchObject({ gameweek: null, kicker: null });
  });

  it.each([
    ["not an object", 42],
    ["null", null],
    ["unsafe id", { ...good, id: "../etc" }],
    ["upper-case id", { ...good, id: "Bad" }],
    ["blank title", { ...good, title: "  " }],
    ["unknown kind", { ...good, kind: "gossip" }],
    ["bad date", { ...good, published: "yesterday" }],
    ["gameweek 99", { ...good, gameweek: 99 }],
    ["zero pages", { ...good, pageCount: 0 }],
    ["negative size", { ...good, bytes: -1 }],
    ["missing cover", { ...good, cover: undefined }],
    ["non-numeric cover", { ...good, cover: { width: "x", height: 3 } }],
    ["kicker of the wrong type", { ...good, kicker: 5 }],
  ])("rejects a summary with %s", (_name, raw) => expect(parseSummary(raw)).toBeNull());

  const summary = parseSummary(good)!;
  const pages = (n: number) => Array.from({ length: n }, (_, i) => ({ n: i + 1, width: 10, height: 14 }));

  it("builds an issue from its summary and a matching pages file", () => {
    expect(parseIssue(summary, { id: "a-b", pages: pages(2) })?.pages).toHaveLength(2);
  });
  it.each([
    ["another issue's file", { id: "other", pages: pages(2) }],
    ["a page count that disagrees", { id: "a-b", pages: pages(3) }],
    ["pages out of order", { id: "a-b", pages: [...pages(2)].reverse() }],
    ["a page with a zero size", { id: "a-b", pages: [{ n: 1, width: 0, height: 1 }, pages(2)[1]] }],
    ["no pages array", { id: "a-b" }],
    ["junk", "nope"],
  ])("rejects %s", (_name, raw) => expect(parseIssue(summary, raw)).toBeNull());

  it("only opens issues in the library, and never from a crafted path", async () => {
    for (const id of ["../library", "..%2Fetc", "library", "", "UPPER", "a/b", "nope"]) expect(await timesGateway.issue(id)).toBeNull();
  });
});
