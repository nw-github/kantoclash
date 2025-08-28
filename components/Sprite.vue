<template>
  <NuxtImg :srcset="sprite" :alt="speciesId ?? 'unknown'" />
</template>

<style scoped>
img {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}
</style>

<script setup lang="ts">
import type {FormId, Gender} from "~/game/pokemon";

const {scale, speciesId, shiny, back, form, gender} = defineProps<{
  speciesId?: string;
  back?: bool;
  scale?: number;
  shiny?: bool;
  form?: FormId;
  gender?: Gender;
}>();
const sprite = computed(() => {
  const sc = 1 / (scale ?? 1);
  return getSpritePath(speciesId, gender === "F", shiny, back, form) + ` ${sc}x`;
});
</script>
