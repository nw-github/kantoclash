<template>
  <Selector
    v-model:open="open"
    v-model:query="query"
    :content="{align: 'end'}"
    :ui="{list: 'min-w-80'}"
    :items
    :filter
    @select="onChoose"
  >
    <UInput
      v-model="query"
      :class="ui"
      placeholder="Add move..."
      color="error"
      :highlight="isIllegal(normalizeName(query)) || hasConflict()"
      :trailing-icon="trailing ? undefined : 'lucide:chevron-down'"
      :ui="{trailing: 'pointer-events-none'}"
      @focus="(open = true), $event.target.select()"
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
          <span class="text-[0.6rem] text-center text-dimmed">Power</span>
          <span class="text-sm text-center">{{ move.power || "--" }}</span>
        </div>
        <div class="flex flex-col w-8">
          <span class="text-[0.6rem] text-center text-dimmed">Acc</span>
          <span class="text-sm text-center">{{ move.acc || "--" }}</span>
        </div>
        <div class="flex flex-col w-8">
          <span class="text-[0.6rem] text-center text-dimmed">PP</span>
          <span class="text-sm text-center">{{ gen.getMaxPP(move) }}</span>
        </div>
      </div>
    </template>

    <template #empty>No move found</template>
  </Selector>
</template>

<script setup lang="ts">
import type {Species, SpeciesId} from "~~/game/species";
import type {Move, MoveId} from "~~/game/moves";
import {Pokemon, type PokemonDesc} from "~~/game/pokemon";
import type {Generation} from "~~/game/gen";
import {ivsToDvs} from "~/utils/pokemon";
import type {ItemId} from "~~/game/item";
import {Battle} from "~~/game/battle";

const query = defineModel<string>({default: ""});
const {poke, gen, idx, format} = defineProps<{
  poke: PokemonDesc;
  gen: Generation;
  idx: number;
  format: FormatId;
  ui?: string;
}>();
const open = ref(false);
const species = computed<Species | undefined>(() => gen.speciesList[poke?.speciesId as SpeciesId]);
const items = computed(() => Object.entries(gen.moveList) as [MoveId, Move][]);
const trailing = computed(() => {
  const q = normalizeName(query.value);
  const move = q && q in gen.moveList ? gen.moveList[q as MoveId] : undefined;
  if (move?.kind !== "damage" || move.id === "present") {
    return;
  }

  const battle = createFake();
  const user = battle.players[0].active[0];
  const target = battle.players[1].active[0];
  const type = gen.getMoveType(move, user.base, undefined);
  const pow = gen.getMoveBasePower(move, battle, user, target);
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

const createFake = () => {
  const item = poke.item && (normalizeName(poke.item) as ItemId);
  const base = Pokemon.fromDescriptor(gen, {
    speciesId: "abra",
    moves: [],
    ivs: gen.id <= 2 ? ivsToDvs(gen, poke.ivs ?? {}) : poke.ivs,
    friendship: poke.friendship,
    item: item && item in gen.items ? item : undefined,
    level: poke.level ?? formatInfo[format].maxLevel,
  });

  const target = Pokemon.fromDescriptor(gen, {speciesId: "abra", ivs: {}, moves: [], level: 100});
  const [battle] = Battle.start({
    gen,
    player1: {id: "1", team: [base]},
    player2: {id: "2", team: [target]},
    seed: "1234",
    chooseLead: true,
  });

  return battle;
};
</script>
