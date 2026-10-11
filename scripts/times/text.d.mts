export interface Lexicon {
  counts: Map<string, number>;
  total: number;
}
export function buildLexicon(strings: string[]): Lexicon;
export function looksSpaced(s: string): boolean;
export function segment(letters: string, lex: Lexicon): string[];
export function cleanText(str: string, lex: Lexicon): string;
export function joinLigatures(s: string, lex: Lexicon): string;
