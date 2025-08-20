<script setup lang="ts">
// --- Types (aligned with your other pages)
type Event = {
  id: number
  is_current?: boolean
  finished?: boolean
  deadline_time?: string | null // for header date
}
type Team  = { id: number; name: string; short_name: string; code?: number }
type Element = { id: number; web_name: string; team: number }
type Bootstrap = { events: Event[]; teams: Team[]; elements: Element[] }

type Fixture = {
  id: number
  event: number | null
  kickoff_time: string | null
  team_h: number
  team_a: number
  team_h_difficulty: number
  team_a_difficulty: number
}

// --- Fetch bootstrap (events & teams)
const { data: bootRes, error: bootErr } = await useFetch<Bootstrap>('/api/bootstrap-static', {
  server: true,
  key: 'boot-fixtures',
  headers: { 'cache-control': 'no-store' },
})

const events = computed(() => bootRes.value?.events ?? [])
const teamsList = computed(() =>
  (bootRes.value?.teams ?? [])
    .slice()
    .sort((a, b) => (a.short_name || a.name).localeCompare(b.short_name || b.name))
)

// Determine current GW
const currentGw = computed<number | null>(() => {
  const ev = events.value
  if (!ev.length) return null
  const cur = ev.find(e => e.is_current) ?? ev.find(e => !e.finished) ?? ev[0]
  return cur?.id ?? null
})

// Controls: start GW & window length
const gwOptions = computed(() => events.value.map(e => e.id))

// ✅ Lock initial start to real current GW (no brief GW1 phase)
const initialStart = computed(() => currentGw.value ?? (gwOptions.value[0] ?? 1))
const startGw = ref<number>(initialStart.value)
watch(currentGw, (val) => { if (val && startGw.value !== val) startGw.value = val })

const span = ref<number>(6) // show next 6 GWs by default

// Which columns (GWs) to display
const columns = computed(() => {
  const all = gwOptions.value
  const idx = all.indexOf(startGw.value)
  if (idx === -1) return []
  return all.slice(idx, idx + span.value)
})

// Helpers
const teamById = computed(() => {
  const m = new Map<number, Team>()
  for (const t of teamsList.value) m.set(t.id, t)
  return m
})

function crestUrl(teamId?: number) {
  if (!teamId) return ''
  const code = teamById.value.get(teamId)?.code
  return code ? `https://resources.premierleague.com/premierleague/badges/t${code}.png` : ''
}

// --- Pretty date under the GW header (uses event.deadline_time)
function gwDate(gw: number): string {
  const ev = events.value.find(e => e.id === gw)
  const iso = ev?.deadline_time
  if (!iso) return ''
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' }).format(d)
}

