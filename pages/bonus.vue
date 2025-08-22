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

const nowTick = useState<number>('now-tick', () => Date.now()) // same value SSR→CSR hydration

// Bootstrap: events/teams/elements
const { data: bootRes, error: bootErr } = await useFetch<Bootstrap>('/api/bootstrap-static', {
  server: true,
  key: 'boot',
  headers: { 'cache-control': 'no-store' },
})
const events  = computed<Event[]>(() => bootRes.value?.events ?? [])
const teams   = computed<Team[]>(() => bootRes.value?.teams ?? [])
const elements = computed<Element[]>(() => bootRes.value?.elements ?? [])

// Current GW → drive fetching off a real ref so it runs as soon as currentGw appears
const currentGw = computed<number | null>(() => {
  const ev = events.value
  if (!ev.length) return null
  const cur = ev.find(e => e.is_current) ?? ev.find(e => !e.finished) ?? ev[0]
  return cur?.id ?? null
})
const gw = ref<number | null>(null)
watch(currentGw, (v) => { if (v) gw.value = v }, { immediate: true })

// Fixtures for the chosen GW (🔁 live endpoint + stable default + refresh handle)
const { data: fixRes, pending, error, refresh } = await useFetch<Fixture[] | (Fixture | null)[]>(
  () => (gw.value ? `/api/fixtures-live?event=${gw.value}` : null),
  {
    server: true,
    key: () => `fixtures-live-${gw.value ?? 'none'}`,
    headers: { 'cache-control': 'no-store' },
    default: () => [], // avoid hydration flashes
  }
)

// Gentle client polling during live matches (visibility-aware)
let poll: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  const start = () => { if (!poll) poll = setInterval(() => refresh(), 12_000) }
  const stop  = () => { if (poll) { clearInterval(poll); poll = null } }
  start()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { start(); refresh() } else { stop() }
  })
})
onBeforeUnmount(() => { if (poll) clearInterval(poll) })

// Normalize fixtures (defensively filter by event === gw)
const fixtures = computed<Fixture[]>(() => {
  const list = Array.isArray(fixRes.value) ? (fixRes.value.filter(Boolean) as Fixture[]) : []
  return gw.value ? list.filter(f => f.event === gw.value) : list
})

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
  const code = t?.code ?? 0
  return code ? `https://resources.premierleague.com/premierleague/badges/t${code}.png` : ''
}

// --- Hydration-safe time: UTC on SSR, local after mount ---
const isClient = ref(false)
onMounted(() => { isClient.value = true })

function fmtTimeUtc(iso?: string | null): string {
  if (!iso) return 'TBD'
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'UTC'
  }).format(d) + ' UTC'
}
function fmtTimeLocal(iso?: string | null): string {
  if (!iso) return 'TBD'
  return new Date(iso).toLocaleString()
}

// ✅ CDG-style bold numerals (no circled glyphs)
function keycap(n: number): string {
  return n === 3 ? '3' : n === 2 ? '2' : n === 1 ? '1' : ''
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
      y.bonus - x.bonus ||
      y.bps - x.bps ||
      (nameByElement.value.get(x.element) || '').localeCompare(nameByElement.value.get(y.element) || '')
    )
}

