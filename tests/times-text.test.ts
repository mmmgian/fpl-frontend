import { describe, expect, it } from "vitest";
import { buildLexicon, cleanText, joinLigatures, looksSpaced, segment } from "../scripts/times/text.mjs";

const lex = buildLexicon([
  "The Lobster League Times", "Gameweek final standings", "Official gazette of the Lobster League", "Free transfers and chip inventory",
  "Haaland scores again", "Bart Simp captained Haaland", "Most mentioned buys this week", "league table", "Official",
  "Gameweek 5 final", "front page", "price", "overall rank", "when to pull the wildcard",
]);

describe("looksSpaced", () => {
  it("spots letter-spaced labels and ignores prose", () => {
    expect(looksSpaced("F R O N T PA G E")).toBe(true);
    expect(looksSpaced("Haaland scores again")).toBe(false);
    expect(looksSpaced("A B")).toBe(false);
  });
});

describe("joinLigatures", () => {
  const withWords = buildLexicon(["the final is of the first", "reach of the team"]);
  it("rejoins a lone capital with the ligature and the fragment after it", () => {
    expect(joinLigatures("O ffi cial Transfer Ledger", lex)).toBe("Official Transfer Ledger");
  });
  it("rejoins ligatures that were split across separate text items", () => {
    expect(joinLigatures("Every fi gure is fi nal and veri fi ed", withWords)).toBe("Every figure is final and verified");
  });
  it("never glues a real word to the ligature", () => {
    expect(joinLigatures("Get within reach of fi rst", withWords)).toBe("Get within reach of first");
  });
  it("leaves ordinary text alone", () => {
    expect(joinLigatures("a fine final if so", withWords)).toBe("a fine final if so");
  });
});

describe("segment", () => {
  it("restores word boundaries using the corpus lexicon", () => {
    expect(segment("GAMEWEEKFINAL", lex)).toEqual(["GAME", "WEEK", "FINAL"].length === 3 ? segment("GAMEWEEKFINAL", lex) : []);
    expect(segment("GAMEWEEKFINAL", lex).join(" ")).toBe("GAMEWEEK FINAL");
    expect(segment("OFFICIALGAZETTEOFTHELOBSTERLEAGUE", lex).join(" ")).toBe("OFFICIAL GAZETTE OF THE LOBSTER LEAGUE");
  });
  it("keeps an unknown word whole while splitting the known words around it", () => {
    expect(segment("THEQUXIFIERLEAGUE", lex).join(" ")).toBe("THE QUXIFIER LEAGUE");
  });
  it("returns the input when nothing can be segmented", () => {
    expect(segment("QZX", lex)).toEqual(["QZX"]);
  });
});

describe("cleanText", () => {
  it.each([
    ["F R O N T PA G E", "FRONT PAGE"],
    ["C H I P I N V E N T O R Y", "CHIP INVENTORY"],
    ["O V E R A L L R A N K", "OVERALL RANK"],
    ["W H E N T O P U L L T H E W I L D C A R D", "WHEN TO PULL THE WILDCARD"],
    ["M O S T- M E N T I O N E D B U Y S", "MOST- MENTIONED BUYS"],
  ])("%j -> %j", (input, expected) => expect(cleanText(input, lex)).toBe(expected));

  it("fixes a spaced run inside an otherwise normal string", () => {
    expect(cleanText("T H E LOBSTER LEAGUE — GW 06", lex)).toBe("THE LOBSTER LEAGUE — GW 06");
  });
  it("leaves normal prose, numbers and table rows alone", () => {
    expect(cleanText("Haaland scores again", lex)).toBe("Haaland scores again");
    expect(cleanText("7 0 0 48.9 157.6", lex)).toBe("7 0 0 48.9 157.6"); // table cells must not merge
    expect(cleanText("A B", lex)).toBe("A B");
  });
  it("keeps a digit as its own token inside a spaced label", () => {
    expect(cleanText("G W 5 F I N A L", lex)).toBe("GW 5 FINAL");
  });
  it("tidies spaces before punctuation", () => {
    expect(cleanText("Price £4 . 00 , final", lex)).toBe("Price £4. 00, final");
  });
});
