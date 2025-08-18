<script setup lang="ts">
defineProps<{
  title?: string
  class?: string
  headerClass?: string
  as?: string
}>()
</script>

<template>
  <CardShell :as="as" :class="class">
    <CardHeader :title="title" :class="headerClass">
      <slot name="header" />
    </CardHeader>
    <slot />
  </CardShell>
</template>
