import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/config";

type OpenGraph = NonNullable<Metadata["openGraph"]>;

/** The site's picture for shared links when a page has none of its own. */
export const DEFAULT_SHARE_IMAGE = { url: "/brand/lobster-league.webp", width: 288, height: 192, alt: SITE_NAME };

/**
 * A page's Open Graph tags, laid over the site's. Next replaces a parent's `openGraph` wholesale when a page sets
 * its own, so a page that only gave a title would lose the site name, the description and the picture in a chat
 * preview. Every page that sets Open Graph goes through here.
 */
export function openGraph(description: string, page: Partial<OpenGraph> = {}): OpenGraph {
  return {
    siteName: SITE_NAME,
    type: "website",
    description,
    images: [DEFAULT_SHARE_IMAGE],
    ...page,
  } as OpenGraph;
}
