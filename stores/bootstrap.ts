import { defineStore } from 'pinia'

type Team = { id:number; short_name:string; code:number }
type Event = { id:number; is_current:boolean }

type Bootstrap = {
  teams: Team[]
  events: Event[]
}

export const useBootstrapStore = defineStore('bootstrap', {
  state: () => ({
    data: null as Bootstrap | null,
    loaded: false
  }),
  actions: {
    async load() {
      if (this.loaded) return
      this.data = await $fetch<Bootstrap>('/api/bootstrap-static')
      this.loaded = true
    }
  }
})