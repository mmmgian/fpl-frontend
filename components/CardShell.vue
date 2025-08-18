<script setup lang="ts">
defineProps<{
  as?: string
  class?: string
}>()
</script>

<template>
  <component
    :is="as || 'div'"
    class="overflow-hidden rounded-2xl shadow border border-black/10 bg-white"
    :class="class"
  >
    <slot />
  </component>
</template>
