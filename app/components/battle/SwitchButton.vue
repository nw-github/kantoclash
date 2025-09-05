<template>
  <TouchPopover :popper="{placement: 'auto'}" :disabled="noPopover">
    <UButton class="w-full" :disabled :color="active ? 'blue' : 'primary'" @click="$emit('click')">
      <div class="w-full space-y-0.5">
        <div class="flex items-center gap-1 w-full justify-start">
          <BoxSprite :species-id="poke.speciesId" :form="poke.form" />
          <span class="truncate">{{ poke.name }}</span>
          <StatusOrFaint :poke size="xs" class="ml-auto" />
        </div>
        <UProgress :max="poke.stats.hp" :value="poke.hp" :color="colorForHp" class="w-full h-1" />
      </div>
    </UButton>

    <template #panel>
      <PokemonTTContent :poke :weather />
    </template>
  </TouchPopover>
</template>

<script setup lang="ts">
import type {Pokemon} from "~~/game/pokemon";
import type {Weather} from "~~/game/utils";

defineEmits<{(e: "click"): void}>();
const {poke, noPopover, active} = defineProps<{
  poke: Pokemon;
  disabled: boolean;
  active: boolean;
  weather?: Weather;
  noPopover?: bool;
}>();

const colorForHp = computed(() => {
  if (poke.hpPercent < 10) {
    return "red";
  } else if (poke.hpPercent < 30) {
    return "amber";
  } else {
    return "green";
  }
});
</script>
