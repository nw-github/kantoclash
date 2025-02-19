<template>
  <div>
    <UInput
      placeholder="Add move..."
      @focus="open = true"
      @update:model-value="open = true"
      v-model="query"
      v-bind="$props"
    />

    <ul
      class="absolute z-30 w-80 max-h-60 right-0 mt-1.5 p-1 focus:outline-none overflow-auto scroll-py-1 ring-1 ring-gray-200 dark:ring-gray-700 rounded-md shadow-lg bg-white dark:bg-gray-800"
      v-if="open"
      ref="container"
    >
      <li
        v-for="([id, move], i) in filteredMoves"
        class="cursor-default select-none relative flex items-center justify-between gap-1 rounded-md px-1.5 py-1 text-sm text-gray-900 dark:text-white"
        :class="[hovered === i && 'bg-gray-100 dark:bg-gray-900', hovered === i && 'hovered']"
        @click="(query = move.name), (open = false)"
        @mouseover="hovered = i"
        @mouseleave="hovered = hovered === i ? -1 : hovered"
      >
        <span class="text-sm" :class="[isIllegal(id) && 'text-red-500']">{{ move.name }}</span>

        <div class="flex justify-end space-x-2">
          <div class="flex items-center">
            <TypeBadge :type="move.type" />
          </div>
          <div class="flex items-center">
            <img :src="category[move.category]" :width="24" :height="24" />
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
      </li>

      <li v-if="!filteredMoves.length" class="text-center text-sm">No move found</li>
    </ul>
  </div>
</template>

<style scoped>
img {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}
</style>

<script setup lang="ts">
import { moveList, type MoveId } from "@/game/moveList";
import { speciesList, type Species, type SpeciesId } from "@/game/species";

const query = defineModel({ default: "" });
const props = defineProps<{ poke?: PokemonDesc }>();
const open = ref(false);
const container = ref<HTMLUListElement>();
const hovered = ref(0);

watch(open, async value => {
  if (value && filteredMoves.value.length) {
    hovered.value = 0;
  }
});

onKeyStroke("ArrowDown", () => trySetHovered(1));
onKeyStroke("ArrowUp", () => trySetHovered(-1));
onKeyStroke("Enter", () => {
  if (filteredMoves.value[hovered.value]) {
    query.value = filteredMoves.value[hovered.value][1].name;
    open.value = false;
  }
});
onClickOutside(container, () => (open.value = false));

const category = {
  physical: "/sprites/misc/move-physical.png",
  special: "/sprites/misc/move-special.png",
  status: "/sprites/misc/move-status.png",
};
const moves = Object.entries(moveList);
const species = computed<Species | undefined>(() => speciesList[props.poke?.species as SpeciesId]);

const filteredMoves = computed(() => {
  const q = normalizeName(query.value);
  const all = moves.filter(([id, _]) => id.includes(q));
  if (props.poke) {
    const currentMoves = props.poke.moves.map(normalizeName);

    let subset = all.filter(([id, _]) => !currentMoves.includes(id));
    if (species.value) {
      subset = subset.filter(([id, _]) => (species.value!.moves as string[]).includes(id));
    }

    if (subset.length) {
      return subset;
    }
  }
  return all;
});

const isIllegal = (id: string) => {
  if (!species.value) {
    return true;
  }
  return !species.value.moves.includes(id as MoveId);
};

const trySetHovered = (offset: number) => {
  if (offset < 0) {
    if (hovered.value === -1) {
      hovered.value = filteredMoves.value.length - 1;
    }

    hovered.value = Math.max(0, hovered.value - 1);
  } else {
    hovered.value = Math.min(filteredMoves.value.length - 1, hovered.value + 1);
  }

  nextTick(() => {
    document.querySelector(".hovered")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
};
</script>
