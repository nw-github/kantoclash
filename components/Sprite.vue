<template>
  <NuxtImg :srcset="sprite" :alt="species ?? 'unknown'" />
</template>

<style scoped>
img {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}
</style>

<script setup lang="ts">
import type {FormId} from "~/game/pokemon";

const props = defineProps<{
  species?: string;
  back?: bool;
  scale?: number;
  shiny?: bool;
  form?: FormId;
}>();
const sprite = computed(() => {
  const scale = 1 / (props.scale ?? 1);
  return getSpritePath(props.species, false, props.shiny, props.back, props.form) + ` ${scale}x`;
});
</script>
