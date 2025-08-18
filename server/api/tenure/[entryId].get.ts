// server/api/tenure/[entryId].get.ts
import type { H3Event } from 'h3'

export default defineEventHandler(async (event: H3Event) => {
  const { entryId } = getRouterParams(event)

  const url = `https://fantasy.premierleague.com/api/entry/${encodeURIComponent(entryId)}/history/`
  const data = await $fetch<any>(url, {
    headers: { referer: 'https://fantasy.premierleague.com/' },
    // avoid caching while debugging
    cache: 'no-store' as any,
  })

  const past = Array.isArray(data?.past) ? data.past : []
  const seasons = past
    .map((p: any) => p?.season_name)
    .filter((s: any) => typeof s === 'string')

  seasons.sort() // earliest first for "YYYY/YY"

  const seasons_played = seasons.length
  const first_season = seasons[0] ?? null

  const playing_since_year =
    first_season && first_season.includes('/') ? Number(first_season.split('/')[0]) : null

  return {
    entry_id: Number(entryId),
    seasons_played,
    first_season,
    playing_since_year,
    seasons,
  }
})