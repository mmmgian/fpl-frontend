"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";
// Deep imports on purpose: the components/ui barrel also exports the server-side i18n, which pulls every language into the browser bundle.
import { Button, ButtonLink } from "@/components/ui/Button";
import { useT } from "@/components/ui/I18nProvider";
import { StateMessage } from "@/components/ui/StateMessage";

export default function HistoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const t = useT().errors;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    console.error(error);
    ref.current?.focus();
  }, [error]);

  return (
    <div ref={ref} tabIndex={-1} style={{ outline: "none" }}>
      <StateMessage
        tone="error"
        headingLevel={1}
        title={t.historyTitle}
        action={
          <>
            <Button
              variant="solid"
              onClick={() =>
                startTransition(() => {
                  router.refresh();
                  reset();
                })
              }
            >
              {t.retry}
            </Button>
            <ButtonLink href="/">{t.backToTable}</ButtonLink>
          </>
        }
      >
        <p>{t.historyBody}</p>
      </StateMessage>
    </div>
  );
}
