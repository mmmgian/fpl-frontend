import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref, type Ref } from 'vue'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import FixturesPage from '../pages/fixtures.vue'

type Event = { id: number; is_current?: boolean; finished?: boolean; deadline_time?: string | null }
type Team = { id: number; name: string; short_name: string; code?: number }
type Fixture = {
  id: number
  event: number | null
  kickoff_time: string | null
  team_h: number
  team_a: number
  team_h_difficulty: number
  team_a_difficulty: number
}

type Bootstrap = { events: Event[]; teams: Team[] }

type AsyncData<T> = { data: Ref<T>; error: Ref<unknown> }

const mockEvents: Event[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  is_current: i === 0,
  finished: false,
  deadline_time: `2024-08-${(i + 1).toString().padStart(2, '0')}T12:00:00Z`,
}))

const mockTeams: Team[] = [
  { id: 1, name: 'Arsenal', short_name: 'ARS', code: 3 },
  { id: 2, name: 'Chelsea', short_name: 'CHE', code: 4 },
]

const fixturesByGw: Record<number, Fixture[]> = {
  1: [
    {
      id: 101,
      event: 1,
      kickoff_time: '2024-08-01T12:00:00Z',
      team_h: 1,
      team_a: 2,
      team_h_difficulty: 2,
      team_a_difficulty: 3,
    },
  ],
  7: [
    {
      id: 701,
      event: 7,
      kickoff_time: '2024-09-07T12:00:00Z',
      team_h: 2,
      team_a: 1,
      team_h_difficulty: 3,
      team_a_difficulty: 2,
    },
  ],
  8: [],
}

const useFetchMock = vi.fn<[], Promise<AsyncData<Bootstrap>>>()

vi.mock('#app', () => ({
  useFetch: useFetchMock,
}))

describe('fixtures page', () => {
  let fetchMock: ReturnType<typeof vi.fn<[string, Record<string, unknown>?], Promise<Fixture[]>>>

  beforeEach(() => {
    useFetchMock.mockResolvedValue({
      data: ref({ events: mockEvents, teams: mockTeams }),
      error: ref(null),
    })

    fetchMock = vi.fn(async (request: string, _init?: Record<string, unknown>) => {
      const match = request.match(/\/api\/fixtures\/(\d+)/)
      if (!match) {
        return []
      }
      const gw = Number(match[1])
      return fixturesByGw[gw] ?? []
    })

    vi.stubGlobal('$fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    useFetchMock.mockReset()
  })

  it('updates fixtures when the start gameweek changes', async () => {
    const wrapper = mount(FixturesPage)

    await flushPromises()
    await nextTick()

    const firstHeader = wrapper.get('thead th:nth-of-type(2) .font-medium')
    expect(firstHeader.text()).toContain('GW 1')

    const startSelect = wrapper.get('#start-gw')
    const initialCalls = fetchMock.mock.calls.length

    await startSelect.setValue('3')
    await nextTick()
    await flushPromises()

    const updatedHeader = wrapper.get('thead th:nth-of-type(2) .font-medium')
    expect(updatedHeader.text()).toContain('GW 3')

    expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls)

    const newCalls = fetchMock.mock.calls.slice(initialCalls)
    expect(newCalls).toEqual(
      expect.arrayContaining([
        [
          '/api/fixtures/7',
          expect.objectContaining({ headers: { 'cache-control': 'no-store' } }),
        ],
      ]),
    )

    wrapper.unmount()
  })
})
