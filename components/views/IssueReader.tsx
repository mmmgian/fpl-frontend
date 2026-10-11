"use client";

import { useCallback, useMemo } from "react";
import { ButtonAnchor } from "@/components/ui/Button";
import { Flipbook, type FlipbookPage } from "@/components/ui/Flipbook";
import { useT } from "@/components/ui/I18nProvider";
import { issueAssets, type Issue } from "@/lib/domain/times";

/** One request per issue, shared by every page (and by retries on failure). */
const textCache = new Map<string, Promise<string[]>>();
function fetchIssueText(id: string): Promise<string[]> {
  let request = textCache.get(id);
  if (!request) {
    request = fetch(issueAssets.text(id))
      .then((res) => {
        if (!res.ok) throw new Error(`text ${res.status}`);
        return res.json() as Promise<{ pages?: unknown }>;
      })
      .then((body) => (Array.isArray(body.pages) ? body.pages.map((t) => (typeof t === "string" ? t : "")) : Promise.reject(new Error("bad text"))));
    request.catch(() => textCache.delete(id)); // a failure must not be remembered: the next try gets a fresh request
    textCache.set(id, request);
  }
  return request;
}

/**
 * Adapts an issue to the generic Flipbook and keeps `?p=` in the address bar, so any page can be shared or
 * reloaded. `replaceState` (not push) means flipping through an issue doesn't fill the Back button's history.
 */
export function IssueReader({ issue, initialPage, size }: { issue: Issue; initialPage: number; /** The PDF's size, formatted on the server in the page's language. */ size: string }) {
  const t = useT().flipbook;
  const pages = useMemo<FlipbookPage[]>(
    () =>
      issue.pages.map((p) => ({
        id: p.n,
        src: issueAssets.page(issue.id, p.n, "m"),
        srcSet: issueAssets.srcSet(issue.id, p.n),
        thumb: issueAssets.page(issue.id, p.n, "s"),
        fullSrc: issueAssets.page(issue.id, p.n, "l"),
        width: p.width,
        height: p.height,
      })),
    [issue],
  );

  const syncUrl = useCallback((page: number) => {
    const url = new URL(window.location.href);
    if (page <= 1) url.searchParams.delete("p");
    else url.searchParams.set("p", String(page));
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const id = issue.id;
  const loadText = useCallback(async (page: number) => (await fetchIssueText(id))[page - 1] ?? "", [id]);

  const pdf = issueAssets.pdf(issue.id);
  return (
    <Flipbook
      key={issue.id}
      pages={pages}
      label={issue.kicker ? `${issue.title}, ${issue.kicker}` : issue.title}
      defaultPage={initialPage}
      onPageChange={syncUrl}
      loadText={loadText}
      fallbackHref={pdf}
      textLang="en"
      actions={
        <ButtonAnchor size="sm" href={pdf} download>
          {t.downloadPdf(size)}
        </ButtonAnchor>
      }
    />
  );
}
