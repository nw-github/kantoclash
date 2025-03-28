<template>
  <TouchPopover :popper="{placement: 'auto'}">
    <UButton
      class="w-full"
      :disabled="disabled || !poke.hp"
      :color="active ? 'blue' : 'primary'"
      @click="$emit('click')"
    >
      <div class="w-full space-y-0.5">
        <div class="flex items-center gap-1 w-full justify-start">
          <BoxSprite :species="poke.speciesId" />
          <span class="truncate">{{ poke.name }}</span>
          <StatusOrFaint :poke="poke" size="xs" class="ml-auto" />
        </div>
        <UProgress :max="poke.stats.hp" :value="poke.hp" :color="colorForHp" class="w-full h-1" />
      </div>
    </UButton>

    <template #panel>
      <PokemonTTContent :poke />
    </template>
  </TouchPopover>
</template>

<script setup lang="ts">
import type {Pokemon} from "@/game/pokemon";

defineEmits<{(e: "click"): void}>();
const {poke} = defineProps<{poke: Pokemon; disabled: boolean; active: boolean}>();

const colorForHp = computed(() => {
  if (poke.stats.hp / poke.hp < 0.1) {
    return "red";
  } else if (poke.stats.hp / poke.hp < 0.3) {
    return "amber";
  } else {
    return "green";
  }
});
</script>
