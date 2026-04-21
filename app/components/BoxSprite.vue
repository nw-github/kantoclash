<template>
  <div class="flex">
    <span class="pokesprite pokemon" :class="clazz" />
  </div>
</template>

<style scoped>
@import url("/assets/box-sprites.css");

span {
  --scale: v-bind("scale ?? 1");
}
</style>

<script setup lang="ts">
import {GENESECT_FORM, SAWSBUCK_FORM, UNOWN_FORM, type FormId} from "~~/game/pokemon";
import type {SpeciesId} from "~~/game/species";
import {HP_TYPES} from "~~/game/utils";

const {form, speciesId} = defineProps<{
  speciesId?: SpeciesId | string;
  scale?: number;
  shiny?: boolean;
  form?: FormId | string;
}>();

const useForm = () => {
  // prettier-ignore
  switch(speciesId) {
  case "unown": return form && form !== "a" && UNOWN_FORM.includes(form);
  case "arceus": return form && form !== "normal" && HP_TYPES.includes(form);
  case "keldeo": return form && form === "resolute";
  case "genesect": return form && GENESECT_FORM.includes(form);
  case "sawsbuck":
  case "deerling": return form && form !== "spring" && SAWSBUCK_FORM.includes(form);
  default: return false;
  }
};

const clazz = computed(() => {
  if (useForm()) {
    return `${speciesId}${form}`;
  }
  return speciesId;
});
</script>
