<template>
  <div class="flex flex-col gap-1.5 p-2 text-sm sm:text-md">
    <div class="flex justify-between items-center gap-4">
      <span>{{ species.name }}</span>

      <div class="flex gap-1">
        <TypeBadge v-for="type in species.types" :key="type" :type="type" />
      </div>
    </div>

    <UProgress :max="poke.stats.hp" :value="poke.hp" />
    <div class="flex justify-between gap-4">
      <span>
        {{ poke.hp }}/{{ poke.stats.hp }} HP ({{
          roundTo(hpPercentExact(poke.hp, poke.stats.hp), 2)
        }}%)
      </span>

      <StatusOrFaint :poke="poke" faint />
    </div>

    <div class="flex gap-1">
      <template v-for="(val, stat) in poke.stats">
        <template v-if="stat !== 'hp'">
          <UBadge :key="stat" color="black" :class="statClass(stat)">
            <span>{{ active?.stats?.[stat] ?? val }}</span>
            {{ toTitleCase(stat) }}
          </UBadge>
        </template>
      </template>
    </div>

    <ul class="pl-10 list-disc">
      <li v-for="(move, i) in poke.moves" :key="move">
        {{ moveList[move].name }} ({{ poke.pp[i] }}/{{ moveList[move].pp }})
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { Pokemon } from "../../game/pokemon";
import { speciesList } from "../../game/species";
import { moveList } from "../../game/moveList";
import { hpPercentExact } from "../../game/utils";
import "assets/colors.css";

const props = defineProps<{ active?: ClientActivePokemon; poke: Pokemon }>();
const species = computed(() => speciesList[props.poke.speciesId]);

const statClass = (stat: "atk" | "def" | "spe" | "spc") => {
  if (!props.active?.stats || props.poke.stats[stat] === props.active.stats[stat]) {
    return "";
  }

  return props.poke.stats[stat] > props.active.stats[stat] ? "down" : "up";
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
