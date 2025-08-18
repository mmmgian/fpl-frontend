<script setup lang="ts">
type Pos = 1 | 2 | 3 | 4
type Pick = {
  id: number
  web_name: string
  position: Pos
  team?: number
  gw_points?: number | null
  is_captain?: boolean
}
type TeamPayload = {
  entry_id: number
  team_name: string
  manager_name: string
  gw: number
  picks: Pick[]
}
type Team = { id: number; short_name: string; code: number }
type Bootstrap = { teams: Team[] }

const route = useRoute()

// team payload
const { data: teamRes } = await useFetch<TeamPayload>(
  () => `/api/team/${route.params.entryId}`,
  { server: true, key: () => `team-${route.params.entryId}`, headers: { 'cache-control': 'no-store' } }
)

// bootstrap for crests/short names
const { data: boot } = await useFetch<Bootstrap>('/api/bootstrap-static', {
  server: true, key: 'boot-team', headers: { 'cache-control': 'no-store' }
})

// tenure (NEW)
type Tenure = {
  entry_id: number
  seasons_played: number
  first_season: string | null
  playing_since_year: number | null
  seasons: string[]
}
const { data: tenure } = await useFetch<Tenure>(
  () => `/api/tenure/${route.params.entryId}`,
  { server: true, key: () => `tenure-${route.params.entryId}`, headers: { 'cache-control': 'no-store' } }
)

const teamById = computed(() => {
  const m = new Map<number, Team>()
  for (const t of (boot.value?.teams ?? [])) if (t?.id) m.set(t.id, t as Team)
  return m
})

const payload = computed(() => teamRes.value)

const POS_LABEL: Record<Pos, string> = { 1: 'Goalkeeper', 2: 'Defenders', 3: 'Midfielders', 4: 'Forwards' }
const short = (teamId?: number) => teamId ? (teamById.value.get(teamId)?.short_name ?? '—') : '—'
const crestUrl = (teamId?: number) => {
  if (!teamId) return ''
  const code = teamById.value.get(teamId)?.code
  return code ? `https://resources.premierleague.com/premierleague/badges/t${code}.png` : ''
}
const pts = (p?: number | null) => (p ?? 0)
const byPointsDesc = (a: Pick, b: Pick) => pts(b.gw_points) - pts(a.gw_points)

const gk  = computed(() => (payload.value?.picks ?? []).filter(p => p.position === 1).sort(byPointsDesc))
const def = computed(() => (payload.value?.picks ?? []).filter(p => p.position === 2).sort(byPointsDesc))
const mid = computed(() => (payload.value?.picks ?? []).filter(p => p.position === 3).sort(byPointsDesc))
const fwd = computed(() => (payload.value?.picks ?? []).filter(p => p.position === 4).sort(byPointsDesc))

const sections = computed(() => ([
  { key: 1 as Pos, label: POS_LABEL[1], rows: gk.value },
  { key: 2 as Pos, label: POS_LABEL[2], rows: def.value },
  { key: 3 as Pos, label: POS_LABEL[3], rows: mid.value },
  { key: 4 as Pos, label: POS_LABEL[4], rows: fwd.value },
]))

const goHome = () => navigateTo('/')
</script>

<template>
  <!-- Overall page container -->
  <section class="px-4 py-6">
    <!-- Back -->
    <div class="max-w-2xl md:max-w-3xl mx-auto mb-6">
      <button
        type="button"
        class="px-4 py-1.5 rounded-full border border-black/10 bg-white hover:bg-black/5 transition text-sm"
        @click="goHome"
      >
        ← Home
      </button>
    </div>

    <!-- Centered identity block -->
    <div class="max-w-2xl md:max-w-3xl mx-auto text-center mb-8">
  <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight">
    {{ payload?.team_name || 'Team' }}
  </h1>
  <p class="mt-1 text-lg text-gray-600">
    {{ payload?.manager_name || 'Manager' }}
  </p>

  <!-- Tenure handling -->
  <p v-if="tenure" class="mt-1 text-xs text-gray-400 tracking-wide">
    <template v-if="tenure.seasons_played === 0">
      Manager’s first season in charge
    </template>
    <template v-else>
      Playing since {{ tenure.playing_since_year ?? '—' }}
      · {{ tenure.seasons_played }} season{{ tenure.seasons_played === 1 ? '' : 's' }}
    </template>
  </p>

  <p class="text-sm text-gray-400">GW {{ payload?.gw ?? '—' }}</p>
</div>

    <!-- Centered pill card -->
    <div class="max-w-2xl md:max-w-3xl mx-auto rounded-[28px] border border-black/10 bg-white/90 shadow-sm overflow-hidden">
      <div class="p-4 md:p-6">
        <!-- Sections: GK / DEF / MID / FWD -->
        <div
          v-for="sec in sections"
          :key="sec.key"
          class="mb-6 last:mb-0"
        >
          <h2 class="text-sm font-semibold tracking-wide uppercase text-gray-600 mb-2">
            {{ sec.label }}
          </h2>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-white/80 border-b border-black/10 text-left">
                  <th class="px-3 py-2">Player</th>
                  <th class="px-3 py-2 w-36">Team</th>
                  <th class="px-3 py-2 w-28 text-right">Points (GW)</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in sec.rows"
                  :key="`${sec.key}-${p.id}`"
                  class="border-t border-black/10 hover:bg-black/5 transition-colors"
                >
                  <td class="px-3 py-2">
                    <span class="font-medium">{{ p.web_name }}</span>
                    <span v-if="p.is_captain" class="ml-1 text-xs opacity-70">(c)</span>
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex items-center gap-2">
                      <img
                        v-if="crestUrl(p.team)"
                        :src="crestUrl(p.team)"
                        alt=""
                        class="w-5 h-5 object-contain"
                        decoding="async"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                      />
                      <span>{{ short(p.team) }}</span>
                    </div>
                  </td>
                  <td class="px-3 py-2 text-right font-semibold">{{ p.gw_points ?? 0 }}</td>
                </tr>

                <tr v-if="!sec.rows.length">
                  <td class="px-3 py-3 text-gray-600" colspan="3">No players found.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  </section>
</template>