<template>
  <Selector
    v-model:open="open"
    class="grow"
    base="w-80 sm:w-[31rem] max-h-60 sm:left-[-6rem]"
    :items
    searchable
    :filter
    @chose="onChoose"
  >
    <div class="w-full h-full flex items-center justify-center">
      <div
        class="w-[128px] h-[117px] cursor-pointer flex items-center justify-center rounded-md hover:bg-gray-200 focus:bg-gray-200 hover:dark:bg-gray-600 focus:dark:bg-gray-600"
        tabindex="0"
        @focus="open = true"
      >
        <Sprite :species="(model as SpeciesId)" :scale="2" @click="open = true" />
      </div>
    </div>

    <template #item="{ item: [id, species] }">
      <div class="flex items-center gap-1">
        <BoxSprite :species="id" />
        <span class="text-xs sm:text-sm truncate" :class="[isIllegal(species) && 'text-red-500']">
          {{ species.name }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <TypeBadge v-for="type in species.types" :key="type" :type image />
        <div class="flex items-center gap-0.5">
          <UBadge
            v-for="(name, stat) in statKeys"
            :key="stat"
            color="white"
            class="w-6 sm:w-11"
            size="xs"
            :ui="{ rounded: 'rounded-lg' }"
          >
            <span
              class="text-[0.5rem] text-center sm:text-left sm:text-[0.6rem] grow"
              :style="{ color: baseStatColor(species.stats[stat]) }"
            >
              {{ species.stats[stat] }}
            </span>
            <span class="text-[0.5rem] hidden sm:block">{{ name }}</span>
          </UBadge>
        </div>
      </div>
    </template>

    <template #empty>No Pokémon found</template>
  </Selector>
</template>

<script setup lang="ts">
import type { Species, SpeciesId } from "@/game/species";
import type { Generation } from "~/game/gen1";

const model = defineModel<string>();
const { team, gen } = defineProps<{ team: Team; gen: Generation }>();
const open = ref(false);
const items = computed(() => Object.entries(gen.speciesList) as [SpeciesId, Species][]);
const statKeys = computed(() => getStatKeys(gen));

const filter = (species: [SpeciesId, Species][], query: string) => {
  const q = normalizeName(query);
  const all = species.filter(([id, _]) => normalizeName(id).includes(q));
  const currentSpecies = team.pokemon.map(p => normalizeName(p.species));
  let subset = all.filter(([id, _]) => !currentSpecies.includes(id));
  if (team.format.startsWith("g1")) {
    // subset = subset.filter(([_, species]) => species.dexId <= 151);
  }
  if (team.format === "g1_nfe") {
    subset = subset.filter(([_, species]) => species.evolvesTo);
  }
  return subset.length ? subset : all;
};

const onChoose = ([id, _]: [SpeciesId, Species]) => (model.value = id);

const isIllegal = (species: Species) => {
  if (team.format.startsWith("g1") && species.dexId > 151) {
    return true;
  } else if (team.format === "g1_nfe") {
    return !species.evolvesTo;
  }
  return false;
};
</script>
