<template>
  <img v-if="image" class="size-[24px]" :src="`/sprites/misc/move-${category}.png`" />
  <UBadge v-else :color="color[category]" :label="toTitleCase(category)" />
</template>

<script setup lang="ts">
defineProps<{category: "physical" | "special" | "status"; image?: bool}>();

const color = {physical: "red", special: "gray", status: "gray"} as const;
</script>
