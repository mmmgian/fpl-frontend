/**
 * Where the reader came from inside the site, so a "← Back to X" link can be a real Back when X is the page before
 * (keeping its scroll position and filters) and a plain link otherwise (a cold landing from a shared link).
 *
 * Only what we can be sure of is recorded: a push grows `history.length`, a replace (the gameweek pager, the
 * flipbook's ?p=) doesn't, and after a Back/Forward we no longer know what's behind us. Browsers stop growing
 * `history.length` at 50, so from there on we don't guess either. Not knowing just means the link navigates normally.
 */
export interface NavState {
  current: string | null;
  /** The page one Back away, when certain. */
  previous: string | null;
  length: number;
  /** A Back/Forward happened since the last recorded page. */
  popped: boolean;
}

/** Browsers cap `history.length` here. */
const HISTORY_CAP = 50;

export const initialNavState: NavState = { current: null, previous: null, length: 0, popped: false };

/** The state after arriving at `pathname`, with `length` the browser's `history.length` at that moment. */
export function nextNavState(state: NavState, pathname: string, length: number): NavState {
  if (state.current === null) return { current: pathname, previous: null, length, popped: false };
  if (pathname === state.current) return { ...state, length, popped: false };
  if (state.popped) return { current: pathname, previous: null, length, popped: false };
  if (length > state.length) return { current: pathname, previous: state.current, length, popped: false };
  // Same length: a replace, so what's behind us is unchanged, unless the history is full and a push looks like a replace.
  return { current: pathname, previous: length >= HISTORY_CAP ? null : state.previous, length, popped: false };
}

let state: NavState = initialNavState;

export const navStore = {
  get: (): NavState => state,
  arrive(pathname: string, length: number) {
    state = nextNavState(state, pathname, length);
  },
  popped() {
    state = { ...state, popped: true };
  },
  /** Tests only. */
  reset() {
    state = initialNavState;
  },
};

/** The path part of an in-site href ("/times#tables" → "/times"). */
export const pathOf = (href: string): string => href.split(/[?#]/, 1)[0] || "/";
