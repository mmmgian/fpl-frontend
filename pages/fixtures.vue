<script setup lang="ts">
// --- Types
type Event = { id: number; is_current?: boolean; finished?: boolean; deadline_time?: string | null }
type Team  = { id: number; name: string; short_name: string; code?: number }
type Bootstrap = { events: Event[]; teams: Team[] }
type Fixture = {
  id: number; event: number|null; kickoff_time: string|null;
  team_h: number; team_a: number; team_h_difficulty: number; team_a_difficulty: number
}

// Bootstrap
const { data: bootRes, error: bootErr } = await useFetch<Bootstrap>('/api/bootstrap-static', {
  server: true,
  key: 'boot-fixtures',
})

const events = computed(() => bootRes.value?.events ?? [])

// RAW teams (unsorted)
const teamsRaw = computed(() => bootRes.value?.teams ?? [])

// Current GW
const currentGw = computed<number | null>(() => {
  const ev = events.value
  if (!ev.length) return null
  const cur = ev.find(e => e.is_current) ?? ev.find(e => !e.finished) ?? ev[0]
  return cur?.id ?? null
})

// Controls
const gwOptions = computed(() => events.value.map(e => e.id))
const startGw = ref<number>(currentGw.value ?? (gwOptions.value[0] ?? 1))
watch(currentGw, (val) => { if (val) startGw.value = val }, { immediate: true })
const span = ref<number>(6) // visible columns

// Visible columns (table)
const columns = computed(() => {
  const all = gwOptions.value
  const idx = all.indexOf(startGw.value)
  if (idx === -1) return []
  return all.slice(idx, idx + span.value)
})

// 🔢 Difficulty sort window = next 5 GWs from startGw (inclusive)
const sortWindow = computed(() => {
  const all = gwOptions.value
  const idx = all.indexOf(startGw.value)
  if (idx === -1) return []
  return all.slice(idx, idx + 5)
})

// team map from RAW teams (not sorted)
const teamById = computed(() => {
  const m = new Map<number, Team>()
  for (const t of teamsRaw.value) m.set(t.id, t)
  return m
})

function crestUrl(teamId?: number) {
  if (!teamId) return ''
  const code = teamById.value.get(teamId)?.code
  return code ? `https://resources.premierleague.com/premierleague/badges/t${code}.png` : ''
}

function gwDate(gw: number): string {
  const ev = events.value.find(e => e.id === gw)
  const iso = ev?.deadline_time
  if (!iso) return ''
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' }).format(d)
}

