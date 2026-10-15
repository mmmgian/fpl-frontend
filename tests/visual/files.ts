import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./css";

/** Project-relative paths of the files under `dirs` whose names match. */
export function glob(dirs: string[], match: RegExp): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((name) => {
      const path = join(dir, name);
      return statSync(join(ROOT, path)).isDirectory() ? walk(path) : match.test(name) ? [path] : [];
    });
  return dirs.flatMap(walk);
}
