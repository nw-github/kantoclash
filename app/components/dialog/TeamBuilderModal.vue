<template>
  <UModal :fullscreen="lessThanSm" :ui="{content: 'h-full sm:h-148'}">
    <template #content>
      <TeamBuilder
        :team
        :undeletable
        @delete="$emit('close', true)"
        @close="$emit('close', false)"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import {breakpointsTailwind} from "@vueuse/core";

defineProps<{team: Team; undeletable?: boolean}>();
defineEmits<{close: [boolean]}>();

const breakpoint = useBreakpoints(breakpointsTailwind);
const lessThanSm = breakpoint.smaller("sm");
</script>
