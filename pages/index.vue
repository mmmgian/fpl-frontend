<script setup lang="ts">
type Standing = {
  entry: number
  entry_name: string
  player_name: string
  total: number
  event_total?: number | null
  rank?: number | null
  last_rank?: number | null
}
type LeagueResponse = { standings: Standing[] }

const LEAGUE_ID = 1391467

const { data, pending, error } = await useFetch<LeagueResponse>(`/api/league/${LEAGUE_ID}`, {
  server: true,
  key: `league-${LEAGUE_ID}`,
  headers: { 'cache-control': 'no-store' },
})

const standings = computed<Standing[]>(() => data.value?.standings ?? [])

// rank helpers
function toNum(x: unknown): number | null {
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}
function movementOf(s: Standing): 'up' | 'down' | 'same' | 'neutral' {
  const r = toNum(s.rank)
  const p = toNum(s.last_rank)
  if (r == null || p == null) return 'neutral'
  if (r < p) return 'up'
  if (r > p) return 'down'
  return 'same'
}
function movementIcon(m: 'up' | 'down' | 'same' | 'neutral'): string {
  if (m === 'up') return '▲'
  if (m === 'down') return '▼'
  if (m === 'same') return '•'
  return '•'
}
function movementClass(m: 'up' | 'down' | 'same' | 'neutral'): string {
  if (m === 'up') return 'text-green-600'
  if (m === 'down') return 'text-red-600'
  return 'text-gray-500'
}

// navigate helper for row clicks
function goTeam(entry: number) {
  return navigateTo(`/team/${entry}`)
}
</script>

<template>
  <section class="max-w-4xl mx-auto px-4 py-6">
    <h1 class="text-2xl font-bold mb-4">League Table</h1>

    <div class="rounded-[28px] border border-black/10 bg-white/90 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[520px] sm:min-w-0">
          <thead>
            <tr class="bg-white/80 border-b border-black/10 text-left">
              <th class="px-3 sm:px-4 py-2 w-10">#</th>
              <th class="px-2 py-2 w-6 hidden sm:table-cell"></th>
              <th class="px-3 sm:px-4 py-2">Team / Manager</th>
              <th class="px-3 sm:px-4 py-2 w-20 hidden sm:table-cell">GW</th>
              <th class="px-3 sm:px-4 py-2 w-24 text-right">Total</th>
            </tr>
          </thead>

          <tbody>
            <tr v-if="pending">
              <td colspan="5" class="px-4 py-6 text-center text-gray-500">Loading…</td>
            </tr>
            <tr v-else-if="error">
              <td colspan="5" class="px-4 py-6 text-center text-red-600">Failed to fetch league data.</td>
            </tr>
            <tr v-else-if="!standings.length">
              <td colspan="5" class="px-4 py-6 text-center text-gray-700">No league data yet.</td>
            </tr>

            <!-- Clickable rows -->
            <tr
              v-for="(t, idx) in standings"
              :key="t.entry"
              class="border-t border-black/10 hover:bg-black/5 active:scale-[0.998] transition-[background,transform] cursor-pointer focus-within:bg-black/5"
              role="link"
              tabindex="0"
              :aria-label="`Open ${t.entry_name} team page`"
              @click="goTeam(t.entry)"
              @keydown.enter.prevent="goTeam(t.entry)"
              @keydown.space.prevent="goTeam(t.entry)"
            >
              <td class="px-3 sm:px-4 py-3">{{ idx + 1 }}</td>

              <!-- movement arrow (hidden on xs) -->
              <td class="px-2 py-3 hidden sm:table-cell">
                <span :class="['text-xs', movementClass(movementOf(t))]">
                  {{ movementIcon(movementOf(t)) }}
                </span>
              </td>

              <!-- team / manager -->
              <td class="px-3 sm:px-4 py-3">
                <div class="leading-tight">
                  <span class="underline decoration-1 underline-offset-2 font-semibold">
                    {{ t.entry_name }}
                  </span>
                  <div class="text-xs text-gray-600 mt-1">
                    {{ t.player_name }}
                  </div>
                </div>
              </td>

              <!-- GW points (hidden on xs) -->
              <td class="px-3 sm:px-4 py-3 hidden sm:table-cell">
                <span v-if="t.event_total != null">{{ t.event_total }}</span>
                <span v-else>—</span>
              </td>

              <!-- Total points -->
              <td class="px-3 sm:px-4 py-3 text-right font-semibold">
                {{ t.total }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>