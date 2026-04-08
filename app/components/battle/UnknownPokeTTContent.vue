<template>
  <div class="p-2 flex flex-col items-center">
    <div class="flex gap-10">
      <div class="flex gap-0.5 items-center justify-center">
        {{ poke.v.species.name }}
        <span v-if="poke.v.transformed">(was {{ poke.base.species.name }})</span>

        <template v-if="poke.owned && poke.v.transformed && poke.base._itemId">
          <ItemSprite :item="poke.base._itemId" :gen="poke.base.gen" />
          <span
            class="text-xs"
            :class="poke.base.itemUnusable && 'line-through italic text-primary'"
          >
            {{ poke.base.gen.items[poke.base._itemId].name }}
          </span>
        </template>
      </div>
      <div class="flex gap-1 items-center">
        <TypeBadge v-for="type in poke.v.species.types" :key="type" :type image />
      </div>
    </div>
    <div v-if="poke.owned && poke.v.transformed" class="pt-1.5 space-y-1.5 w-full">
      <UProgress :model-value="poke.base.hp" :max="poke.base.maxHp" />
      <div class="flex justify-between gap-4">
        <span>
          {{ poke.base.hp }}/{{ poke.base.maxHp }} HP ({{ roundTo(poke.base.hpPercent, 2) }}%)
        </span>

        <StatusOrFaint :poke="poke.base" :faint="poke.v.fainted" />
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
        {{ poke.v.species.abilities.map(a => abilityList[a].name).join(", ") }}
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
          ({{ poke.base.pp[i] }}/{{ poke.base.gen.getMaxPP(id) }})
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import {Nature} from "~~/game/pokemon";
import {abilityList} from "~~/game/species";

const {poke} = defineProps<{poke: ClientActivePokemon}>();

const calc = (ev: number, iv: number, nature: Nature) => {
  let baseStats = poke.v.species.stats;
  if (poke.v.form && poke.v.species.forms?.[poke.v.form]) {
    baseStats = poke.v.species.forms![poke.v.form]!.stats;
  }

  return poke.base.gen.calcStat("spe", baseStats, poke.base.level, {spe: iv}, {spe: ev}, nature);
};

const minSpe = computed(() => calc(0, 0, Nature.quiet));
const maxSpe = computed(() => calc(poke.base.gen.maxEv, poke.base.gen.maxIv, Nature.timid));
</script>
