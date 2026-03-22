<template>
  <div class="p-2 flex flex-col items-center">
    <div class="flex gap-10">
      <div class="flex gap-0.5 items-center justify-center">
        {{ species.name }}
      </div>
      <div class="flex gap-1 items-center">
        <TypeBadge v-for="type in species.types" :key="type" :type image />
      </div>
    </div>
    <div class="pt-1.5">
      <span>{{ species.abilities.map(a => abilityList[a].name).join(", ") }}</span>
    </div>
    <span class="pt-5 italic text-center">{{ minSpe }} to {{ maxSpe }} Spe</span>
  </div>
</template>

<script setup lang="ts">
import type {Generation} from "~~/game/gen1";
import {Nature} from "~~/game/pokemon";
import {abilityList, type SpeciesId} from "~~/game/species";

const {gen, speciesId, format} = defineProps<{
  gen: Generation;
  speciesId: SpeciesId;
  format: FormatId;
}>();

const species = computed(() => gen.speciesList[speciesId]);

const minSpe = computed(() =>
  gen.calcStat(
    "spe",
    species.value.stats,
    formatInfo[format].maxLevel,
    {spe: 0},
    {spe: 0},
    Nature.quiet,
  ),
);
const maxSpe = computed(() =>
  gen.calcStat(
    "spe",
    species.value.stats,
    formatInfo[format].maxLevel,
    {spe: gen.maxIv},
    {spe: gen.maxEv},
    Nature.timid,
  ),
);
</script>
