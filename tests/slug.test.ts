import { describe, expect, it } from "vitest";
import { entryOfSlug, entrySlugs, slugify } from "@/lib/domain/slug";

describe("slugify", () => {
  it("makes a readable address of a name", () => {
    expect(slugify("Gaucho F.C.")).toBe("gaucho-f-c");
    expect(slugify("Bart's Team")).toBe("barts-team");
    expect(slugify("Man City")).toBe("man-city");
    expect(slugify("Nott'm Forest")).toBe("nottm-forest");
    expect(slugify("Brighton & Hove")).toBe("brighton-and-hove");
    expect(slugify("Zürich ñandú")).toBe("zurich-nandu");
    expect(slugify("  --Lobster   FC!!  ")).toBe("lobster-fc");
  });
  it("keeps it short and never empty or unsafe", () => {
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(60);
    for (const name of ["", "🦞🦞", "../../etc/passwd", "<script>", "日本語"]) expect(slugify(name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("🦞")).toBe("team");
  });
});

describe("entrySlugs", () => {
  it("gives every team its own address, even with the same name, and does not change when the table moves", () => {
    const a = entrySlugs([{ id: 5, name: "Lobsters" }, { id: 3, name: "Lobsters" }, { id: 9, name: "lobsters!" }]);
    expect(a.get(3)).toBe("lobsters");
    expect(a.get(5)).toBe("lobsters-5");
    expect(a.get(9)).toBe("lobsters-9");
    expect(new Set(a.values()).size).toBe(3);
    const b = entrySlugs([{ id: 9, name: "lobsters!" }, { id: 3, name: "Lobsters" }, { id: 5, name: "Lobsters" }]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
  it("never lets a name be mistaken for a team number", () => {
    expect(entrySlugs([{ id: 1, name: "2024" }]).get(1)).toBe("team-2024");
  });
  it("finds the team behind an address", () => {
    const slugs = entrySlugs([{ id: 7, name: "Gaucho F.C." }, { id: 8, name: "Other" }]);
    expect(entryOfSlug(slugs, "gaucho-f-c")).toBe(7);
    expect(entryOfSlug(slugs, "nobody")).toBeNull();
  });
});
