/**
 * The generated manager avatars (see scripts/avatars). They are static files in public/avatars, listed in a manifest
 * the generator keeps. A file is only used if the manifest names it, and only if the name is a plain `<entry>.webp`.
 */
import type { AvatarPort } from "../services/ports";
import manifest from "./manifest.json";

interface Manifest {
  avatars?: Record<string, { file?: unknown; sha256?: unknown }>;
}

const SAFE_FILE = /^\d{1,10}\.webp$/;

export function createAvatarGateway(m: Manifest = manifest as Manifest): AvatarPort {
  return {
    src(entry) {
      const a = m.avatars?.[String(entry)];
      if (!a || typeof a.file !== "string" || !SAFE_FILE.test(a.file)) return null;
      // The content hash in the query string lets browsers keep the image for a long time and still pick up a redraw.
      const v = typeof a.sha256 === "string" && /^[0-9a-f]{8,64}$/.test(a.sha256) ? `?v=${a.sha256.slice(0, 10)}` : "";
      return `/avatars/${a.file}${v}`;
    },
  };
}

export const avatarGateway = createAvatarGateway();
