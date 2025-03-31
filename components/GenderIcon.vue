<template>
  <UIcon
    v-if="gender && gender !== 'none'"
    :class="[gender === 'male' && 'text-sky-400', gender !== 'male' && 'text-pink-400']"
    :name="gender === 'male' ? 'material-symbols:male' : 'material-symbols:female'"
  />
</template>

<script setup lang="ts">
import type {Gender} from "~/game/pokemon";

defineProps<{gender?: Gender}>();
</script>
