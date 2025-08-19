<script setup lang="ts">
import { useBootstrapStore } from '~/stores/bootstrap'

const boot = useBootstrapStore()
await boot.load()  // runs once per session
useHead({
  bodyAttrs: { class: 'dots-scroll' }
})
</script>

<template>
  <div class="kiko-polka min-h-screen">
    <header class="sticky top-0 z-20 bg-white/70 backdrop-blur-sm border-b border-black/10">
      <nav class="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
        <NuxtLink 
          to="/" 
          class="px-3 py-1.5 rounded-full border border-black/10 hover:bg-black/5 transition text-sm"
        >
          Home
        </NuxtLink>
        <NuxtLink 
          to="/bonus" 
          class="px-3 py-1.5 rounded-full border border-black/10 hover:bg-black/5 transition text-sm"
        >
          Bonus
        </NuxtLink>
        <NuxtLink 
          to="/fixtures" 
          class="px-3 py-1.5 rounded-full border border-black/10 hover:bg-black/5 transition text-sm"
        >
          Fixtures
        </NuxtLink>
      </nav>
    </header>
    <main class="max-w-5xl mx-auto px-4 py-6">
      <NuxtPage />
    </main>
  </div>
</template>