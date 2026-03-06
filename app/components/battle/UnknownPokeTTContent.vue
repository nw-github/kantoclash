<template>
  <div class="p-2 flex flex-col items-center">
    <div class="flex gap-10">
      <div class="flex gap-0.5 items-center justify-center">
        {{ poke.base.species.name }}
        <span v-if="poke.base.transformed">(Was: {{ poke.base.real.species.name }})</span>

        <template v-if="poke.owned && poke.base.transformed && poke.base._item">
          <ItemSprite :item="poke.base._item" :gen="poke.base.gen" />
          <span
            class="text-xs"
            :class="poke.base.itemUnusable && 'line-through italic text-primary'"
          >
            {{ poke.base.gen.items[poke.base._item].name }}
          </span>
        </template>
      </div>
      <div class="flex gap-1 items-center">
        <TypeBadge v-for="type in poke.base.species.types" :key="type" :type image />
      </div>
    </div>
    <div v-if="poke.owned && poke.base.transformed" class="pt-1.5 space-y-1.5 w-full">
      <UProgress :max="poke.base.stats.hp" :value="poke?.base.hp" />
      <div class="flex justify-between gap-4">
        <span>
          {{ poke.base.hp }}/{{ poke.base.stats.hp }} HP ({{ roundTo(poke.base.hpPercent, 2) }}%)
        </span>

        <StatusOrFaint :poke="poke.base" :faint="poke.fainted" />
      </div>
    </div>
    <div class="pt-1.5">
      <span v-if="poke.v.ability || poke.base.ability">
        <span class="font-bold">
          {{ abilityList[(poke.v.ability || poke.base.ability)!].name }}
        </span>
        <span v-if="poke.base.ability && poke.v.ability && poke.base.ability !== poke.v.ability">
          (was {{ abilityList[poke.base.ability].name }})
        </span>
      </span>
      <span v-else-if="poke.base.gen.id >= 3">
        {{ poke.base.species.abilities.map(a => abilityList[a].name).join(", ") }}
      </span>
    </div>
    <span class="pt-5 italic text-center">{{ minSpe }} to {{ maxSpe }} Spe</span>
    <h3 v-if="!poke.owned && poke.base.moves.length" class="pt-5 font-medium">Known Moves</h3>
    <ul v-if="!poke.owned && poke.base.moves.length" class="text-sm flex flex-col gap-1">
      <li
        v-for="(id, i) in poke.base.moves"
        :key="id"
        class="flex items-center gap-1 justify-between"
      >
        <div class="flex items-center gap-1">
          <TypeBadge :type="poke.base.gen.moveList[id].type" image />
          <span>{{ poke.base.gen.moveList[id].name }}</span>
        </div>
        <span v-if="id !== 'struggle'">
          ({{ poke.base.pp[i] }}/{{ poke.base.gen.getMaxPP(poke.base.gen.moveList[id]) }})
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import {Nature} from "~~/game/pokemon";
import {abilityList} from "~~/game/species";

const {poke} = defineProps<{poke: ClientActivePokemon}>();

const minSpe = computed(() =>
  poke.base.gen.calcStat(
    "spe",
    poke.base.species.stats,
    poke.base.level,
    {spe: 0},
    {spe: 0},
    Nature.quiet,
  ),
);
const maxSpe = computed(() =>
  poke.base.gen.calcStat(
    "spe",
    poke.base.species.stats,
    poke.base.level,
    {spe: poke.base.gen.maxIv},
    {spe: poke.base.gen.maxEv},
    Nature.timid,
  ),
);
</script>
