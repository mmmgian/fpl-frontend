import axe from "axe-core";
import { expect } from "vitest";

/**
 * Runs axe-core against a rendered container and fails with a readable list of violations.
 * Colour contrast is skipped: jsdom doesn't compute styles, so it's checked in the browser instead.
 */
export async function expectNoAxeViolations(container: Element) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
  expect(summary).toEqual([]);
}
