/**
 * Enforces the layering. Dependencies point inward only:
 *
 *   app -> views -> services -> domain
 *                       ^
 *   infrastructure (lib/fpl, lib/backend) implements the service ports
 *   lib/container.ts is the only place the two are wired together
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
}

interface Import {
  from: string;
  /** Resolved project path without extension (e.g. "lib/domain/gameweek"), or the package name. */
  target: string;
  external: boolean;
  typeOnly: boolean;
}

const IMPORT_RE =
  /\b(import|export)\s+(type\s+)?(?:[\w*{},\s]+?)\s+from\s+["']([^"']+)["']|\bimport\s+["']([^"']+)["']|\b(?:import|require)\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file: string): Import[] {
  const src = readFileSync(join(ROOT, file), "utf8");
  return [...src.matchAll(IMPORT_RE)].map((m) => {
    const spec = m[3] ?? m[4] ?? m[5];
    const typeOnly = Boolean(m[2]);
    if (spec.startsWith("@/")) return { from: file, target: spec.slice(2), external: false, typeOnly };
    if (spec.startsWith(".")) return { from: file, target: normalize(join(dirname(file), spec)), external: false, typeOnly };
    return { from: file, target: spec, external: true, typeOnly };
  });
}

type Layer = "domain" | "services" | "infra" | "config" | "container" | "views" | "app" | "other";

function layerOf(path: string): Layer {
  if (path.startsWith("lib/domain")) return "domain";
  if (path.startsWith("lib/services")) return "services";
  if (path.startsWith("lib/fpl") || path.startsWith("lib/times") || path.startsWith("lib/avatars") || path.startsWith("lib/europe") || path.startsWith("lib/news") || path === "lib/backend") return "infra";
  if (path === "lib/config") return "config";
  if (path === "lib/container") return "container";
  if (path.startsWith("components/")) return "views";
  if (path.startsWith("app/")) return "app";
  return "other";
}

/** Returns a reason if the import breaks a rule, else null. */
function violation(i: Import): string | null {
  const from = layerOf(i.from);
  const to = i.external ? null : layerOf(i.target);

  switch (from) {
    case "domain":
      if (i.external) return "the domain must not use any package (it is pure)";
      return to === "domain" ? null : `the domain must not depend on ${to}`;
    case "services":
      if (i.external) return "services must not use packages (they only orchestrate ports)";
      return to === "domain" || to === "services" ? null : `services must not depend on ${to} (use a port)`;
    case "infra":
      if (i.external) return i.target === "next/cache" ? null : "infrastructure may only use next/cache";
      if (to === "services") return i.typeOnly && i.target === "lib/services/ports" ? null : "infrastructure may only import port types from services";
      return to === "domain" || to === "infra" || to === "config" ? null : `infrastructure must not depend on ${to}`;
    case "views":
      if (i.external) return null;
      if (to === "services") return i.typeOnly && i.target === "lib/services/models" ? null : "views may only import view-model types from services";
      return to === "domain" || to === "views" || to === "config" ? null : `views must not depend on ${to}`;
    case "app":
      if (i.external) return null;
      if (to === "infra") return i.from.startsWith("app/api/") ? null : "pages must go through services, not call infrastructure";
      if (to === "services") return i.typeOnly ? null : "pages must reach services through lib/container";
      return null;
    default:
      return null;
  }
}

describe("architecture", () => {
  const files = ["lib", "components", "app"].flatMap(sourceFiles).filter((f) => f !== relative(ROOT, __filename));
  const found = files.flatMap(importsOf);

  it("parses imports (guards the checker itself)", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(found.some((i) => i.from === "lib/services/team.ts" && i.target === "lib/domain")).toBe(true);
    expect(found.some((i) => i.from === "lib/fpl/gateway.ts" && i.typeOnly && i.target === "lib/services/ports")).toBe(true);
  });

  it("keeps every dependency pointing inward", () => {
    const broken = found.flatMap((i) => {
      const reason = violation(i);
      return reason ? [`${i.from} imports ${i.target}: ${reason}`] : [];
    });
    expect(broken).toEqual([]);
  });

  it("sees dynamic imports and require() too", () => {
    const sample = 'const a = await import("@/lib/fpl"); const b = require("react"); import c from "./x";';
    expect([...sample.matchAll(IMPORT_RE)].map((m) => m[3] ?? m[4] ?? m[5])).toEqual(["@/lib/fpl", "react", "./x"]);
  });

  it("the checker detects a violation", () => {
    expect(violation({ from: "lib/domain/x.ts", target: "react", external: true, typeOnly: false })).toMatch(/pure/);
    expect(violation({ from: "lib/services/x.ts", target: "lib/fpl/gateway", external: false, typeOnly: false })).toMatch(/port/);
    expect(violation({ from: "components/views/X.tsx", target: "lib/container", external: false, typeOnly: false })).toMatch(/must not/);
    expect(violation({ from: "app/page.tsx", target: "lib/fpl/index", external: false, typeOnly: false })).toMatch(/services/);
  });

  it("only the composition root wires adapters to services", () => {
    const usesAtRuntime = (file: string, layer: Layer) => found.some((i) => i.from === file && !i.typeOnly && !i.external && layerOf(i.target) === layer);
    expect(files.filter((f) => usesAtRuntime(f, "infra") && usesAtRuntime(f, "services"))).toEqual(["lib/container.ts"]);
  });
});
