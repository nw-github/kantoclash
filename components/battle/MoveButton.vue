<template>
  <TouchPopover :popper="{placement: 'auto'}">
    <UButton
      :disabled="!option.valid"
      class="flex justify-between content-center w-full p-1 text-black"
      color="gray"
      @click="$emit('click')"
    >
      <div class="flex items-center">
        <div class="pl-0.5 pr-1">
          <TypeBadge :type="info[0]" :alt="info[0]" image />
        </div>
        <span class="text-sm sm:text-base truncate">{{ move.name }}</span>
      </div>
      <span class="text-xs">
        {{ option.pp !== undefined ? option.pp : "--" }}/{{ gen.getMaxPP(move) }}
      </span>
    </UButton>

    <template #panel>
      <ul class="list-none p-2 m-0 w-max max-w-[300px]">
        <li>
          <h4 class="inline-block w-8 text-center" :class="[move.power !== info[1] && 'font-bold']">
            {{ info[1] || "--" }}
          </h4>
          Power
        </li>
        <li>
          <h4 class="inline-block w-8 text-center" :class="[move.acc !== info[2] && 'font-bold']">
            {{ info[2] || "--" }}
          </h4>
          Accuracy
        </li>
        <li v-if="move.priority">
          <h4 class="inline-block w-8 text-center">
            {{ move.priority > 0 ? `+${move.priority}` : move.priority }}
          </h4>
          Priority
        </li>
        <li class="pt-3">{{ describeMove(gen, option.move) }}</li>
        <li class="pt-3 -mb-1.5 italic text-sm">{{ targeting }}</li>
        <li class="pt-3 space-x-1 flex">
          <TypeBadge :type="info[0]" />
          <MoveCategory :category="gen.getCategory(move, info[0])" />
          <UBadge v-if="move.kind === 'damage' && move.contact" label="Contact" />
        </li>
      </ul>
    </template>
  </TouchPopover>
</template>

<script setup lang="ts">
import type {MoveOption} from "~/game/battle";
import type {Generation} from "~/game/gen";
import TouchPopover from "../TouchPopover.vue";
import {abilityList} from "~/game/species";
import {Range} from "~/game/moves";
import type {Weather} from "~/game/utils";

defineEmits<{(e: "click"): void}>();

const {gen, option, poke, weather} = defineProps<{
  option: MoveOption;
  gen: Generation;
  poke: ClientActivePokemon;
  weather?: Weather;
}>();
const move = computed(() => gen.moveList[option.move]);
const info = computed(() => {
  let type = move.value.type;
  let pow = move.value.power;
  const acc = move.value.acc;
  if (move.value.kind === "damage" && poke && move.value.getPower) {
    pow = move.value.getPower(poke.base!);
  }
  if (move.value.kind === "damage" && poke && move.value.getType) {
    type = move.value.getType(poke.base!, weather);
  }
  if (pow && pow !== 1 && gen.items[poke.base!.item!]?.typeBoost?.type === type) {
    pow += Math.floor(pow * (gen.items[poke.base!.item!]!.typeBoost!.percent / 100));
  }
  if (pow && option.move === "facade" && poke.base!.status) {
    pow *= 2;
  }
  if (pow && option.move === "spitup" && poke.v.stockpile) {
    pow *= poke.v.stockpile;
  }
  if (pow && option.move === "weatherball" && weather) {
    pow *= 2;
  }

  if (
    pow &&
    poke.base!.belowHp(3) &&
    poke.v.ability &&
    abilityList[poke.v.ability].pinchBoostType === type
  ) {
    pow += Math.floor(pow / 2);
  }

  return [type, pow, acc] as const;
});
const targeting = computed(() => {
  // prettier-ignore
  switch (move.value.range) {
  case Range.Self: return "Targets the user.";
  case Range.Random: return "Targets a random opponent.";
  case Range.Adjacent: return "Can target any adjacent Pokémon.";
  case Range.AdjacentFoe: return "Can target any adjacent opponent.";
  case Range.AdjacentAlly: return "Can target any adjacent ally.";
  case Range.SelfOrAdjacentAlly: return "Can target the user or an adjacent ally.";
  case Range.Any: return "Can target any other Pokémon.";
  case Range.All: return "Targets all Pokémon.";
  case Range.AllAllies: return "Targets all ally Pokémon.";
  case Range.AllAdjacent: return "Targets all adjacent Pokémon.";
  case Range.AllAdjacentFoe: return "Targets all adjacent foes.";
  case Range.Field: return "Targets the field.";
  default: return "";
  }
});
</script>
