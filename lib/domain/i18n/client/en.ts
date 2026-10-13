/** Strings that client components need. Kept in their own small files so the full catalogs never reach the browser. */
export const clientEn = {
  language: {
    label: "Language",
    changeTo: "Change language",
  },

  trip: {
    enter: "Try something strange",
    leave: "Come back to normal",
    /** The header button that leaves the altered view; it sits where the theme picker was, so it must stay short. */
    leaveShort: "Normal view",
  },

  theme: {
    group: "Colour theme",
    light: "Regular",
    night: "Night reader",
    dark: "Dark",
  },

  live: {
    updating: "Updating…",
    last: (time: string) => `Updated ${time}`,
    offline: (time: string | null) => (time ? `Offline · showing ${time}` : "Offline"),
    refresh: "Refresh",
  },

  errors: {
    title: "Couldn't load this page",
    body: "Something went wrong while loading it. It's usually brief (FPL updates between gameweeks, or a server is busy), so try again in a moment.",
    retry: "Try again",
    backToTable: "Back to the table",
    reference: (digest: string) => `Reference: ${digest}`,
    historyTitle: "Past tables are unavailable right now",
    historyBody: "The history server didn't answer. It runs on free hosting that sleeps when idle; trying again usually works once it has woken up.",
  },
  nav: {
    label: "Main",
    table: "Table",
    tools: "Tools",
    bonus: "Bonus",
    fixtures: "Fixtures",
    times: "The Times",
    home: "Home",
    skip: "Skip to content",
  },

  deadline: { title: "Next deadline", days: "Days", hours: "Hours", mins: "Mins", secs: "Secs", passed: "The deadline has passed" },

  fdr: {
    difficulty: (n: number) => `, difficulty ${n} of 5`,
    scale: "Difficulty scale: 1 easiest to 5 hardest",
  },
  feed: {
    live: "Live",
    /** Under a full-time score before FPL confirms the bonus: visible, since a hover tooltip doesn't work on a phone. */
    provisional: "Bonus pending",
    provisionalTitle: "Full time, but bonus points aren't confirmed yet",
    fullTime: "FT",
    tbc: "TBC",
    thisWeek: "This week",
    played: "Played",
    deadline: "Deadline",
    double: "Double gameweek",
    blank: "Blank",
    today: "Today",
    jumpTo: "Jump to",
    postponed: "Postponed",
    postponedHeading: "Postponed, to be rescheduled",
    kickoffTbc: "Kick-off time to be confirmed",
    gameweek: (n: number) => `Gameweek ${n}`,
    gw: (n: number) => `GW${n}`,
    earlier: "Earlier gameweeks",
    showMore: "Show more gameweeks",
    end: "That's the lot: the whole season, to the last whistle.",
    unknownClub: "Unknown club",
    /** The score links to that gameweek's bonus page. */
    bonusFor: (home: string, away: string) => `Bonus points for ${home} v ${away}`,
    /** Beside a started gameweek's heading. */
    bonusLink: "Bonus points",
    /** Kick-off times and day headings follow the reader's clock. */
    localTimes: "Times in your time zone",
  },
  clubLink: {
    title: (name: string) => `${name}: news, fixtures and likely line-up`,
  },

  flipbook: {
    roleDescription: "flipbook",
    noPages: "There are no pages to show.",
    pages: "Pages",
    help: "Use the left and right arrow keys to turn the page.",
    controls: "Page controls",
    previousSpread: "Previous spread",
    previousPage: "Previous page",
    nextSpread: "Next spread",
    nextPage: "Next page",
    previous: "Previous",
    next: "Next",
    pageOf: (n: number, count: number) => `Page ${n} of ${count}`,
    pagesOf: (a: number, b: number, count: number) => `Pages ${a} and ${b} of ${count}`,
    goToPage: "Go to page",
    go: "Go",
    goToPageN: (n: number) => `Go to page ${n}`,
    hideThumbs: "Hide thumbnails",
    thumbs: "Thumbnails",
    thumbsLabel: (label: string) => `${label}: page thumbnails`,
    exitFullscreen: "Exit full screen",
    fullscreen: "Full screen",
    openFull: (n: number) => `Open page ${n} full size`,
    readAsText: "Read as text",
    pageHeading: (n: number) => `Page ${n}`,
    loadingText: "Loading the text…",
    textError: "The text couldn't be loaded.",
    retry: "Try again",
    noText: "This page has no text.",
    pageError: "This page couldn't be loaded.",
    openPdf: "Open the PDF instead",
    downloadPdf: (size: string) => `Download PDF (${size})`,
  },
};

export type ClientMessages = typeof clientEn;