// Status & sorting (finished fixtures sorted: most recently finished first)
function toMs(iso?: string | null): number {
  if (!iso) return Number.NaN
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Number.NaN
}
function statusOf(fx: Fixture): 'LIVE' | 'UPCOMING' | 'COMPLETED' {
  if (fx.finished || fx.finished_provisional) return 'COMPLETED'
  const kick = toMs(fx.kickoff_time)
  const now = nowTick.value
  if (Number.isFinite(kick) && kick <= now && (fx.started || fx.team_h_score !== null || fx.team_a_score !== null)) return 'LIVE'
  if (!Number.isFinite(kick) || kick > now) return 'UPCOMING'
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
  const byKickAsc  = (a: Fixture, b: Fixture) => (toMs(a.kickoff_time) || 0) - (toMs(b.kickoff_time) || 0)
  const byKickDesc = (a: Fixture, b: Fixture) => (toMs(b.kickoff_time) || 0) - (toMs(a.kickoff_time) || 0)

  live.sort(byKickAsc)         // soonest live first
  upcoming.sort(byKickAsc)     // earliest KO first
  done.sort(byKickDesc)        // ✅ most recently finished first

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

// --- jersey helper (same shirts used on /team/id) ---
function shirtUrl(teamId?: number) {
  if (!teamId) return ''
  const code = teamById.value.get(teamId)?.code
  return code
    ? `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${code}-110.png`
    : ''
}
</script>

<template>
  <section class="px-4 py-6">
    <div class="mb-2">
      <h1 class="text-2xl font-extrabold tracking-tight">Bonus Points — GW {{ gw ?? '—' }}</h1>
      <p class="text-xs text-gray-500">Official FPL bonus (live where available)</p>
    </div>

    <div v-if="bootErr" class="text-red-600">Failed to load bootstrap.</div>
    <div v-else-if="pending" class="text-gray-600">Loading…</div>
    <div v-else-if="error" class="text-red-600">Failed to load fixtures.</div>
    <div v-else-if="!sortedFixtures.length" class="text-gray-600">No fixtures for this gameweek yet.</div>

    <div v-else class="space-y-4">
      <CardSection
        v-for="fx in sortedFixtures"
        :key="fx.id"
        :class="[
          'rounded-[28px] border border-black/10 bg-white/80 shadow-sm overflow-hidden',
          statusOf(fx) === 'LIVE' ? 'live-card' : ''
        ]"
      >
        <!-- Header: centered, with crests in subtle circles (matches other views) -->
        <template #header>
          <div class="flex flex-col items-center text-center w-full gap-1">
            <div class="flex items-center justify-center gap-2">
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/5 ring-1 ring-black/5">
                <img v-if="crestUrl(fx.team_h)" :src="crestUrl(fx.team_h)" alt="home" class="w-4 h-4 object-contain" />
              </span>
              <span class="font-semibold">{{ teamById.get(fx.team_h)?.short_name || 'Home' }}</span>
              <span class="font-semibold">{{ fx.team_h_score ?? '-' }}</span>
              <span class="mx-1">vs</span>
              <span class="font-semibold">{{ fx.team_a_score ?? '-' }}</span>
              <span class="font-semibold">{{ teamById.get(fx.team_a)?.short_name || 'Away' }}</span>
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/5 ring-1 ring-black/5">
                <img v-if="crestUrl(fx.team_a)" :src="crestUrl(fx.team_a)" alt="away" class="w-4 h-4 object-contain" />
              </span>
            </div>

            <div class="text-xs text-gray-600">
              <span
                class="px-2 py-0.5 rounded-full border border-black/10 mr-2"
                :class="[badgeClass(fx), statusOf(fx) === 'LIVE' ? 'animate-pulse-live' : '']"
              >
                {{ badgeText(fx) }}
              </span>
              <span v-if="isClient">{{ fmtTimeLocal(fx.kickoff_time) }}</span>
              <span v-else>{{ fmtTimeUtc(fx.kickoff_time) }}</span>
            </div>
          </div>
        </template>

        <!-- Two tables styled like other pages -->
        <div class="grid gap-4 md:grid-cols-2">
          <!-- Home -->
          <div class="border-b md:border-b-0 md:border-r border-black/10 pb-4 md:pb-0 md:pr-4">
            <table class="w-full text-sm bg-transparent">
              <thead>
                <tr class="bg-white/60 border-b border-black/10 text-left">
                  <th class="px-3 py-2">Player</th>
                  <th class="px-3 py-2 w-28">Bonus</th>
                </tr>
              </thead>
              <tbody class="bg-transparent">
                <tr
                  v-for="row in mergedWithTeamAndBonus(fx.stats).filter(r => r.teamId === fx.team_h).slice(0,3)"
                  :key="`${fx.id}-H-${row.element}-${row.bonus}`"
                  class="border-t border-black/10 hover:bg-black/5 transition-colors"
                >
                  <td class="px-3 py-3">
                    <!-- jersey + name (inline; minimal layout change) -->
                    <img
                      v-if="shirtUrl(teamOfElement.get(row.element))"
                      :src="shirtUrl(teamOfElement.get(row.element))"
                      alt=""
                      class="inline-block align-middle h-4 w-auto mr-2"
                      decoding="async" loading="lazy" referrerpolicy="no-referrer"
                    />
                    <span class="align-middle">{{ nameByElement.get(row.element) || `#${row.element}` }}</span>
                  </td>
                  <td class="px-3 py-3">
                    <span class="mr-2 bonus-icon">{{ keycap(row.bonus) }}</span>{{ row.bps }}
                  </td>
                </tr>
                <tr v-if="!mergedWithTeamAndBonus(fx.stats).some(r => r.teamId === fx.team_h)">
                  <td class="px-3 py-3 text-gray-600" colspan="2">No bonus yet.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Away -->
          <div class="pt-4 md:pt-0 md:pl-4">
            <table class="w-full text-sm bg-transparent">
              <thead>
                <tr class="bg-white/60 border-b border-black/10 text-left">
                  <th class="px-3 py-2">Player</th>
                  <th class="px-3 py-2 w-28">Bonus</th>
                </tr>
              </thead>
              <tbody class="bg-transparent">
                <tr
                  v-for="row in mergedWithTeamAndBonus(fx.stats).filter(r => r.teamId === fx.team_a).slice(0,3)"
                  :key="`${fx.id}-A-${row.element}-${row.bonus}`"
                  class="border-t border-black/10 hover:bg-black/5 transition-colors"
                >
                  <td class="px-3 py-3">
                    <!-- jersey + name (inline; minimal layout change) -->
                    <img
                      v-if="shirtUrl(teamOfElement.get(row.element))"
                      :src="shirtUrl(teamOfElement.get(row.element))"
                      alt=""
                      class="inline-block align-middle h-4 w-auto mr-2"
                      decoding="async" loading="lazy" referrerpolicy="no-referrer"
                    />
                    <span class="align-middle">{{ nameByElement.get(row.element) || `#${row.element}` }}</span>
                  </td>
                  <td class="px-3 py-3">
                    <span class="mr-2 bonus-icon">{{ keycap(row.bonus) }}</span>{{ row.bps }}
                  </td>
                </tr>
                <tr v-if="!mergedWithTeamAndBonus(fx.stats).some(r => r.teamId === fx.team_a)">
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

/* pulsing badge for LIVE */
@keyframes pulseLive {
  0%, 100% { filter: none; transform: none; }
  50% { filter: brightness(1.05); transform: translateZ(0); }
}
.animate-pulse-live { animation: pulseLive 1.4s ease-in-out infinite; }

/* ✅ Bold, modern numbers for 3/2/1 */
.bonus-icon {
  display: inline-block;
  font-weight: 900;
  font-size: 1.125rem; /* ~18px, subtle but strong */
  line-height: 1;
  letter-spacing: -0.02em;
}
</style>