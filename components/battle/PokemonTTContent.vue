<template>
  <div class="flex flex-col gap-1.5 p-2 text-sm sm:text-md">
    <div class="flex justify-between items-center gap-4">
      <div class="flex gap-0.5 items-center justify-center">
        <span>{{ poke.species.name }}</span>
        <GenderIcon class="size-4" :gender="gen1Gender[poke.speciesId] ?? poke.gender" />

        <template v-if="poke._item">
          <ItemSprite :item="poke._item" />
          <span class="text-xs" :class="poke.itemUnusable && 'line-through italic text-primary'">
            {{ itemList[poke._item].name }}
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

    <UProgress :max="poke.stats.hp" :value="poke.hp" />
    <div class="flex justify-between gap-4">
      <span>
        {{ poke.hp }}/{{ poke.stats.hp }} HP ({{
          roundTo(hpPercentExact(poke.hp, poke.stats.hp), 2)
        }}%)
      </span>

      <StatusOrFaint :poke="poke" :faint="!active || active.fainted" />
    </div>

    <div class="flex gap-1 justify-center">
      <template v-for="(name, stat) in statKeys">
        <template v-if="stat !== 'hp'">
          <UBadge :key="stat" color="black" :class="statClass(stat)">
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
          {{ poke.gen.moveList[id].name }} ({{ poke.pp[i] }}/{{
            poke.gen.getMaxPP(poke.gen.moveList[id])
          }})
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type {Pokemon} from "~/game/pokemon";
import {hpPercentExact, type StatStageId, type Weather} from "~/game/utils";
import "assets/colors.css";
import {itemList} from "~/game/item";
import {abilityList} from "~/game/species";
import type {MoveId} from "~/game/moves";

const {active, poke, weather} = defineProps<{
  active?: ClientActivePokemon;
  poke: Pokemon;
  weather?: Weather;
}>();
const statKeys = computed(() => getStatKeys(poke.gen));

const statClass = (stat: StatStageId) => {
  if (!active?.v.stats || poke.stats[stat] === active.v.stats[stat]) {
    return "";
  }
  return poke.stats[stat] > active.v.stats[stat] ? "down" : "up";
};

const getType = (id: MoveId) => {
  const move = poke.gen.moveList[id];
  if (move.kind === "damage" && poke && move.getType) {
    return move.getType(poke, weather);
  }
  return move.type;
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
