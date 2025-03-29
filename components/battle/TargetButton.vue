<template>
  <UButton class="w-full" :disabled :color="active ? 'blue' : 'primary'" @click="$emit('click')">
    <div class="w-full space-y-0.5">
      <div class="flex items-center gap-1 w-full justify-start">
        <BoxSprite :species="poke.speciesId" />
        <span class="truncate">{{ poke.name }}</span>
      </div>
      <UProgress :max="100" :value="poke.hpPercent" :color="colorForHp" class="w-full h-1" />
    </div>
  </UButton>
</template>

<script setup lang="ts">
defineEmits<{(e: "click"): void}>();
const {poke} = defineProps<{poke: ClientActivePokemon; disabled: boolean; active: boolean}>();

const colorForHp = computed(() => {
  if (poke.hpPercent < 10) {
    return "red";
  } else if (poke.hpPercent < 0.3) {
    return "amber";
  } else {
    return "green";
  }
});
</script>
