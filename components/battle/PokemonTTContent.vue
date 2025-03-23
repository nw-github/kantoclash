<template>
  <div class="flex flex-col gap-1.5 p-2 text-sm sm:text-md">
    <div class="flex justify-between items-center gap-4">
      <div class="flex gap-0.5 items-center justify-center">
        <span>{{ poke.species.name }}</span>
        <GenderIcon class="size-4" :gender="poke.gender ?? gen1Gender[poke.speciesId]" />
      </div>

      <div class="flex gap-1">
        <TypeBadge v-for="type in poke.species.types" :key="type" :type image />
      </div>
    </div>

    <UProgress :max="poke.stats.hp" :value="poke.hp" />
    <div class="flex justify-between gap-4">
      <span>
        {{ poke.hp }}/{{ poke.stats.hp }} HP ({{
          roundTo(hpPercentExact(poke.hp, poke.stats.hp), 2)
        }}%)
      </span>

      <StatusOrFaint :poke="poke" :faint="!active || active.fainted" />
    </div>

    <div class="flex gap-1">
      <template v-for="(name, stat) in statKeys">
        <template v-if="stat !== 'hp'">
          <UBadge :key="stat" color="black" :class="statClass(stat)">
            <span>{{ active?.v.stats?.[stat] ?? poke.stats[stat] }}</span>
            {{ name }}
          </UBadge>
        </template>
      </template>
    </div>

    <ul class="pl-10 list-disc">
      <li v-for="(id, i) in poke.moves" :key="id">
        {{ poke.gen.moveList[id].name }} ({{ poke.pp[i] }}/{{
          poke.gen.getMaxPP(poke.gen.moveList[id])
        }})
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type {Pokemon} from "~/game/pokemon";
import {hpPercentExact, type StatStages} from "~/game/utils";
import "assets/colors.css";

const {active, poke} = defineProps<{active?: ClientActivePokemon; poke: Pokemon}>();
const statKeys = computed(() => getStatKeys(poke.gen));

const statClass = (stat: StatStages) => {
  if (!active?.v.stats || poke.stats[stat] === active.v.stats[stat]) {
    return "";
  }
  return poke.stats[stat] > active.v.stats[stat] ? "down" : "up";
};
</script>

<style scoped>
.down {
  background-color: var(--stat-down);
}

.up {
  background-color: var(--stat-up);
}
</style>
