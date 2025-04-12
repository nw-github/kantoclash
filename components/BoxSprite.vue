<template>
  <div class="flex items-center justify-center">
    <span class="pokesprite pokemon" :class="clazz" />
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
  transform: scale(var(--scale));
}
</style>

<script setup lang="ts">
import type {FormId} from "~/game/pokemon";
import type {SpeciesId} from "~/game/species";

const {form, species} = defineProps<{
  species?: SpeciesId;
  scale?: number;
  shiny?: boolean;
  form?: FormId;
}>();

const clazz = computed(() => {
  if (species === "unown" && form && form !== "a") {
    return `${species}${form}`;
  }
  return species;
});
</script>
