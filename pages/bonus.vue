<script setup lang="ts">
// Types shaped to FPL responses
type Event = { id: number; is_current?: boolean; finished?: boolean }
type Team = { id: number; name: string; short_name: string; code?: number }
type Element = { id: number; web_name: string; team: number }
type Bootstrap = { events: Event[]; teams: Team[]; elements: Element[] }

type BonusEntry = { element: number; value: number }
type Stat = { identifier: string; a: BonusEntry[]; h: BonusEntry[] }
type Fixture = {
  id: number
  event: number | null
  kickoff_time: string | null
  started?: boolean
  finished: boolean
  finished_provisional?: boolean
  team_h: number
  team_a: number
  team_h_score: number | null
  team_a_score: number | null
  stats?: Stat[]
}

// Bootstrap: events/teams/elements
const { data: bootRes, error: bootErr } = await useFetch<Bootstrap>('/api/bootstrap-static', {
  server: true,
  key: 'boot',
})
const events = computed<Event[]>(() => bootRes.value?.events ?? [])
const teams = computed<Team[]>(() => bootRes.value?.teams ?? [])
const elements = computed<Element[]>(() => bootRes.value?.elements ?? [])

// Current GW
const currentGw = computed<number | null>(() => {
  const ev = events.value
  if (!ev.length) return null
  const cur = ev.find(e => e.is_current) ?? ev.find(e => !e.finished) ?? ev[0]
  return cur?.id ?? null
})

// Fixtures for current GW
const { data: fixRes, pending, error } = await useFetch<Fixture[] | (Fixture | null)[]>(
  () => (currentGw.value ? `/api/fixtures?event=${currentGw.value}` : null),
  { server: true, key: () => `fixtures-${currentGw.value ?? 'none'}` }
)

// Normalize fixtures
const fixtures = computed<Fixture[]>(() =>
  Array.isArray(fixRes.value) ? (fixRes.value.filter(Boolean) as Fixture[]) : []
)

// Maps
const teamById = computed(() => {
  const m = new Map<number, Team>()
  for (const t of teams.value) m.set(t.id, t)
  return m
})
const nameByElement = computed(() => {
  const m = new Map<number, string>()
  for (const e of elements.value) m.set(e.id, e.web_name)
  return m
})
const teamOfElement = computed(() => {
  const m = new Map<number, number>()
  for (const e of elements.value) m.set(e.id, e.team)
  return m
})

function crestUrl(teamId?: number): string {
  if (!teamId) return ''
  const t = teamById.value.get(teamId)
  const code = (t?.code ?? 0)
  return code ? `https://resources.premierleague.com/premierleague/badges/t${code}.png` : ''
}
function fmtTime(iso?: string | null): string {
  if (!iso) return 'TBD'
  const d = new Date(iso)
  return d.toLocaleString()
}
function keycap(n: number): string {
  return n === 3 ? '3️⃣' : n === 2 ? '2️⃣' : n === 1 ? '1️⃣' : ''
}

// Build actual bonus (3/2/1) from BPS by tie groups
function bonusMapFromStats(stats?: Stat[]): Map<number, number> {
  const map = new Map<number, number>()
  if (!stats?.length) return map
  const bps = stats.find(s => s.identifier === 'bps')
  if (!bps) return map

  const merged: BonusEntry[] = [...(bps.h ?? []), ...(bps.a ?? [])]
  if (!merged.length) return map

  merged.sort((a, b) => b.value - a.value)

  const groups: { value: number; elements: number[] }[] = []
  for (const row of merged) {
    const last = groups[groups.length - 1]
    if (!last || last.value !== row.value) groups.push({ value: row.value, elements: [row.element] })
    else last.elements.push(row.element)
  }

  const awards = [3, 2, 1]
  for (let i = 0; i < groups.length && i < awards.length; i++) {
    for (const el of groups[i].elements) map.set(el, awards[i])
  }
  return map
}

