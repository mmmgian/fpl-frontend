<script setup lang="ts">
type Row = {
  entry: number
  entry_name: string
  player_name: string
  event_total?: number | null
  total: number
  rank?: number | string | null
  last_rank?: number | string | null
}
type LeaguePayload =
  | { standings: Row[] }
  | { standings: { results: Row[] } }

const LEAGUE_ID = 1391467

// League standings
const { data, error, pending } = await useFetch<LeaguePayload>(
  () => `/api/league/${LEAGUE_ID}`,
  { headers: { 'cache-control': 'no-store' }, server: true, key: 'league-index' }
)

// Current GW (via bootstrap-static) with safe default
type Event = { id: number; is_current?: boolean; finished?: boolean }
type Bootstrap = { events: Event[] }
const { data: bootstrap } = await useFetch<Bootstrap>(
  '/api/bootstrap-static',
  {
    headers: { 'cache-control': 'no-store' },
    server: true,
    key: 'bootstrap-gw',
    default: () => ({ events: [] })
  }
)

const currentGw = computed<number | null>(() => {
  const ev = bootstrap.value?.events ?? []
  const cur = ev.find(e => e.is_current)
             ?? ev.find(e => !e.finished)
             ?? ev[ev.length - 1]
  return cur?.id ?? null
})

const rows = computed<Row[]>(() => {
  const s = (data.value as any)?.standings
  if (!s) return []
  return Array.isArray(s) ? s : (s.results ?? [])
})

// Arrow helpers
const arrowSym = (r?: number | string | null, prev?: number | string | null) => {
  const cur  = Number(r)
  const last = Number(prev)
  if (!Number.isFinite(cur) || !Number.isFinite(last)) return '•'
  if (cur === last) return '•'
  return cur < last ? '▲' : '▼'
}
const arrowClass = (r?: number | string | null, prev?: number | string | null) => {
  const cur  = Number(r)
  const last = Number(prev)
  if (!Number.isFinite(cur) || !Number.isFinite(last) || cur === last) return 'text-gray-400'
  return cur < last ? 'text-[#009E60]' : 'text-[#800020]' // Kelly green / Burgundy
}

const toTeam = (entry:number) => navigateTo(`/team/${entry}`)
</script>

<template>
  <section>
    <h1 class="text-2xl font-extrabold tracking-tight mb-4">
      🦞 The Lobster League
    </h1>

    <div class="rounded-[28px] border border-black/10 bg-white/80 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm bg-transparent">
          <thead>
            <tr class="bg-white/60 border-b border-black/10 text-left">
              <th class="px-3 py-2 w-16">#</th>
              <th class="px-3 py-2">Team · Manager</th>
              <th class="px-3 py-2 w-20 text-right">
                {{ currentGw ? `GW${currentGw}` : 'GW' }}
              </th>
              <th class="px-3 py-2 w-24 text-right">Total</th>
            </tr>
          </thead>

          <tbody class="bg-transparent">
            <tr v-if="pending">
              <td colspan="4" class="px-3 py-6 text-center text-gray-600">Loading…</td>
            </tr>

            <template v-else>
              <tr
                v-for="(r, i) in rows"
                :key="r.entry"
                class="border-t border-black/10 hover:bg-black/5 transition-colors cursor-pointer"
                role="button"
                tabindex="0"
                @click="toTeam(r.entry)"
                @keydown.enter="toTeam(r.entry)"
              >
                <td class="px-3 py-2 font-medium">
                  <span class="inline-flex items-center gap-1.5 whitespace-nowrap [font-variant-numeric:tabular-nums]">
                    <span
                      :class="arrowClass(r.rank, r.last_rank)"
                      :title="`rank: ${r.rank ?? '—'} | last: ${r.last_rank ?? '—'}`"
                    >
                      {{ arrowSym(r.rank, r.last_rank) }}
                    </span>
                    <span>{{ (Number(r.rank) || i + 1) }}</span>
                  </span>
                </td>

                <!-- Make the cell itself a NuxtLink for bullet-proof navigation -->
                <td class="px-3 py-2">
                  <NuxtLink
                    :to="`/team/${r.entry}`"
                    class="block focus:outline-none focus:ring-2 focus:ring-black/20 rounded"
                    aria-label="Open team details"
                    @click.stop
                  >
                    <div class="font-semibold leading-tight">{{ r.entry_name }}</div>
                    <div class="text-xs text-gray-600 leading-tight">{{ r.player_name }}</div>
                  </NuxtLink>
                </td>

                <td class="px-3 py-2 text-right [font-variant-numeric:tabular-nums]">{{ r.event_total ?? '—' }}</td>
                <td class="px-3 py-2 text-right font-semibold [font-variant-numeric:tabular-nums]">{{ r.total }}</td>
              </tr>

              <tr v-if="!rows.length">
                <td colspan="4" class="px-3 py-6 text-center text-gray-600">
                  Uh oh, no league data yet.
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="error" class="mt-3 text-sm text-red-500">Failed to load league.</p>
  </section>
</template>