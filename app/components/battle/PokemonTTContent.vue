<template>
  <div class="flex flex-col gap-1.5 p-2 text-sm sm:text-md">
    <div class="flex justify-between items-center gap-4">
      <div class="flex gap-0.5 items-center justify-center">
        <span>{{ poke.species.name }}</span>
        <GenderIcon class="size-4" :gender="gen1Gender[poke.speciesId] ?? poke.gender" />

        <template v-if="poke._itemId">
          <ItemSprite :item="poke._itemId" :gen="poke.gen" />
          <span class="text-xs" :class="poke.itemUnusable && 'line-through italic text-primary'">
            {{ poke.gen.items[poke._itemId].name }}
          </span>
        </template>
      </div>

      <div class="flex gap-1 items-center">
        <span v-if="active?.abilityUnknown">???</span>
        <span v-else-if="active?.v.ability ?? poke.ability" class="text-xs">
          {{ abilityList[(active?.v.ability ?? poke.ability)!].name }}
        </span>

        <TypeBadge v-for="type in poke.species.types" :key="type" :type image />
      </div>
    </div>

    <UProgress :model-value="poke.hp" :max="poke.stats.hp" />
    <div class="flex justify-between gap-4">
      <span>{{ poke.hp }}/{{ poke.stats.hp }} HP ({{ roundTo(poke.hpPercent, 2) }}%)</span>
      <StatusOrFaint :poke="poke" :faint="!active || active.fainted" />
    </div>

    <div class="flex gap-1 justify-center">
      <template v-for="(name, stat) in statKeys">
        <template v-if="stat !== 'hp'">
          <UBadge :key="stat" color="neutral" :class="statClass(stat)">
            <span>{{ active?.v.stats?.[stat] ?? poke.stats[stat] }}</span>
            {{ name }}
          </UBadge>
        </template>
      </template>
    </div>

    <ul class="pl-8 flex flex-col gap-1">
      <li v-for="(id, i) in poke.moves" :key="id" class="flex items-center gap-1">
        <TypeBadge :type="getType(id)" image />
        <span>
          {{ poke.gen.moveList[id].name }} ({{ poke.pp[i] }}/{{ poke.gen.getMaxPP(id) }})
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import {Pokemon} from "~~/game/pokemon";
import type {StatStageId, Weather} from "~~/game/utils";
import {abilityList} from "~~/game/species";
import type {MoveId} from "~~/game/moves";

const {poke: p, weather} = defineProps<{poke: ClientActivePokemon | Pokemon; weather?: Weather}>();
const poke = p instanceof Pokemon ? p : p.base;
const active = p instanceof Pokemon ? undefined : p;
const statKeys = computed(() => getStatKeys(poke.gen));

const statClass = (stat: StatStageId) => {
  if (!active?.v.stats || poke.stats[stat] === active.v.stats[stat]) {
    return "";
  }
  return poke.stats[stat] > active.v.stats[stat] ? "down" : "up";
};

const getType = (id: MoveId) => poke.gen.getMoveType(poke.gen.moveList[id], poke, weather);
</script>

<style scoped>
.down {
  background-color: var(--stat-down);
}

.up {
  background-color: var(--stat-up);
}
</style>
