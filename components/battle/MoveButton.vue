<template>
  <UPopover mode="hover" :popper="{ placement: 'auto' }">
    <UButton
      :disabled="!option.valid"
      class="flex justify-between content-center w-full p-1 text-black"
      color="gray"
      @click="$emit('click')"
    >
      <div class="flex items-center">
        <div class="pl-0.5 pr-1">
          <TypeBadge :type="move.type" :alt="move.type" image />
        </div>
        <span class="text-sm sm:text-base truncate">{{ move.name }}</span>
      </div>
      <span class="text-xs">
        {{ option.pp !== undefined ? option.pp : "--" }}/{{ getMaxPP(move) }}
      </span>
    </UButton>

    <template #panel>
      <ul class="list-none p-2 m-0 w-max max-w-[300px]">
        <li>
          <h4 class="inline-block w-8 text-center">{{ move.power || "--" }}</h4>
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
        <li class="pt-3">{{ describeMove(option.move) }}</li>
        <li class="pt-3 space-x-1 flex">
          <TypeBadge :type="move.type" />
          <MoveCategory :category="getCategory(move)" />
        </li>
      </ul>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type { MoveOption } from "~/game/battle";
import { getCategory, getMaxPP, moveList } from "~/game/moves";

defineEmits<{ (e: "click"): void }>();

const props = defineProps<{ option: MoveOption }>();
const move = computed(() => moveList[props.option.move]);
</script>
