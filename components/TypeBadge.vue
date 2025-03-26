<template>
  <img
    v-if="image"
    class="size-[20px] sm:size-[24px]"
    :src="`/sprites/type/${encodeURIComponent(type)}.png`"
    :alt="type"
  />
  <UBadge v-else :style="{backgroundColor: typeColor[type]}" :label="label ?? toTitleCase(type)" />
</template>

<script setup lang="ts">
import type {Type} from "~/game/utils";

defineProps<{type: Type; image?: boolean; label?: string}>();
</script>
