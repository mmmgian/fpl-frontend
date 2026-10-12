/**
 * The drawn mascot scenes (see scripts/mascots): static files in public/mascots, listed in a manifest the importer keeps.
 * A file is only used if the manifest names it, and only if the name is a plain `<entry>-<role>.webp`.
 */
import type { MascotImage, MascotPort } from "../services/ports";
import manifest from "./manifest.json";

type Shot = { file?: unknown; width?: unknown; height?: unknown; sha256?: unknown };
interface Manifest {
  managers?: Record<string, { action?: Shot; press?: Shot }>;
}

const SAFE_FILE = /^\d{1,10}-(action|press)\.webp$/;

function image(shot: Shot | undefined): MascotImage | null {
  if (!shot || typeof shot.file !== "string" || !SAFE_FILE.test(shot.file)) return null;
  const { width, height } = shot;
  if (typeof width !== "number" || typeof height !== "number" || !(width > 0) || !(height > 0)) return null;
  // The content hash in the query string lets browsers keep the image for a long time and still pick up a redraw.
  const v = typeof shot.sha256 === "string" && /^[0-9a-f]{8,64}$/.test(shot.sha256) ? `?v=${shot.sha256.slice(0, 10)}` : "";
  return { src: `/mascots/${shot.file}${v}`, width, height };
}

export function createMascotGateway(m: Manifest = manifest as Manifest): MascotPort {
  return {
    scenes(entry) {
      const e = m.managers?.[String(entry)];
      const action = image(e?.action);
      const press = image(e?.press);
      return action && press ? { action, press } : null;
    },
  };
}

export const mascotGateway = createMascotGateway();
