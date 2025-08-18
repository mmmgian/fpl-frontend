// server/api/team/[entryId].get.ts
import { defineEventHandler, getRouterParams, createError, setHeader } from 'h3'

type Pos = 1|2|3|4
type Pick = { id:number; web_name:string; position:Pos; team?:number; gw_points?:number|null; is_captain?:boolean }
type TeamPayload = { entry_id:number; team_name:string; manager_name:string; gw:number; picks:Pick[] }

export default defineEventHandler(async (event) => {
  // Read params safely
  const { entryId } = getRouterParams(event)
  if (!entryId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing entryId' })
  }

  // Always call our FastAPI backend in prod
  const config = useRuntimeConfig()
  const rawBase = (config.public?.apiBase || 'http://127.0.0.1:8000') as string
  const BASE = rawBase.replace(/\/+$/, '') // trim trailing slash

  const url = `${BASE}/team/${encodeURIComponent(String(entryId))}`

  try {
    const upstream = await $fetch<TeamPayload>(url, {
      headers: {
        // Helpful for some hosts; harmless otherwise
        'User-Agent': 'LobsterLeague/1.0',
      },
      // Don’t cache team details
      cache: 'no-store',
    })

    // Pass through JSON
    setHeader(event, 'Cache-Control', 'no-store')
    return upstream
  } catch (err: any) {
    // Surface backend error clearly so we know it’s not FPL
    const status = Number(err?.statusCode || err?.response?.status || 502)
    const msg = (err?.data?.detail || err?.message || 'Upstream backend error')
    throw createError({
      statusCode: status,
      statusMessage: 'Team upstream failed',
      message: msg,
      data: { url, status, message: msg }
    })
  }
})