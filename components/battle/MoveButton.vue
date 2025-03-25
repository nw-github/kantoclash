<template>
  <UPopover mode="hover" :popper="{placement: 'auto'}">
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
          <h4 class="inline-block w-8 text-center">{{ move.acc ?? "--" }}</h4>
          Accuracy
        </li>
        <li v-if="move.priority">
          <h4 class="inline-block w-8 text-center">
            {{ move.priority > 0 ? `+${move.priority}` : move.priority }}
          </h4>
          Priority
        </li>
        <li class="pt-3">{{ describeMove(gen, option.move) }}</li>
        <li class="pt-3 space-x-1 flex">
          <TypeBadge :type="info[0]" />
          <MoveCategory :category="getCategory(move, info[0])" />
        </li>
      </ul>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type {MoveOption} from "~/game/battle";
import type {Generation} from "~/game/gen1";
import type {Pokemon} from "~/game/pokemon";

defineEmits<{(e: "click"): void}>();

const {gen, option, poke} = defineProps<{option: MoveOption; gen: Generation; poke?: Pokemon}>();
const move = computed(() => gen.moveList[option.move]);
const info = computed(() => {
  let type = move.value.type;
  let pow = move.value.power;
  if (move.value.kind === "damage" && poke && move.value.getPower) {
    pow = move.value.getPower(poke);
  }
  if (move.value.kind === "damage" && poke && move.value.getType) {
    type = move.value.getType(poke);
  }
  if (pow && pow !== 1 && poke?.item && gen.itemTypeBoost[poke.item] === type) {
    pow += Math.floor(pow / 10);
  }

  return [type, pow] as const;
});
</script>
