import { Fragment, type ReactNode } from "react";
import { LocalTime } from "@/components/ui";

/** A private-use character no translation contains, standing in for the time while the sentence is built. */
const SLOT = "\uE000";

/**
 * Renders a translated sentence that mentions a moment (`when`) with that moment shown in the reader's own time zone.
 * The catalog function gets a placeholder, and the sentence is split around it so each language keeps its own word
 * order ("at 15:00", "a las 15:00", "à 15:00").
 */
export function withTime(sentence: (when: string) => string, iso: string, options?: Intl.DateTimeFormatOptions): ReactNode {
  const parts = sentence(SLOT).split(SLOT);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? <LocalTime iso={iso} options={options} /> : null}
    </Fragment>
  ));
}
