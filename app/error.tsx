"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, startTransition } from "react";
// Deep imports on purpose: the components/ui barrel also exports the server-side i18n, which pulls every language into the browser bundle.
import { Button, ButtonLink } from "@/components/ui/Button";
import { useT } from "@/components/ui/I18nProvider";
import { StateMessage } from "@/components/ui/StateMessage";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const t = useT().errors;
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.error(error);
    headingRef.current?.focus();
  }, [error]);

  const retry = () =>
    startTransition(() => {
      router.refresh(); // re-run the server components
      reset();
    });

  return (
    <div ref={headingRef} tabIndex={-1} style={{ outline: "none" }}>
      <StateMessage
        tone="error"
        headingLevel={1}
        title={t.title}
        action={
          <>
            <Button variant="solid" onClick={retry}>
              {t.retry}
            </Button>
            <ButtonLink href="/">{t.backToTable}</ButtonLink>
          </>
        }
      >
        <p>{t.body}</p>
        {error.digest ? <p>{t.reference(error.digest)}</p> : null}
      </StateMessage>
    </div>
  );
}
