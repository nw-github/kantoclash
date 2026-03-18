<template>
  <TouchPopover :disabled="popoverDisabled" :content="{side: 'top'}">
    <UButton
      class="w-full"
      :disabled="buttonDisabled"
      :color="active ? 'info' : 'primary'"
      @click="$emit('click')"
    >
      <div class="w-full space-y-0.5">
        <div class="flex items-center gap-1 w-full justify-start">
          <BoxSprite :species-id="poke.speciesId" :form="poke.form" />
          <span class="truncate">{{ poke.name }}</span>
          <GenderIcon class="size-4" :gender="gen1Gender[poke.speciesId] ?? poke.gender" />
          <StatusOrFaint :poke size="xs" class="ml-auto" />
        </div>
        <UProgress :model-value="poke.hp" :max="poke.stats.hp" :color="barCol" class="w-full h-1" />
      </div>
    </UButton>

    <template #content>
      <PokemonTTContent :poke :weather />
    </template>
  </TouchPopover>
</template>

<script setup lang="ts">
import type {Pokemon} from "~~/game/pokemon";
import type {Weather} from "~~/game/utils";

defineEmits<{click: []}>();
const {poke} = defineProps<{
  poke: Pokemon;
  active?: bool;
  weather?: Weather;
  buttonDisabled?: bool;
  popoverDisabled?: bool;
}>();

const barCol = computed(() => {
  if (poke.hpPercent < 10) {
    return "error";
  } else if (poke.hpPercent < 30) {
    return "warning";
  } else {
    return "success";
  }
});
</script>
