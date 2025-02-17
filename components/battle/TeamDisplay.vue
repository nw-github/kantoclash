<template>
  <div class="flex p-2">
    <!-- player.nPokemon - player.nFainted | i < players[id].nPokemon | Icon ternary keeps causing problems -->
    <UIcon
      v-for="_ in player.nPokemon - player.nFainted"
      name="ic:baseline-catching-pokemon"
      class="bg-primary dark:bg-gray-200"
    />
    <UIcon
      v-for="_ in player.nFainted"
      name="tabler:pokeball-off"
      class="bg-primary dark:bg-gray-200"
    />
    <UIcon
      v-for="_ in 6 - player.nPokemon"
      name="ci:dot-03-m"
      class="bg-primary dark:bg-gray-200"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ player: ClientPlayer }>();
</script>
