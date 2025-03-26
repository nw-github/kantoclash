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
import {speciesList, type SpeciesId} from "~/game/species";

const props = defineProps<{
  species?: string;
  back?: boolean;
  scale?: number;
  substitute?: boolean;
  shiny?: boolean;
}>();
const sprite = computed(() => {
  const scale = 1 / (props.substitute && props.back ? (props.scale ?? 1) / 2 : props.scale ?? 1);
  if (!props.species || !(props.species in speciesList)) {
    return `/sprites/battle/unknown.png ${scale}x`;
  }

  const id = props.substitute ? "substitute" : speciesList[props.species as SpeciesId].dexId;
  const shiny = props.shiny ? "shiny/" : "";
  if (!props.back) {
    return `/sprites/battle/${shiny}${id}.gif ${scale}x`;
  } else {
    return `/sprites/battle/back/${shiny}${id}.gif ${scale}x`;
  }
});
</script>
