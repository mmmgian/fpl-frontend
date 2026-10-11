# Lobster League — FPL frontend

Next.js (App Router) site for a Fantasy Premier League classic league: live standings, team sheets,
live/provisional bonus points, and gameweek-by-gameweek history snapshots.

## How it works

| Route | Data source |
| --- | --- |
| `/` league table | FPL API directly (server component) |
| `/team/[entryId]` team sheet | FPL API directly |
| `/bonus?gw=` bonus points | FPL API directly |
| `/history`, `/history/[gw]` | [fpl-backend](https://github.com/mmmgian/fpl-backend) snapshots |
| `/api/cron/autosnapshot` | Vercel Cron → backend `POST /autosnapshot/{league}` |

- FPL calls are made server-side (`lib/fpl/client.ts`), so there is no CORS proxy and nothing reaches
  the browser except rendered HTML. Responses are cached with `next.revalidate`; `bootstrap-static`
  is memoised in-process because it exceeds the Next data-cache size limit.
- Bonus shows three states: **Confirmed** (FPL bonus applied, fixture finished), **Provisional**
  (FPL bonus stat present, not yet finished) and **Projected** (computed from live BPS with FPL's
  tie rules).
- Live pages refresh every minute while a gameweek is in progress, pausing while the tab is hidden.
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

```
app/                  routes, loading/error/not-found boundaries, cron route
components/ui/        reusable, accessible primitives (DataTable, Card, Badge, Button, ...)
components/views/     feature views composed from ui/ (StandingsTable, TeamSheetView, ...)
lib/fpl/              FPL API client, types and pure domain logic (derive.ts)
lib/backend.ts        fpl-backend client
tests/                unit, component and accessibility tests
```
