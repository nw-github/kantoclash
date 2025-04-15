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
      :color="isIllegal(normalizeName(query)) || hasConflict() ? 'red' : undefined"
      :trailing-icon="trailing ? undefined : 'heroicons:chevron-down-20-solid'"
      @focus="open = true"
      @update:model-value="open = true"
      @keydown.tab="open = false"
    >
      <template v-if="trailing" #trailing>
        <div class="gap-1 flex items-center justify-center">
          <TypeBadge :type="trailing[0]" class="size-[16px] sm:size-[16px]" image />
          <span class="text-sm">{{ trailing[1] }}</span>
        </div>
      </template>
    </UInput>

    <template #item="{item: [id, move]}">
      <span class="text-sm" :class="[isIllegal(id) && 'text-red-500']">{{ move.name }}</span>

      <div class="flex justify-end gap-2">
        <div class="flex items-center">
          <TypeBadge :type="move.type" image />
        </div>
        <div class="flex items-center">
          <MoveCategory :category="gen.getCategory(move)" image />
        </div>
        <div class="flex flex-col w-8">
          <span class="text-[0.6rem] text-center text-gray-400">Power</span>
          <span class="text-sm text-center">{{ move.power || "--" }}</span>
        </div>
        <div class="flex flex-col w-8">
          <span class="text-[0.6rem] text-center text-gray-400">Acc</span>
          <span class="text-sm text-center">{{ move.acc || "--" }}</span>
        </div>
        <div class="flex flex-col w-8">
          <span class="text-[0.6rem] text-center text-gray-400">PP</span>
          <span class="text-sm text-center">{{ gen.getMaxPP(move) }}</span>
        </div>
      </div>
    </template>

    <template #empty>No move found</template>
  </Selector>
</template>

<script setup lang="ts">
import type {Species, SpeciesId} from "~/game/species";
import type {Move, MoveId} from "~/game/moves";
import {Pokemon, type PokemonDesc} from "~/game/pokemon";
import type {Generation} from "~/game/gen";
import {ivsToDvs} from "~/utils/pokemon";

const query = defineModel<string>({default: ""});
const {poke, gen, idx} = defineProps<{poke: PokemonDesc; gen: Generation; idx: number}>();
const open = ref(false);
const species = computed<Species | undefined>(() => gen.speciesList[poke?.species as SpeciesId]);
const items = computed(() => Object.entries(gen.moveList) as [MoveId, Move][]);
const trailing = computed(() => {
  const q = normalizeName(query.value);
  const move = q && q in gen.moveList ? gen.moveList[q as MoveId] : undefined;
  if (!move || move.kind !== "damage") {
    return;
  }

  const base = new Pokemon(gen, {
    species: "abra",
    moves: [],
    ivs: gen.id <= 2 ? ivsToDvs(gen, poke.ivs ?? {}) : poke.ivs,
    friendship: poke.friendship,
  });
  const type = move.getType ? move.getType(base) : move.type;
  const pow = move.getPower ? move.getPower(base) : move.power;
  if (type === move.type && pow === move.power) {
    return;
  }

  return [type, pow] as const;
});

const filter = (moves: [MoveId, Move][], query: string) => {
  const q = normalizeName(query);
  const all = moves.filter(([id, _]) => id.includes(q));
  if (poke) {
    const currentMoves = poke.moves.map(normalizeName);

    let subset = all.filter(([id, _]) => !currentMoves.includes(id));
    if (species.value) {
      subset = subset.filter(([id, _]) => !isIllegal(id));
    }

    if (subset.length) {
      return subset;
    }
  }
  return all;
};

const onChoose = ([_, move]: [string, Move]) => (query.value = move.name);

const hasConflict = () => {
  const q = normalizeName(query.value);
  if (!q) {
    return false;
  }
  return poke.moves.findIndex((m, i) => m && normalizeName(m) === q && i !== idx) !== -1;
};

const isIllegal = (id: string) => {
  if (!id) {
    return false;
  } else if (!species.value) {
    return true;
  } else if (species.value.moves.includes(id)) {
    return false;
  } else if (species.value.moves.includes("sketch")) {
    return !isValidSketchMove(gen, id);
  }
  return true;
};
</script>