// Merge BPS with team & computed bonus; keep raw BPS for display
function mergedWithTeamAndBonus(stats?: Stat[]): { element: number; bps: number; teamId: number; bonus: number }[] {
  if (!stats?.length) return []
  const bps = stats.find(s => s.identifier === 'bps')
  if (!bps) return []
  const merged: BonusEntry[] = [...(bps.h ?? []), ...(bps.a ?? [])]
  const bmap = bonusMapFromStats(stats)

  return merged
    .map(r => ({
      element: r.element,
      bps: r.value,
      teamId: teamOfElement.value.get(r.element) ?? 0,
      bonus: bmap.get(r.element) ?? 0,
    }))
    .sort((x, y) =>
      y.bonus - x.bonus || // higher bonus first
      y.bps - x.bps || // then higher BPS
      (nameByElement.value.get(x.element) || '').localeCompare(nameByElement.value.get(y.element) || '')
    )
}

// Status & sorting
function toMs(iso?: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}
const nowMs = () => Date.now()

function statusOf(fx: Fixture): 'LIVE' | 'UPCOMING' | 'COMPLETED' {
  if (fx.finished || fx.finished_provisional) return 'COMPLETED'
  const kick = toMs(fx.kickoff_time)
  if (kick <= nowMs() && (fx.started || fx.team_h_score !== null || fx.team_a_score !== null)) return 'LIVE'
  if (kick > nowMs()) return 'UPCOMING'
  return 'LIVE'
}

const sortedFixtures = computed<Fixture[]>(() => {
  const live: Fixture[] = []
  const upcoming: Fixture[] = []
  const done: Fixture[] = []
  for (const f of fixtures.value) {
    const s = statusOf(f)
    if (s === 'LIVE') live.push(f)
    else if (s === 'UPCOMING') upcoming.push(f)
    else done.push(f)
  }
  const byKickAsc = (a: Fixture, b: Fixture) => toMs(a.kickoff_time) - toMs(b.kickoff_time)
  live.sort(byKickAsc)
  upcoming.sort(byKickAsc)
  done.sort(byKickAsc)
  return [...live, ...upcoming, ...done]
})

function badgeText(fx: Fixture): string {
  const s = statusOf(fx)
  if (s === 'LIVE') return 'LIVE'
  if (s === 'COMPLETED') return 'FT'
  return 'KO'
}
function badgeClass(fx: Fixture): string {
  const s = statusOf(fx)
  if (s === 'LIVE') return 'bg-red-100 text-red-700'
  if (s === 'COMPLETED') return 'bg-gray-100 text-gray-700'
  return 'bg-blue-100 text-blue-700'
}

// Top 3 per side
function top3ForTeam(stats: Stat[] | undefined, teamId: number) {
  return mergedWithTeamAndBonus(stats).filter(row => row.teamId === teamId).slice(0, 3)
}
</script>

