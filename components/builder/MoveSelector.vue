<template>
  <Selector
    ref="selector"
    v-model:open="open"
    v-model:query="query"
    base="w-80 right-0 mt-1"
    :items
    :filter
    @chose="onChoose"
  >
    <UInput
      v-model="query"
      placeholder="Add move..."
      :color="isIllegal(normalizeName(query)) ? 'red' : undefined"
      @focus="open = true"
      @update:model-value="open = true"
      @keydown.tab="open = false"
    />

    <template #item="{ item: [id, move] }">
      <span class="text-sm" :class="[isIllegal(id) && 'text-red-500']">{{ move.name }}</span>

      <div class="flex justify-end gap-2">
        <div class="flex items-center">
          <TypeBadge :type="move.type" image />
        </div>
        <div class="flex items-center">
          <MoveCategory :category="getCategory(move)" image />
        </div>
        <div class="flex flex-col w-8">
          <span class="text-[0.6rem] text-center text-gray-400">Power</span>
          <span class="text-sm text-center">{{ move.power || "--" }}</span>
        </div>
        <div class="flex flex-col w-8">
          <span class="text-[0.6rem] text-center text-gray-400">Acc</span>
          <span class="text-sm text-center">{{ move.acc ?? "--" }}</span>
        </div>
      </div>
    </template>

    <template #empty>No move found</template>
  </Selector>
</template>

<script setup lang="ts">
import { speciesList, type Species, type SpeciesId } from "~/game/species";
import { getCategory, type Move, type MoveId } from "~/game/moves";
import { moveListEntries as items } from "#imports";

const query = defineModel<string>({ default: "" });
const { poke } = defineProps<{ poke?: PokemonDesc }>();
const open = ref(false);
const species = computed<Species | undefined>(() => speciesList[poke?.species as SpeciesId]);

const filter = (moves: typeof items, query: string) => {
  const q = normalizeName(query);
  const all = moves.filter(([id, _]) => id.includes(q));
  if (poke) {
    const currentMoves = poke.moves.map(normalizeName);

    let subset = all.filter(([id, _]) => !currentMoves.includes(id));
    if (species.value) {
      subset = subset.filter(([id, _]) => (species.value!.moves as string[]).includes(id));
    }

    if (subset.length) {
      return subset;
    }
  }
  return all;
};

const onChoose = ([_, move]: [string, Move]) => (query.value = move.name);

const isIllegal = (id: string) => {
  if (!id) {
    return false;
  }
  return species.value ? !species.value.moves.includes(id as MoveId) : true;
};
</script>
