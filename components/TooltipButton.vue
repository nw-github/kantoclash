<template>
  <UTooltip :text :popper>
    <UButton v-bind="$attrs" @click="$emit('click')" />
  </UTooltip>
</template>

<script setup lang="ts">
import type { UButton, UTooltip } from "#components";

type ButtonProps = InstanceType<typeof UButton>["$props"];
type TooltipProps = InstanceType<typeof UTooltip>["$props"];

interface Props extends /* @vue-ignore */ ButtonProps {
  text?: TooltipProps["text"];
  popper?: TooltipProps["popper"];
}

defineProps<Props>();
defineEmits<{ (e: "click"): void }>();
</script>
