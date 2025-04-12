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
import {speciesList, type SpeciesId} from "~/game/species";

const props = defineProps<{
  species?: string;
  back?: bool;
  scale?: number;
  shiny?: bool;
  form?: FormId;
}>();
const sprite = computed(() => {
  const scale = 1 / (props.scale ?? 1);
  if (!props.species || !(props.species in speciesList)) {
    return `/sprites/battle/unknown.png ${scale}x`;
  }

  const species = speciesList[props.species as SpeciesId];
  let id = species.sprite ?? String(species.dexId);
  if (props.form) {
    id += `-${props.form}`;
  }

  const shiny = props.shiny ? "shiny/" : "";
  if (!props.back) {
    return `/sprites/battle/${shiny}${id}.gif ${scale}x`;
  } else {
    return `/sprites/battle/back/${shiny}${id}.gif ${scale}x`;
  }
});
</script>
