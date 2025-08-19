<script setup lang="ts">
type Row = {
  entry: number
  entry_name: string
  player_name: string
  event_total?: number | null
  total: number
  rank?: number | null
  last_rank?: number | null
}

// Support both shapes:
// 1) { standings: Row[] }
// 2) { standings: { results: Row[] } }
type LeaguePayload =
  | { standings: Row[] }
  | { standings: { results: Row[] } }

const LEAGUE_ID = 1391467

const { data, error, pending } = await useFetch<LeaguePayload>(
  () => `/api/league/${LEAGUE_ID}`,
  { headers: { 'cache-control': 'no-store' }, server: true, key: 'league-index' }
)

const rows = computed<Row[]>(() => {
  const s = data.value?.standings as any
  if (!s) return []
  return Array.isArray(s) ? s : (s.results ?? [])
})

const arrow = (r?: number|null, prev?: number|null) => {
  if (!r || !prev || r === prev) return '•'
  return r < prev ? '▲' : '▼'
}

const toTeam = (entry:number) => navigateTo(`/team/${entry}`)
</script>

<template>
  <section>
    <!-- NEW: Lobster League heading -->
    <h1 class="text-2xl font-extrabold tracking-tight mb-4">
      🦞 The Lobster League
    </h1>

    <div class="rounded-[28px] border border-black/10 bg-white/80 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm bg-transparent">
          <thead>
            <tr class="bg-white/60 border-b border-black/10 text-left">
              <th class="px-3 py-2 w-14">#</th>
              <th class="px-3 py-2">Team · Manager</th>
              <th class="px-3 py-2 w-20 text-right">GW</th>
              <th class="px-3 py-2 w-24 text-right">Total</th>
            </tr>
          </thead>
          <tbody class="bg-transparent">
            <!-- Loading row (prevents flashing the empty state) -->
            <tr v-if="pending">
              <td colspan="4" class="px-3 py-6 text-center text-gray-600">Loading…</td>
            </tr>

            <tr
              v-else
              v-for="(r, i) in rows"
              :key="r.entry"
              class="border-t border-black/10 hover:bg-black/5 transition-colors cursor-pointer"
              @click="toTeam(r.entry)"
            >
              <td class="px-3 py-2 font-medium">
                <span class="mr-2 opacity-60">{{ arrow(r.rank, r.last_rank) }}</span>{{ (r.rank ?? i+1) }}
              </td>
              <td class="px-3 py-2">
                <div class="font-semibold leading-tight">{{ r.entry_name }}</div>
                <div class="text-xs text-gray-600 leading-tight">{{ r.player_name }}</div>
              </td>
              <td class="px-3 py-2 text-right">{{ r.event_total ?? '—' }}</td>
              <td class="px-3 py-2 text-right font-semibold">{{ r.total }}</td>
            </tr>

            <tr v-if="!pending && !rows.length">
              <td colspan="4" class="px-3 py-6 text-center text-gray-600">
                Uh oh, no league data yet.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="error" class="mt-3 text-sm text-red-500">Failed to load league.</p>
  </section>
</template>