<template>
  <section class="px-4 py-6">
    <h1 class="text-2xl font-extrabold tracking-tight mb-1">Bonus Points — GW {{ currentGw ?? '—' }}</h1>
    <p class="text-xs text-gray-500 mb-4">Official FPL bonus (live where available)</p>

    <div v-if="bootErr" class="text-red-600">Failed to load bootstrap.</div>
    <div v-else-if="pending" class="text-gray-500">Loading…</div>
    <div v-else-if="error" class="text-red-600">Failed to load fixtures.</div>
    <div v-else-if="!sortedFixtures.length" class="text-gray-600">No fixtures for this gameweek yet.</div>

    <div v-else class="space-y-4">
      <CardSection
        v-for="fx in sortedFixtures"
        :key="fx.id"
        :class="['bg-white rounded-2xl border border-black/10 shadow-sm', statusOf(fx) === 'LIVE' ? 'live-card' : '']"
      >
        <!-- Compact centered two-line header -->
        <template #header>
          <div class="flex flex-col items-center text-center w-full space-y-1">
            <!-- Line 1 -->
            <div class="flex items-center justify-center gap-2">
              <img v-if="crestUrl(fx.team_h)" :src="crestUrl(fx.team_h)" alt="home" class="w-5 h-5" />
              <span class="font-semibold">{{ teamById.get(fx.team_h)?.short_name || 'Home' }}</span>
              <span class="font-semibold">{{ fx.team_h_score ?? '-' }}</span>
              <span class="mx-1">vs</span>
              <span class="font-semibold">{{ fx.team_a_score ?? '-' }}</span>
              <span class="font-semibold">{{ teamById.get(fx.team_a)?.short_name || 'Away' }}</span>
              <img v-if="crestUrl(fx.team_a)" :src="crestUrl(fx.team_a)" alt="away" class="w-5 h-5" />
            </div>
            <!-- Line 2 -->
            <div class="text-xs text-gray-600">
              <span
                class="px-2 py-0.5 rounded-full border border-black/10 mr-2"
                :class="[badgeClass(fx), statusOf(fx) === 'LIVE' ? 'animate-pulse-live' : '']"
              >
                {{ badgeText(fx) }}
              </span>
              {{ fmtTime(fx.kickoff_time) }}
            </div>
          </div>
        </template>

        <!-- Two columns on md+, stacked on small screens -->
        <div class="grid gap-4 md:grid-cols-2">
          <!-- Home -->
          <div class="border-b md:border-b-0 md:border-r border-black/10 pb-4 md:pb-0 md:pr-4">
            <table class="w-full text-sm">
              <thead class="text-left">
                <tr class="border-t border-black/10 bg-white">
                  <th class="px-3 py-2">Player</th>
                  <th class="px-3 py-2 w-28">Bonus</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in top3ForTeam(fx.stats, fx.team_h)"
                  :key="`${fx.id}-H-${row.element}-${row.bonus}`"
                  class="border-t border-black/10 hover:bg-gray-50 transition-colors"
                >
                  <td class="px-3 py-3">
                    {{ nameByElement.get(row.element) || `#${row.element}` }}
                  </td>
                  <td class="px-3 py-3">
                    <span class="mr-2">{{ keycap(row.bonus) }}</span>{{ row.bps }}
                  </td>
                </tr>
                <tr v-if="!top3ForTeam(fx.stats, fx.team_h).length">
                  <td class="px-3 py-3 text-gray-600" colspan="2">No bonus yet.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Away -->
          <div class="pt-4 md:pt-0 md:pl-4">
            <table class="w-full text-sm">
              <thead class="text-left">
                <tr class="border-t border-black/10 bg-white">
                  <th class="px-3 py-2">Player</th>
                  <th class="px-3 py-2 w-28">Bonus</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in top3ForTeam(fx.stats, fx.team_a)"
                  :key="`${fx.id}-A-${row.element}-${row.bonus}`"
                  class="border-t border-black/10 hover:bg-gray-50 transition-colors"
                >
                  <td class="px-3 py-3">
                    {{ nameByElement.get(row.element) || `#${row.element}` }}
                  </td>
                  <td class="px-3 py-3">
                    <span class="mr-2">{{ keycap(row.bonus) }}</span>{{ row.bps }}
                  </td>
                </tr>
                <tr v-if="!top3ForTeam(fx.stats, fx.team_a).length">
                  <td class="px-3 py-3 text-gray-600" colspan="2">No bonus yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardSection>
    </div>
  </section>
</template>

<style scoped>
/* subtle live glow on card (same as before) */
.live-card { animation: glow 1.6s ease-in-out infinite alternate; }
@keyframes glow {
  from { box-shadow: 0 0 0 rgba(255, 0, 0, 0.0); }
  to   { box-shadow: 0 0 24px rgba(255, 0, 0, 0.12); }
}

/* pulsing dot on LIVE badge (optional, matches other pages) */
@keyframes pulseLive {
  0%, 100% { filter: none; transform: none; }
  50% { filter: brightness(1.05); transform: translateZ(0); }
}
.animate-pulse-live { animation: pulseLive 1.4s ease-in-out infinite; }
</style>