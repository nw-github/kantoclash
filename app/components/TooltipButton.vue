<template>
  <UTooltip :text :content>
    <UButton v-bind="$attrs" @click="$emit('click')" />
  </UTooltip>
</template>

<script setup lang="ts">
import type {ButtonProps, TooltipProps} from "@nuxt/ui";

interface Props extends /* @vue-ignore */ ButtonProps {
  text?: TooltipProps["text"];
  content?: TooltipProps["content"];
}

defineProps<Props>();
defineEmits<{(e: "click"): void}>();
</script>
