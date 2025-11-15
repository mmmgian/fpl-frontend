// fpl-frontend/server/api/fixtures/[event].get.ts
import {
  defineEventHandler,
  getRouterParams,
  createError,
  setResponseHeaders,
} from 'h3'
import { useRuntimeConfig } from '#imports'

type Fixture = {
  id: number
  event: number | null
  kickoff_time: string | null
  team_h: number
  team_a: number
  team_h_score: number | null
  team_a_score: number | null
  team_h_difficulty?: number
  team_a_difficulty?: number
  // ... other props
}

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { event?: string }
  const evStr = params?.event ?? ''
  const evNum = Number(evStr)

  if (!Number.isFinite(evNum) || evNum <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad event id' })
  }

  setResponseHeaders(event, {
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    vary: 'Accept-Encoding',
  })

  const config = useRuntimeConfig()
  const base = config.public.apiBase || ''

  if (base) {
    const url = `${base}/fixtures?event=${encodeURIComponent(String(evNum))}`
    return await $fetch<Fixture[]>(url, { cache: 'no-store' })
  }

  const allFixtures = await $fetch<Fixture[]>(
    'https://fantasy.premierleague.com/api/fixtures/',
    {
      headers: { referer: 'https://fantasy.premierleague.com' },
      cache: 'no-store',
    }
  )

  return allFixtures.filter((f) => f.event === evNum)
})
