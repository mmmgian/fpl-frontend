<script setup lang="ts">
defineProps<{
  title?: string
  class?: string
}>()
</script>

<template>
  <div
    class="bg-black/5 px-3 py-2 font-semibold flex items-center justify-between"
    :class="class"
  >
    <span v-if="title">{{ title }}</span>
    <slot />
  </div>
</template>
