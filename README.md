# Lobster League — FPL frontend

Next.js (App Router) site for a Fantasy Premier League classic league: live standings, team sheets with
season insights, live/provisional bonus points, a fixture-difficulty table, and gameweek-by-gameweek history.

## How it works

| Route | Data source |
| --- | --- |
| `/` league table | FPL API directly (server component) |
| `/team/[entryId]?gw=` team sheet and insights | FPL API directly |
| `/bonus?gw=` bonus points | FPL API directly |
| `/fixtures?gw=&n=` fixture difficulty (next 3, 5 or 10 gameweeks, easiest first) | FPL API directly |
| `/history`, `/history/[gw]` | [fpl-backend](https://github.com/mmmgian/fpl-backend) snapshots |
| `/api/cron/autosnapshot` | Vercel Cron → backend `POST /autosnapshot/{league}` |

- FPL calls are made server-side (`lib/fpl/`), so there is no CORS proxy and nothing reaches the browser
  except rendered HTML. Responses are cached with `next.revalidate`. `bootstrap-static` (1.8 MB) is slimmed to
  about 90 KB, cached across instances with `unstable_cache`, and memoised per instance.
- The team page's insights (free transfers, chips, captain, bench, DefCon, rotation, ownership, fixtures ahead)
  are derived from official data only and follow the FPL toolkit's accuracy rules: nothing is guessed, derived
  figures are labelled as such, and optional data (history, schedule) never takes the page down if it is missing.
- Bonus shows three states: **Confirmed** (FPL bonus applied, fixture finished), **Provisional**
  (FPL bonus stat present, not yet finished) and **Projected** (computed from live BPS with FPL's
  tie rules).
- Live pages refresh every minute while a gameweek is in progress, pausing while the tab is hidden.
- The league table streams: it is sent as soon as the standings (and the cached game file) are back, and the
  storyline, awards and stats columns, which need one request per manager, follow behind a Suspense boundary
  (`services.league.loadStreaming`, `app/_league/Extras.tsx`) with placeholders holding their place.
- Every route has loading skeletons, an error boundary with retry, and explicit empty / not-found states.
  A "waking up the server" hint appears on history pages because Render's free tier cold-starts slowly.

## Development

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3000
```

| Script | |
| --- | --- |
| `npm run check` | lint + typecheck + tests (run before pushing) |
| `npm test` | Vitest + Testing Library, including axe accessibility checks |
| `npm run build` | production build |

Requires Node 20.9+.

## Configuration

See `.env.example`. Everything is optional; defaults point at The Lobster League (467763) and the
production backend.

## Deploying (Vercel)

Set `CRON_SECRET` (and `SNAPSHOT_SECRET` if the backend uses one) in the Vercel project.
`vercel.json` runs the snapshot cron daily at 06:00 UTC, after Monday-night bonus is confirmed.
The backend only stores a snapshot once the gameweek is finished, so repeated calls are harmless.

## Project layout

Dependencies point inward only; `tests/architecture.test.ts` enforces it.

```
app/                  routes: thin pages (parse input -> call a use case -> render a view), cron route
components/views/     views: pure functions of a view model (no data access, no domain logic)
components/ui/        reusable, accessible primitives (DataTable, Card, Badge, Button, FdrChip, Sparkline, ...)
lib/services/         use cases: orchestrate ports and return view models (league, team, bonus, fixtures, history)
lib/services/ports.ts what the use cases need from the outside world (FplPort, HistoryPort)
lib/domain/           pure rules: gameweeks, bonus, team sheet, standings, fixture difficulty, insights
lib/fpl/, lib/backend.ts   infrastructure adapters that implement the ports (HTTP, caching, validation)
lib/container.ts      the only place adapters are wired to use cases
tests/                unit, component, accessibility, architecture and golden-HTML tests
tests/golden/         rendered HTML of every route from a mocked FPL API (update deliberately with `vitest -u`)
```

Optional data is validated at the adapter boundary: a malformed response becomes "unavailable" for optional
facts and a clear error for required ones, so the domain never sees `undefined`.
