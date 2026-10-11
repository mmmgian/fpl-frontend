"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";
import { Button, ButtonLink, StateMessage } from "@/components/ui";

export default function HistoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
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
        title="History is unavailable right now"
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
              Try again
            </Button>
            <ButtonLink href="/">Back to table</ButtonLink>
          </>
        }
      >
        <p>The history server didn&apos;t answer. It runs on free hosting that sleeps when idle; trying again usually works once it has woken up.</p>
      </StateMessage>
    </div>
  );
}
