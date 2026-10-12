import { describe, expect, it } from "vitest";
import { dash, decimal, formatMoney, formatNumber, minus, oneDecimal } from "@/lib/domain";

describe("typographic details in numbers", () => {
  it("negative numbers use a real minus sign, not a hyphen", () => {
    expect(formatNumber(-26100)).toBe("\u221226,100");
    expect(oneDecimal(-1.34)).toBe("\u22121.3");
    expect(decimal(-4)).toBe("\u22124");
    expect(minus("-12K")).toBe("\u221212K");
    expect(formatNumber(48)).toBe("48");
  });

  it("negative money puts the sign before the pound", () => {
    expect(formatMoney(-1)).toBe("\u2212£0.1m");
    expect(formatMoney(997)).toBe("£99.7m");
  });

  it("no minus zero", () => {
    expect(oneDecimal(-0.01)).toBe("0.0");
  });

  it("a spaced hyphen in FPL news becomes an en dash; hyphenated words stay", () => {
    expect(dash("Knee injury - 75% chance of playing")).toBe("Knee injury \u2013 75% chance of playing");
    expect(dash("Re-injured")).toBe("Re-injured");
  });
});
