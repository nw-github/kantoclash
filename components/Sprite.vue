<template>
  <NuxtImg :srcset="sprite" :alt="species?.name" />
</template>

<style scoped>
img {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}
</style>

<script setup lang="ts">
import type { Species } from "~/game/species";

const props = defineProps<{
  species?: Species;
  kind: "front" | "back" | "box";
  scale?: number;
  substitute?: boolean;
}>();
const sprite = computed(() => {
  const scale =
    1 / (props.substitute && props.kind !== "front" ? (props.scale ?? 1) / 2 : props.scale ?? 1);
  if (!props.species) {
    return `/sprites/${props.kind === "box" ? "box" : "battle"}/unknown.png ${scale}x`;
  }

  const id = props.substitute ? "substitute" : props.species.dexId;
  if (props.kind === "front") {
    return `/sprites/battle/${id}.gif ${scale}x`;
  } else if (props.kind === "back") {
    return `/sprites/battle/back/${id}.gif ${scale}x`;
  } else {
    return `/sprites/box/${props.species.dexId}.png ${scale}x`;
  }
});
</script>
