"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, startTransition } from "react";
import { Button, ButtonLink, StateMessage } from "@/components/ui";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
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
        title="Couldn't load this page"
        action={
          <>
            <Button variant="solid" onClick={retry}>
              Try again
            </Button>
            <ButtonLink href="/">Back to table</ButtonLink>
          </>
        }
      >
        <p>
          The Fantasy Premier League API didn&apos;t respond. This usually means FPL is updating between gameweeks or is
          under heavy load, so try again in a minute.
        </p>
        {error.digest ? <p>Reference: {error.digest}</p> : null}
      </StateMessage>
    </div>
  );
}
