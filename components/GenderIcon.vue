<template>
  <UIcon
    v-if="gender && gender !== 'N'"
    :class="[gender === 'M' && 'text-sky-400', gender !== 'M' && 'text-pink-400']"
    :name="gender === 'M' ? 'material-symbols:male' : 'material-symbols:female'"
  />
</template>

<script setup lang="ts">
import type {Gender} from "~/game/pokemon";

defineProps<{gender?: Gender}>();
</script>
