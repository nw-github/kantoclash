<template>
  <div class="flex p-2">
    <!-- player.nPokemon - player.nFainted | i < players[id].nPokemon | Icon ternary keeps causing problems -->
    <UIcon
      v-for="i in player.nPokemon - player.nFainted"
      :key="i"
      name="ic:baseline-catching-pokemon"
      class="bg-primary dark:bg-gray-200"
    />
    <UIcon
      v-for="i in player.nFainted"
      :key="i"
      name="tabler:pokeball-off"
      class="bg-primary dark:bg-gray-200"
    />
    <UIcon
      v-for="i in 6 - player.nPokemon"
      :key="i"
      name="ci:dot-03-m"
      class="bg-primary dark:bg-gray-200"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ player: ClientPlayer }>();
</script>