// FDR color classes (sharper, FPL-ish)
function fdrClass(n: number) {
  switch (n) {
    case 1: return 'bg-[#DAF7D6] text-[#0B3D0B] border-[#B9E8B3]' // light green
    case 2: return 'bg-[#B9E8B3] text-[#0B3D0B] border-[#9DD99A]' // mid green
    case 3: return 'bg-[#F5E7AA] text-[#553A00] border-[#E8D98F]' // yellow
    case 4: return 'bg-[#F7C4A3] text-[#5C2400] border-[#E7B18D]' // orange
    case 5: return 'bg-[#F4A7A7] text-[#5A0B0B] border-[#E28E8E]' // red
    default: return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

/* -------------------------
   FIXTURE INDEX (no flicker)
   ------------------------- */

// Build an immutable index: gw -> teamId -> { text, diff }
const fixturesIndex = reactive({} as Record<number, Record<number, Readonly<{ text: string; diff: number }>>>)

async function loadVisible() {
  const gwList = columns.value.slice() // freeze for this tick
  await Promise.all(
    gwList.map(async (gw) => {
      if (fixturesIndex[gw]) return

      const raw = await $fetch<Fixture[]>(`/api/fixtures?event=${gw}`, {
        headers: { 'cache-control': 'no-store' }
      }).catch(() => [])

      const byTeam: Record<number, { text: string; diff: number }> = {}

      for (const fx of raw) {
        const home = teamById.value.get(fx.team_h)
        const away = teamById.value.get(fx.team_a)
        if (!home || !away) continue

        byTeam[fx.team_h] = { text: `${away.short_name ?? away.name} (H)`, diff: fx.team_h_difficulty ?? 0 }
        byTeam[fx.team_a] = { text: `${home.short_name ?? home.name} (A)`, diff: fx.team_a_difficulty ?? 0 }
      }

      fixturesIndex[gw] = Object.freeze(byTeam)
    })
  )
}

// initial load (SSR) – load current window AFTER initialStart is set
await loadVisible()

// When controls change, fetch only missing GWs
watch([startGw, span], async () => { await loadVisible() })

// Cell resolver (O(1))
function cellFor(teamId: number, gw: number) {
  const byTeam = fixturesIndex[gw]
  return byTeam ? byTeam[teamId] ?? null : null
}
</script>

<template>
  <section class="px-4 py-6">
    <!-- Header + Controls -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-extrabold tracking-tight">Fixture Difficulty (FDR)</h1>

      <!-- Legend -->
      <div class="flex items-center gap-1 text-xs ml-2">
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(1)">1</span>
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(2)">2</span>
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(3)">3</span>
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(4)">4</span>
        <span class="px-2 py-1 rounded-md border" :class="fdrClass(5)">5</span>
        <span class="ml-2 text-gray-600">Easy → Hard</span>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-2 ml-auto">
        <label for="start-gw" class="text-[11px] uppercase tracking-wide text-gray-600">Start GW</label>
        <select id="start-gw" v-model="startGw" class="kiko-select">
          <option v-for="id in gwOptions" :key="id" :value="id">GW {{ id }}</option>
        </select>

        <label for="span" class="ml-2 text-[11px] uppercase tracking-wide text-gray-600">Span</label>
        <select id="span" v-model="span" class="kiko-select">
          <option :value="4">4</option>
          <option :value="6">6</option>
          <option :value="8">8</option>
          <option :value="10">10</option>
        </select>
      </div>
    </div>

    <!-- Matrix -->
    <div class="rounded-[28px] border border-black/10 bg-white/80 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <!-- 🔑 Key the table by visible GWs to avoid VDOM reuse glitches -->
        <table class="w-full text-sm bg-transparent" :key="columns.join('-')">
          <thead>
            <tr class="bg-white/60 border-b border-black/10 text-left align-bottom">
              <!-- STICKY header cell -->
              <th class="px-3 py-2 w-48 sticky-col sticky-col--header">
                Team
              </th>
              <th
                v-for="gw in columns"
                :key="`h-${gw}`"
                class="px-3 py-2 text-center w-32"
              >
                <div class="font-medium leading-tight">GW {{ gw }}</div>
                <div class="text-[11px] text-gray-500 mt-0.5 leading-none">{{ gwDate(gw) }}</div>
              </th>
            </tr>
          </thead>

          <tbody class="bg-transparent">
            <tr
              v-for="t in teamsList"
              :key="t.id"
              class="border-t border-black/10"
            >
              <!-- STICKY first column -->
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

              <!-- FDR cells (color only, accessible label) -->
              <td
                v-for="gw in columns"
                :key="`${t.id}-${gw}`"
                class="px-2 py-2 text-center align-middle"
              >
                <div
                  v-if="cellFor(t.id, gw)"
                  class="rounded-lg border px-2 py-1 inline-flex flex-col items-center justify-center min-w-[7.5rem]"
                  :class="fdrClass(cellFor(t.id, gw)!.diff)"
                  :aria-label="`${cellFor(t.id, gw)!.text}, difficulty ${cellFor(t.id, gw)!.diff}`"
                  role="img"
                >
                  <div class="text-xs font-medium leading-tight">
                    {{ cellFor(t.id, gw)!.text }}
                  </div>
                </div>
                <div v-else class="text-gray-400 text-xs">—</div>
              </td>
            </tr>

            <tr v-if="!teamsList.length">
              <td :colspan="1 + columns.length" class="px-3 py-6 text-center text-gray-600">
                No teams found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="bootErr" class="mt-3 text-sm text-red-500">Failed to load bootstrap.</p>
  </section>
</template>

<style scoped>
/* KiKo-ish select: pill, thin border, subtle hover */
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
  padding-right: 28px; /* room for chevrons */
}

/* Sticky first column (header + cells) */
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 10;                /* above scrolling cells */
  background: rgba(255,255,255,0.8);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  border-right: 1px solid rgba(0,0,0,0.08);
  /* subtle divider shadow on the right */
  box-shadow: 6px 0 8px -6px rgba(0,0,0,0.15);
}
.sticky-col--header {
  z-index: 11;                /* slightly above row cells */
  background: rgba(255,255,255,0.6);
}

/* Make the sticky header (if you wrap page with one) sit above dots nicely */
:deep(header) {
  backdrop-filter: saturate(1.1) blur(4px);
}
</style>
