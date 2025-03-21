<template>
  <div class="flex items-center justify-center">
    <span class="pokesprite pokemon" :class="species" />
  </div>
</template>

<style scoped>
@import url("/assets/box-sprites.css");

div {
  --scale: v-bind("scale ?? 1");

  width: calc(40px * var(--scale));
  height: calc(30px * var(--scale));
}

span {
  transform: scale(var(--scale)) translateY(v-bind("scale ? '25%' : '0%'"));
}
</style>

<script setup lang="ts">
import type {SpeciesId} from "~/game/species";

defineProps<{species?: SpeciesId; scale?: number; shiny?: boolean}>();
</script>
