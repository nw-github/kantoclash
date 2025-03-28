<template>
  <UPopover v-model:open="open" v-bind="$attrs">
    <div
      class="w-full h-full"
      @touchstart="open = true"
      @touchend="open = false"
      @mouseover="open = true"
      @mouseleave="open = false"
    >
      <slot></slot>
    </div>

    <template #panel>
      <slot name="panel"></slot>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type {UPopover} from "#components";

const open = ref(false);
</script>
