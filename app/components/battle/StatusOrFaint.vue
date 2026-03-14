<template>
  <UBadge v-if="poke.hp <= 0 && faint" color="error">FNT</UBadge>
  <UBadge
    v-else-if="poke.status && poke.hp > 0"
    :color="statusColor[poke.v.status].color"
    :variant="statusColor[poke.v.status].variant"
  >
    {{ poke.status.toUpperCase() }}
  </UBadge>
</template>

<script setup lang="ts">
import type {Pokemon} from "~~/game/pokemon";

defineProps<{poke: Pokemon; faint?: boolean}>();
</script>
