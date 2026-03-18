<template>
  <img v-if="image" class="size-[24px]" :src="`/sprites/misc/move-${MC[category]}.png`" />
  <UBadge v-else :color="color[category]" variant="subtle" :label="toTitleCase(MC[category])" />
</template>

<script setup lang="ts">
import {MC} from "~~/game/utils";

defineProps<{category: MC; image?: boolean}>();

const color = {[MC.physical]: "error", [MC.special]: "neutral", [MC.status]: "neutral"} as const;
</script>
