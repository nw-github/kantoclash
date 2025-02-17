<template>
  <UPopover mode="hover" :popper="{ placement: 'auto' }">
    <UButton
      @click="$emit('click')"
      :disabled="!option.valid"
      class="flex justify-between content-center w-full border p-1 text-black"
    >
      <span class="text-sm sm:text-lg">{{ move.name }}</span>
      <span> {{ option.pp !== undefined ? option.pp : "--" }}/{{ move.pp }} </span>
    </UButton>

    <template #panel>
      <ul class="list-none p-2 m-0 w-max max-w-[300px]">
        <li>
          <h4 class="mb-number">{{ move.power ?? "--" }}</h4>
          Power
        </li>
        <li>
          <h4 class="mb-number">{{ move.acc ?? "--" }}</h4>
          Accuracy
        </li>
        <li v-if="move.priority">
          <h4 class="mb-number">
            {{ move.priority > 0 ? `+${move.priority}` : move.priority }}
          </h4>
          Priority
        </li>
        <li class="pt-3">{{ describeMove(option.move) }}</li>
        <li class="pt-3 space-x-1">
          <TypeBadge :type="move.type" />
          <UBadge :color="categoryColor[category]">{{ toTitleCase(category) }}</UBadge>
        </li>
      </ul>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type { MoveOption } from "@/game/battle";
import { moveList } from "@/game/moveList";
import { isSpecial } from "@/game/utils";

defineEmits<{ (e: "click"): void }>();

const props = defineProps<{ option: MoveOption }>();
const move = computed(() => moveList[props.option.move]);
const category = computed(() => {
  return move.value.power ? (isSpecial(move.value.type) ? "special" : "physical") : "status";
});
const bgColor = computed(() => typeColor[move.value.type]);

const hex2rgba = (rgb: string, a: number) => {
  return `rgba(${rgb
    .slice(1)
    .match(/.{2}/g)!
    .map(n => parseInt(n, 16))
    .join(", ")}, ${a})`;
};

const categoryColor = {
  physical: "red",
  special: "gray",
  status: "gray",
} as const;
</script>

<style scoped>
button {
  border-bottom: 0px;
  background-image: linear-gradient(#fff, v-bind(bgColor));
  border-color: v-bind("hex2rgba(bgColor, 0.8)");
}

button:hover,
button:focus {
  filter: brightness(110%);
}

.mb-number {
  display: inline-block;
  width: 30px;
  padding: 0px;
  margin: 0px;
  text-align: center;
}
</style>
