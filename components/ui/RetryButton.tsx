"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
// Deep imports on purpose: the components/ui barrel also exports the server-side i18n.
import { Button } from "./Button";
import { useT } from "./I18nProvider";

/** "Try again" for a section that failed to load inside an otherwise fine page: re-fetches the page's data in place. */
export function RetryButton() {
  const router = useRouter();
  const t = useT().errors;
  const [pending, start] = useTransition();
  return (
    <Button size="sm" onClick={() => start(() => router.refresh())} disabled={pending} aria-busy={pending || undefined}>
      {t.retry}
    </Button>
  );
}
