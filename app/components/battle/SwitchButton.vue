<template>
  <TouchPopover :disabled="noPopover">
    <UButton class="w-full" :disabled :color="active ? 'info' : 'primary'" @click="$emit('click')">
      <div class="w-full space-y-0.5">
        <div class="flex items-center gap-1 w-full justify-start">
          <BoxSprite :species-id="poke.speciesId" :form="poke.form" />
          <span class="truncate">{{ poke.name }}</span>
          <GenderIcon class="size-4" :gender="gen1Gender[poke.speciesId] ?? poke.gender" />
          <StatusOrFaint :poke size="xs" class="ml-auto" />
        </div>
        <UProgress
          v-model:model-value="poke.hp"
          :max="poke.stats.hp"
          :color="colorForHp"
          class="w-full h-1"
        />
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
    return "error";
  } else if (poke.hpPercent < 30) {
    return "warning";
  } else {
    return "success";
  }
});
</script>
