<template>
  <Selector
    v-model:open="open"
    class="grow"
    base="w-92 sm:w-[31rem] h-60 sm:left-[-7rem]"
    :items
    searchable
    :filter
    @chose="onChoose"
  >
    <div class="w-full h-full flex items-center justify-center">
      <div
        class="w-[128px] h-[117px] cursor-pointer flex items-center justify-center rounded-md hover:bg-gray-200 focus:bg-gray-200 hover:dark:bg-gray-600 focus:dark:bg-gray-600"
        :class="model && model in gen.speciesList && isIllegal(gen.speciesList[model as SpeciesId]) && 'border border-primary'"
        tabindex="0"
        @focus="open = true"
      >
        <Sprite
          :species="(model as SpeciesId)"
          :scale="1.5"
          :shiny
          :form
          :gender
          @click="open = true"
        />
      </div>
    </div>

    <template #item="{item: [id, species]}">
      <div class="flex justify-between gap-8 sm:gap-16 w-full">
        <div class="flex items-center gap-1">
          <BoxSprite :species="id" :form />
          <span class="text-xs sm:text-sm truncate" :class="[isIllegal(species) && 'text-red-500']">
            {{ species.name }}
          </span>
        </div>

        <div class="flex items-center gap-2 justify-end">
          <TypeBadge v-for="type in species.types" :key="type" :type image />
          <div class="flex items-center">
            <div v-for="(name, stat) in statKeys" :key="stat" class="flex flex-col w-6 sm:w-8">
              <span class="text-[0.6rem] text-center text-gray-400">{{ name }}</span>
              <span
                class="text-[0.7rem] sm:text-xs text-center"
                :style="{color: baseStatColor(species.stats[stat])}"
              >
                {{ species.stats[stat] }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #empty>No Pokémon found</template>
  </Selector>
</template>

<script setup lang="ts">
import type {Species, SpeciesId} from "@/game/species";
import type {Generation} from "~/game/gen1";
import type {FormId, Gender} from "~/game/pokemon";

const emit = defineEmits<{(e: "chose", species: Species): void}>();

const model = defineModel<string>();
const {team, gen} = defineProps<{
  team: Team;
  gen: Generation;
  gender?: Gender;
  shiny: boolean;
  form?: FormId;
}>();
const open = ref(false);
const items = computed(() => Object.entries(gen.speciesList) as [SpeciesId, Species][]);
const statKeys = computed(() => getStatKeys(gen));

const filter = (species: [SpeciesId, Species][], query: string) => {
  const q = normalizeName(query);
  const all = species.filter(([id, _]) => normalizeName(id).includes(q));
  const currentSpecies = team.pokemon.map(p => normalizeName(p.species));
  let subset = all
    .filter(([id, _]) => !currentSpecies.includes(id))
    .filter(([_, species]) => gen.validSpecies(species));
  if (team.format === "g1_nfe") {
    subset = subset.filter(([_, species]) => species.evolvesTo);
  }
  return subset.length ? subset : all;
};

const onChoose = ([id, s]: [SpeciesId, Species]) => ((model.value = id), emit("chose", s));

const isIllegal = (species: Species) => {
  if (!gen.validSpecies(species)) {
    return true;
  } else if (team.format === "g1_nfe") {
    return !species.evolvesTo;
  }
  return false;
};
</script>
