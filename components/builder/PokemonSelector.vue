<template>
  <div class="w-full h-full flex items-center justify-center grow">
    <div
      class="w-[128px] h-[117px] my-2 cursor-pointer flex items-center justify-center"
      @click="open = true"
    >
      <Sprite :species="speciesList[model as SpeciesId]" :scale="2" kind="front" />
    </div>
  </div>

  <div class="relative">
    <ul
      v-if="open"
      class="absolute z-30 w-[31rem] max-h-60 left-[-7rem] top-0 p-1 focus:outline-none overflow-auto scroll-py-1 ring-1 ring-gray-200 dark:ring-gray-700 rounded-md shadow-lg bg-white dark:bg-gray-800"
      ref="container"
    >
      <li class="pb-1">
        <UInput v-model="query" placeholder="Search..." autofocus />
      </li>

      <li
        v-for="([_, species], i) in filteredSpecies"
        class="cursor-default select-none relative flex items-center justify-between gap-1 rounded-md px-1.5 py-1 text-sm text-gray-900 dark:text-white"
        :class="[hovered === i && 'bg-gray-100 dark:bg-gray-900', hovered === i && 'hovered']"
        @click="select(i)"
        @mouseover="hovered = i"
        @mouseleave="hovered = hovered === i ? -1 : hovered"
      >
        <div class="flex items-center gap-1">
          <Sprite :species="species" kind="box" :scale="1" />
          <span class="text-xs">{{ species.name }}</span>
        </div>

        <div class="flex items-center gap-2">
          <img
            v-for="type in species.types"
            class="size-[24px]"
            :src="`/sprites/type/${type}.png`"
            :alt="type"
          />
          <div class="flex items-center gap-0.5">
            <UBadge
              v-for="stat in statKeys"
              color="white"
              class="w-11"
              size="xs"
              :ui="{ rounded: 'rounded-lg' }"
            >
              <span class="text-[0.6rem] grow" :class="baseStatColor(species.stats[stat])">
                {{ species.stats[stat] }}
              </span>
              <span class="text-[0.5rem]">{{ toTitleCase(stat) }}</span>
            </UBadge>
          </div>
        </div>
      </li>

      <li v-if="!filteredSpecies.length" class="text-center text-sm">No Pokémon found</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// TODO: unify this component and MoveSelector code

import { speciesList, type SpeciesId } from "@/game/species";
import { statKeys } from "~/game/utils";

const model = defineModel<string>();
const props = defineProps<{ team: Team }>();
const open = ref(false);
const container = ref<HTMLUListElement>();
const hovered = ref(0);
const rawQuery = ref("");
const query = useDebounce(rawQuery, 200);

watch(open, async value => {
  if (value && filteredSpecies.value.length) {
    hovered.value = 0;
  }
});

onKeyStroke("ArrowDown", () => trySetHovered(1));
onKeyStroke("ArrowUp", () => trySetHovered(-1));
onKeyStroke("Enter", () => select(hovered.value));
onClickOutside(container, () => (open.value = false));

const speciesEntries = Object.entries(speciesList);

const filteredSpecies = computed(() => {
  const q = normalizeName(query.value);
  const all = speciesEntries.filter(([id, _]) => id.includes(q));
  const currentSpecies = props.team.pokemon.map(p => normalizeName(p.species));
  const subset = all.filter(([id, _]) => !currentSpecies.includes(id));
  if (subset.length) {
    return subset;
  }
  return all;
});

const trySetHovered = (offset: number) => {
  if (!open.value) {
    return;
  }

  if (offset < 0) {
    if (hovered.value === -1) {
      hovered.value = filteredSpecies.value.length - 1;
    }

    hovered.value = Math.max(0, hovered.value - 1);
  } else {
    hovered.value = Math.min(filteredSpecies.value.length - 1, hovered.value + 1);
  }

  nextTick(() => {
    document.querySelector(".hovered")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
};

function select(value: number) {
  if (open.value && filteredSpecies.value[value]) {
    model.value = filteredSpecies.value[value][0];
    open.value = false;
  }
}
</script>
