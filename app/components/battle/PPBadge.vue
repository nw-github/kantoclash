<template>
  <UBadge color="neutral" variant="outline">
    <span>
      <span :class="ppColor(cur)">{{ cur }}</span
      >/{{ max }} PP
    </span>
  </UBadge>
</template>

<script setup lang="ts">
defineProps<{cur: number; max: number}>();
</script>
