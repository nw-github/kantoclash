<template>
  <div
    class="flex w-full px-4 justify-center sm:justify-around relative"
    :class="isSingles && 'gap-8'"
  >
    <div
      v-for="(player, id) in players.items"
      :key="id"
      :class="[id !== perspective ? 'order-2' : 'pt-10 sm:pt-14']"
    >
      <div v-if="!player.isSpectator" class="flex gap-2 sm:gap-4">
        <ActivePokemon
          v-for="(active, i) in player.active"
          :key="i"
          :ref="(c) => activePokemon.push(c as any)"
          :class="i !== 0 && 'pt-2 sm:pt-4'"
          :poke="active"
          :back="id === perspective"
          :poke-id="`${id}:${i}`"
          :player
          :is-singles
          :gen
        />
      </div>
      <div class="relative flex justify-center w-full">
        <div
          class="absolute bottom-4 sm:bottom-8 bg-gray-200 dark:bg-gray-600 w-[115%] h-10 sm:h-16 rounded-[100%] flex justify-center"
          :class="isSingles && 'w-full'"
        />

        <img
          v-if="(player.spikes || 0) >= 1"
          class="absolute size-4 sm:size-7 bottom-10 sm:bottom-14 opacity-80 pointer-events-none"
          src="/caltrop.svg"
        />

        <img
          v-if="(player.spikes || 0) >= 2"
          class="absolute size-4 sm:size-7 bottom-11 sm:bottom-16 right-10 opacity-80 pointer-events-none"
          src="/caltrop.svg"
        />

        <img
          v-if="(player.spikes || 0) >= 3"
          class="absolute size-4 sm:size-7 bottom-11 sm:bottom-16 left-10 opacity-80 pointer-events-none"
          src="/caltrop.svg"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {ActivePokemon} from "#components";
import type {PlayerId, PokeId} from "~/game/events";
import type {Generation} from "~/game/gen1";
import type {AnimationParams} from "./ActivePokemon.vue";

defineProps<{players: Players; perspective: PlayerId; isSingles: bool; gen: Generation}>();

const activePokemon = ref<InstanceType<typeof ActivePokemon>[]>([]);

const playAnimation = (id: PokeId, params: AnimationParams) => {
  const component = activePokemon.value.find(a => a.getId() === id);
  if (!component) {
    return;
  }
  return component.playAnimation(params);
};

defineExpose({playAnimation});
</script>