function fdrClass(n: number) {
  switch (n) {
    case 1: return 'bg-[#DAF7D6] text-[#0B3D0B] border-[#B9E8B3]'
    case 2: return 'bg-[#B9E8B3] text-[#0B3D0B] border-[#9DD99A]'
    case 3: return 'bg-[#F5E7AA] text-[#553A00] border-[#E8D98F]'
    case 4: return 'bg-[#F7C4A3] text-[#5C2400] border-[#E7B18D]'
    case 5: return 'bg-[#F4A7A7] text-[#5A0B0B] border-[#E28E8E]'
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

// ----- Stable fixture index + load sequence guard
type Cell = Readonly<{ oppId: number; home: boolean; diff: number }>
const fixturesIndex = reactive({} as Record<number, Record<number, Cell>>)
const loadedForKey = ref('')
let loadSeq = 0

async function loadGw(gw: number, seq: number) {
  if (fixturesIndex[gw]) return
  const raw = await $fetch<Fixture[]>(`/api/fixtures/${gw}`, {
    headers: { 'cache-control': 'no-store' }
  }).catch(() => [])
  if (seq !== loadSeq) return
  const mapForGw: Record<number, Cell> = Object.create(null)
  for (const fx of raw) {
    mapForGw[fx.team_h] = Object.freeze({ oppId: fx.team_a, home: true,  diff: fx.team_h_difficulty ?? 0 })
    mapForGw[fx.team_a] = Object.freeze({ oppId: fx.team_h, home: false, diff: fx.team_a_difficulty ?? 0 })
  }
  fixturesIndex[gw] = Object.freeze(mapForGw)
}

// Load visible table columns + sort window (next 5) so sorting is correct
async function loadVisible() {
  const need = Array.from(new Set([...(columns.value ?? []), ...(sortWindow.value ?? [])]))
  if (!need.length) return
  const seq = ++loadSeq
  await Promise.all(need.map(gw => loadGw(gw, seq)))
  if (seq === loadSeq) loadedForKey.value = need.join('-')
}

// SSR build index for the current window to match client HTML
if (import.meta.server) {
  if (teamsRaw.value.length && (columns.value.length || sortWindow.value.length)) {
    await loadVisible()
  }
} else {
  onMounted(loadVisible)
}

watch([startGw, span], async () => {
  await loadVisible()
})

const ready = computed(() => {
  const need = Array.from(new Set([...(columns.value ?? []), ...(sortWindow.value ?? [])]))
  return (
    teamsRaw.value.length > 0 &&
    need.length > 0 &&
    need.every(gw => !!fixturesIndex[gw])
  )
})

function cellFor(teamId: number, gw: number): Cell | null {
  const byTeam = fixturesIndex[gw]
  return byTeam ? (byTeam[teamId] ?? null) : null
}
function cellText(c: Cell | null) {
  if (!c) return ''
  const opp = teamById.value.get(c.oppId)
  return `${opp?.short_name ?? opp?.name ?? '—'} ${c.home ? '(H)' : '(A)'}`
}

// 🔽 Difficulty score over next 5 GWs (lower = easier).
// If a fixture missing for a GW, treat as neutral 3 to avoid gaming blanks/doubles.
function diffScore(teamId: number): number {
  const window = sortWindow.value
  if (!window.length) return 0
  let sum = 0
  for (const gw of window) {
    const c = cellFor(teamId, gw)
    sum += c?.diff ?? 3
  }
  return sum
}

// 🔽 Sorted list: easiest → hardest, then by short_name
const teamsSorted = computed(() =>
  teamsRaw.value
    .slice()
    .sort((a, b) => {
      const da = diffScore(a.id)
      const db = diffScore(b.id)
      if (da !== db) return da - db
      const an = a.short_name || a.name
      const bn = b.short_name || b.name
      return String(an).localeCompare(String(bn))
    })
)
</script>

<template>
  <section class="px-4 py-6">
    <!-- Header + Controls -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-extrabold tracking-tight">Fixture Difficulty (FDR)</h1>

      <div class="flex items-center gap-1 text-xs ml-2">
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(1)">1</span>
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(2)">2</span>
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(3)">3</span>
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(4)">4</span>
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(5)">5</span>
        <span class="ml-2 text-gray-600">Easy → Hard (sorted by next 5 GWs)</span>
      </div>

      <div class="flex items-center gap-2 ml-auto">
        <label for="start-gw" class="text-[11px] uppercase tracking-wide text-gray-600">Start GW</label>
        <select id="start-gw" v-model="startGw" class="kiko-select">
          <option v-for="id in gwOptions" :key="id" :value="id">GW {{ id }}</option>
        </select>

        <label for="span" class="ml-2 text-[11px] uppercase tracking-wide text-gray-600">Span</label>
        <select id="span" v-model="span" class="kiko-select">
          <option :value="6">6</option>
          <option :value="8">8</option>
          <option :value="10">10</option>
        </select>
      </div>
    </div>

    <!-- Matrix -->
    <div class="rounded-[28px] border border-black/10 bg-white/80 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table v-if="ready" class="w-full text-sm bg-transparent" :key="loadedForKey">
          <thead>
            <tr class="bg-white/60 border-b border-black/10 text-left align-bottom">
              <th class="px-3 py-2 w-48 sticky-col sticky-col--header">Team</th>
              <th v-for="gw in columns" :key="`h-${gw}`" class="px-3 py-2 text-center w-32">
                <div class="font-medium leading-tight">GW {{ gw }}</div>
                <div class="text-[11px] text-gray-500 mt-0.5 leading-none">{{ gwDate(gw) }}</div>
              </th>
            </tr>
          </thead>
          <tbody class="bg-transparent">
            <tr v-for="t in teamsSorted" :key="t.id" class="border-t border-black/10">
              <td class="px-3 py-2 sticky-col">
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/5 ring-1 ring-black/5">
                    <img v-if="crestUrl(t.id)" :src="crestUrl(t.id)" alt="" class="w-4 h-4 object-contain" />
                  </span>
                  <div class="font-semibold leading-tight whitespace-nowrap">
                    {{ t.short_name || t.name }}
                  </div>
                </div>
              </td>
              <td v-for="gw in columns" :key="`${t.id}-${gw}`" class="px-2 py-2 text-center align-middle">
                <div
                  v-if="cellFor(t.id, gw)"
                  class="rounded-lg border px-2 py-1 inline-flex flex-col items-center justify-center min-w-[7.5rem]"
                  :class="fdrClass(cellFor(t.id, gw)!.diff)"
                  :aria-label="`${cellText(cellFor(t.id, gw))}, difficulty ${cellFor(t.id, gw)!.diff}`"
                  role="img"
                >
                  <div class="text-xs font-medium leading-tight">
                    {{ cellText(cellFor(t.id, gw)) }}
                  </div>
                </div>
                <div v-else class="text-gray-400 text-xs">—</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-else class="p-8 text-center text-gray-500 text-sm">Loading fixtures…</div>
      </div>
    </div>

    <p v-if="bootErr" class="mt-3 text-sm text-red-500">Failed to load bootstrap.</p>
  </section>
</template>

<style scoped>
.kiko-select {
  @apply px-3 py-1.5 rounded-full border border-black/10 bg-white text-sm cursor-pointer
         hover:bg-black/5 transition outline-none;
  appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position:
    calc(100% - 18px) calc(50% - 3px),
    calc(100% - 12px) calc(50% - 3px);
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
  padding-right: 28px;
}

/* Sticky first column */
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 10;
  background: rgba(255,255,255,0.8);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  border-right: 1px solid rgba(0,0,0,0.08);
  box-shadow: 6px 0 8px -6px rgba(0,0,0,0.15);
}
.sticky-col--header {
  z-index: 11;
  background: rgba(255,255,255,0.6);
}

:deep(header) { backdrop-filter: saturate(1.1) blur(4px); }
</style>