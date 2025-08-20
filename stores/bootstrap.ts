import { defineStore } from 'pinia'

type Event = { id:number; is_current?:boolean; finished?:boolean; deadline_time?:string|null }
type Team  = { id:number; name:string; short_name:string; code?:number }
type Element = { id:number; web_name:string; team:number }
type Bootstrap = { events: Event[]; teams: Team[]; elements: Element[] }

export const useBootstrapStore = defineStore('bootstrap', {
  state: () => ({
    data: null as Bootstrap | null,
    _promise: null as Promise<void> | null,
    loadedAt: 0 as number,
  }),
  actions: {
    async load(force = false) {
      if (!force && (this.data || this._promise)) return this._promise ?? Promise.resolve()
      this._promise = (async () => {
        try {
          const res = await $fetch<Bootstrap>('/api/bootstrap-static')
          this.data = res
          this.loadedAt = Date.now()
        } finally {
          this._promise = null
        }
      })()
      return this._promise
    },
  },
})
