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
        <Sprite
          :species="speciesList[model as SpeciesId]"
          :scale="2"
          kind="front"
          @click="open = true"
        />
      </div>
    </div>

    <template #item="{ item: [, species] }">
      <div class="flex items-center gap-1">
        <Sprite :species="species" kind="box" :scale="1" />
        <span
          class="text-xs sm:text-sm text-ellipsis whitespace-nowrap overflow-hidden"
          :class="[isIllegal(species) && 'text-red-500']"
        >
          {{ species.name }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <img
          v-for="type in species.types"
          :key="type"
          class="size-[20px] sm:size-[24px]"
          :src="`/sprites/type/${type}.png`"
          :alt="type"
        />
        <div class="flex items-center gap-0.5">
          <UBadge
            v-for="stat in statKeys"
            :key="stat"
            color="white"
            class="w-6 sm:w-11"
            size="xs"
            :ui="{ rounded: 'rounded-lg' }"
          >
            <span
              class="text-[0.5rem] text-center sm:text-left sm:text-[0.6rem] grow"
              :class="baseStatColor(species.stats[stat])"
            >
              {{ species.stats[stat] }}
            </span>
            <span class="text-[0.5rem] hidden sm:block">{{ toTitleCase(stat) }}</span>
          </UBadge>
        </div>
      </div>
    </template>

    <template #empty>No Pokémon found</template>
  </Selector>
</template>

<script setup lang="ts">
import { speciesList, type Species, type SpeciesId } from "@/game/species";
import { statKeys } from "@/game/utils";
import { speciesListEntries as items } from "#imports";

const model = defineModel<string>();
const { team } = defineProps<{ team: Team }>();
const open = ref(false);

const filter = (species: typeof items, query: string) => {
  const q = normalizeName(query);
  const all = species.filter(([id, _]) => id.includes(q));
  const currentSpecies = team.pokemon.map(p => normalizeName(p.species));
  let subset = all.filter(([id, _]) => !currentSpecies.includes(id));
  if (team.format === "nfe") {
    subset = subset.filter(([_, species]) => species.evolves);
  }
  return subset.length ? subset : all;
};

const onChoose = ([id, _]: [string, Species]) => (model.value = id);

const isIllegal = (species: Species) => {
  return team.format === "nfe" ? !species.evolves : false;
};
</script>
