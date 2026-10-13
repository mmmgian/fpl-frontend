import { getFormat, getIntlLocale, getT } from "@/components/ui";
import { pickVariant } from "@/lib/domain";
import type { FdrHighlightsView, NextDeadlineView } from "@/lib/services/models";

/**
 * The Fixtures page's opening lines: the next deadline, then the doubles and blanks and two of the runs (kindest,
 * toughest, biggest swing) in the stretch ahead. Which runs and which wording are drawn from `variety`, so the intro
 * changes from day to day and as the gameweek moves on; every figure comes from the model.
 */
export function fixturesLede(highlights: FdrHighlightsView | null, next: NextDeadlineView | null, variety: number): string[] {
  const f = getT().fixtures;
  const fmt = getFormat();
  const and = new Intl.ListFormat(getIntlLocale(), { type: "conjunction" });
  const out = [next ? pickVariant(f.deadline, variety, 1)(next.gw, f.until(next.hours), next.matches) : f.seasonOver];
  if (!highlights) return out;

  const h = highlights;
  if (h.double) out.push(pickVariant(f.double, variety, 2)(h.double.gw, and.format(h.double.teams)));
  if (h.blank) out.push(pickVariant(f.blank, variety, 3)(h.blank.gw, and.format(h.blank.teams)));

  const runs = [
    () => pickVariant(f.easiest, variety, 4)(h.easiest.team, fmt.oneDecimal(h.easiest.average), h.from, h.to),
    () => pickVariant(f.toughest, variety, 5)(h.toughest.team, fmt.oneDecimal(h.toughest.average), h.from, h.to),
    ...(h.swing ? [() => pickVariant(f.swing, variety, 6)(h.swing!.team, fmt.oneDecimal(h.swing!.before), fmt.oneDecimal(h.swing!.after), h.swing!.from)] : []),
  ];
  // Two different runs, starting from a drawn one, so the same fact doesn't open the page every day.
  const first = pickVariant(runs.map((_, i) => i), variety, 7);
  out.push(runs[first](), runs[(first + 1) % runs.length]());
  return out;
}
