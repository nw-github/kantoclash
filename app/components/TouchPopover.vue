<template>
  <UPopover v-model:open="open" v-bind="$attrs">
    <div
      ref="element"
      class="w-full h-full"
      :class="isHovered && 'touch-none select-none'"
      @touchstart="startTouch"
      @touchend="endTouch"
      @mouseover="isHovered = true"
      @mouseleave="isHovered = false"
    >
      <slot></slot>
    </div>

    <template #panel>
      <slot name="panel"></slot>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
const isHovered = ref(false);
const {delay = 100, disabled} = defineProps<{delay?: number; disabled?: bool}>();
const open = computed({
  get: () => !disabled && isHovered.value,
  set: val => (isHovered.value = val),
});

const element = ref<HTMLDivElement>();
const touchedEl = useTouchedElement();

watch(touchedEl, el => {
  if (el !== element.value) {
    isHovered.value = false;
  }
});

let timeout: NodeJS.Timeout | undefined;
const startTouch = () => {
  if (isHovered.value) {
    return;
  }

  timeout = setTimeout(() => {
    isHovered.value = true;
    touchedEl.value = element.value;
  }, delay);
};

const endTouch = (e: TouchEvent) => {
  clearTimeout(timeout);
  timeout = undefined;
  if (isHovered.value) {
    isHovered.value = false;
    e.preventDefault();
  }
};
</script>
