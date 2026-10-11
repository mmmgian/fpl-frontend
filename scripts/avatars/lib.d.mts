export const DEFAULT_MODEL: string;
export const API_BASE: string;
export const MAX_NAME: number;
export function cleanName(raw: unknown): string;
export function buildPrompt(teamName: unknown): string | null;
export function buildRequest(o: { api: string; model: string; prompt: string; base?: string }): { url: string; body: unknown };
export function findImage(node: unknown): { mime: string; bytes: Buffer } | null;
export function explainNoImage(json: unknown): string;
export function needsAvatar(row: { entry: number; entry_name: string; club_badge_src?: string | null }, manifest: { avatars?: Record<string, unknown> }, o?: { force?: boolean }): boolean;
export interface Options { limit: number; all: boolean; force: boolean; dryRun: boolean; only: number | null; model: string | null; api: string; league: number | null; delayMs: number }
export function parseArgs(argv: string[]): Options;
export function parseEnv(text: string): Record<string, string>;
export function redact(text: unknown, key: string | undefined): string;
export function parseMascotFilename(name: string): { entry: number; slug: string; ext: string } | null;
export interface ImportPlan {
  matched: { file: string; entry: number; teamName: string; slug: string }[];
  unmatched: { file: string; reason: string }[];
  duplicates: { entry: number; files: string[] }[];
  missing: { entry: number; teamName: string }[];
  ok: boolean;
}
export function planImport(files: string[], rows: { entry: number; entry_name: string }[]): ImportPlan;
