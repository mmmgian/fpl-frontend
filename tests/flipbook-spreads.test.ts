import { describe, expect, it } from "vitest";
import { canStep, clampPage, describePages, spreadOf, step } from "@/components/ui/Flipbook/spreads";

describe("clampPage", () => {
  it.each([[0, 10, 1], [-5, 10, 1], [11, 10, 10], [4.9, 10, 4], [NaN, 10, 1], [Infinity, 10, 1], [3, 0, 1]])("clampPage(%j, %j) = %j", (p, n, expected) =>
    expect(clampPage(p, n)).toBe(expected),
  );
});

describe("spreadOf (the cover stands alone, then pairs)", () => {
  it("covers every page exactly once for odd and even page counts", () => {
    for (const count of [1, 2, 3, 4, 5, 10, 29]) {
      const seen: number[] = [];
      for (let p = 1; p <= count; p = Math.max(...spreadOf(p, count)) + 1) seen.push(...spreadOf(p, count));
      expect(seen).toEqual(Array.from({ length: count }, (_, i) => i + 1));
    }
  });
  it.each([[1, 10, [1]], [2, 10, [2, 3]], [3, 10, [2, 3]], [10, 10, [10]], [9, 10, [8, 9]], [4, 5, [4, 5]], [5, 5, [4, 5]], [2, 2, [2]], [1, 1, [1]]])(
    "spreadOf(%j of %j) = %j",
    (p, n, expected) => expect(spreadOf(p, n)).toEqual(expected),
  );
});

describe("step", () => {
  it("narrow: one page at a time, stopping at the ends", () => {
    expect(step(1, 5, 1, false)).toBe(2);
    expect(step(5, 5, 1, false)).toBe(5);
    expect(step(1, 5, -1, false)).toBe(1);
    expect(step(3, 5, -1, false)).toBe(2);
  });
  it("wide: a spread at a time, landing on the left page", () => {
    expect(step(1, 10, 1, true)).toBe(2); // cover -> (2,3)
    expect(step(2, 10, 1, true)).toBe(4); // (2,3) -> (4,5)
    expect(step(3, 10, 1, true)).toBe(4); // from the right page of (2,3)
    expect(step(8, 10, 1, true)).toBe(10); // (8,9) -> back cover alone
    expect(step(10, 10, 1, true)).toBe(10);
    expect(step(4, 10, -1, true)).toBe(2);
    expect(step(2, 10, -1, true)).toBe(1);
    expect(step(1, 10, -1, true)).toBe(1);
  });
  it("walking forward then back visits the same spreads", () => {
    const forward = [1];
    while (step(forward.at(-1)!, 10, 1, true) !== forward.at(-1)) forward.push(step(forward.at(-1)!, 10, 1, true));
    const back = [forward.at(-1)!];
    while (step(back.at(-1)!, 10, -1, true) !== back.at(-1)) back.push(step(back.at(-1)!, 10, -1, true));
    expect(back.reverse()).toEqual(forward);
  });
  it("canStep says whether anything would move", () => {
    expect(canStep(1, 10, -1, true)).toBe(false);
    expect(canStep(1, 10, 1, true)).toBe(true);
    expect(canStep(10, 10, 1, false)).toBe(false);
    expect(canStep(1, 1, 1, true)).toBe(false);
  });
});

describe("describePages", () => {
  it("names a page or a spread", () => {
    expect(describePages([3], 10)).toBe("Page 3 of 10");
    expect(describePages([2, 3], 10)).toBe("Pages 2 and 3 of 10");
  });
});
