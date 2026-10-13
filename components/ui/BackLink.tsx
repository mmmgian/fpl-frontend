"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ComponentProps, type MouseEvent } from "react";
import { navStore, pathOf } from "./navState";

/** Records each page the reader arrives at (see navState). Mounted once, in the root layout; renders nothing. */
export function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    const onPop = () => navStore.popped();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    navStore.arrive(pathname, window.history.length);
  }, [pathname]);
  return null;
}

type BackLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

/**
 * "← The Times", "← Past tables": a real Back when that page is the one just before (so it comes back where the
 * reader left it, filters and scroll position included), an ordinary link when it isn't (e.g. arrived from a
 * shared link). Without JavaScript it is always the ordinary link.
 */
export function BackLink({ href, onClick, ...rest }: BackLinkProps) {
  const router = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (navStore.get().previous !== pathOf(href)) return;
    e.preventDefault();
    router.back();
  };
  return <Link href={href} onClick={handle} {...rest} />;
}
