<template>
  <UPopover mode="hover" :popper="{ placement: 'auto' }">
    <UButton
      class="w-full"
      :disabled="disabled || !poke.hp"
      :color="active ? 'blue' : 'primary'"
      @click="$emit('click')"
    >
      <div class="w-full space-y-0.5">
        <div class="flex items-center gap-1 w-full justify-start">
          <Sprite kind="box" :species="species" />
          <span class="text-ellipsis whitespace-nowrap overflow-hidden">{{ poke.name }}</span>
          <StatusOrFaint :poke="poke" size="xs" class="ml-auto" />
        </div>
        <UProgress :max="poke.stats.hp" :value="poke.hp" :color="colorForHp" class="w-full h-1" />
      </div>
    </UButton>

    <template #panel>
      <PokemonTTContent :poke="poke" />
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { speciesList } from "@/game/species";
import type { Pokemon } from "@/game/pokemon";

defineEmits<{ (e: "click"): void }>();
const props = defineProps<{ poke: Pokemon; disabled: boolean; active: boolean }>();
const species = computed(() => speciesList[props.poke.speciesId]);
const colorForHp = computed(() => {
  if (props.poke.stats.hp / props.poke.hp < 0.1) {
    return "red";
  } else if (props.poke.stats.hp / props.poke.hp < 0.3) {
    return "amber";
  } else {
    return "green";
  }
});
</script>
