<template>
  <UPopover v-model:open="open" v-bind="$attrs">
    <div
      ref="element"
      class="w-full h-full"
      :class="open && 'touch-none select-none'"
      @touchstart="startTouch"
      @touchend="endTouch"
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
const {delay = 100} = defineProps<{delay?: number}>();

const element = ref<HTMLDivElement>();
const touchedEl = useTouchedElement();

watch(touchedEl, el => {
  if (el !== element.value) {
    open.value = false;
  }
});

let timeout: NodeJS.Timeout | undefined;
const startTouch = () => {
  if (open.value) {
    return;
  }

  timeout = setTimeout(() => {
    open.value = true;
    touchedEl.value = element.value;
  }, delay);
};

const endTouch = (e: TouchEvent) => {
  clearTimeout(timeout);
  timeout = undefined;
  if (open.value) {
    open.value = false;
    e.preventDefault();
  }
};
</script>
