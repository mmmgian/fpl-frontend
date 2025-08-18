<script setup lang="ts"></script>

<template>
  <div class="min-h-screen bg-white text-black">
    <header class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-black/10">
      <nav class="max-w-5xl mx-auto px-4 py-3 flex gap-3">
        <NuxtLink
          to="/"
          class="px-3 py-1 rounded-full border border-black/15 hover:bg-black hover:text-white transition underline-offset-2"
        >Home</NuxtLink>
        <NuxtLink
          to="/bonus"
          class="px-3 py-1 rounded-full border border-black/15 hover:bg-black hover:text-white transition underline-offset-2"
        >Bonus</NuxtLink>
      </nav>
    </header>

    <main class="max-w-5xl mx-auto px-4 py-6">
      <NuxtPage />
    </main>
  </div>
</template>