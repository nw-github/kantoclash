<template>
  <div class="absolute invisible">
    <TypeBadge v-for="type in types" :key="type" :type image />
    <BoxSprite species-id="abra" />
  </div>
</template>

<script setup lang="ts">
import type {Type} from "~~/game/utils";

const types: Type[] = [
  "normal",
  "rock",
  "ground",
  "ghost",
  "poison",
  "bug",
  "flying",
  "fight",
  "water",
  "grass",
  "fire",
  "electric",
  "ice",
  "psychic",
  "dragon",
  "dark",
  "steel",
  "???",
];
</script>
