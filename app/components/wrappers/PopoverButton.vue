<template>
  <UPopover v-model:open="open" :disabled="popoverDisabled" :content>
    <template #anchor>
      <div
        ref="element"
        :class="[isHovered && 'touch-none select-none', ui]"
        @touchstart="startTouch"
        @touchend="endTouch"
        @mouseover="isHovered = true"
        @mouseleave="isHovered = false"
        @click="$emit('click')"
      >
        <slot></slot>
      </div>
    </template>

    <template #content>
      <slot name="content"></slot>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import type {PopoverProps} from "@nuxt/ui";

interface Props {
  delay?: number;
  popoverDisabled?: bool;
  buttonDisabled?: bool;
  content?: PopoverProps["content"];
  ui?: string;
}

const isHovered = ref(false);
const {delay = 100, popoverDisabled} = defineProps<Props>();
const open = computed({
  get: () => !popoverDisabled && isHovered.value,
  set: val => (isHovered.value = val),
});

defineEmits<{click: []}>();

const element = useTemplateRef("element");
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
  if (isHovered.value && e.cancelable) {
    e.preventDefault();
  }
  isHovered.value = false;
};
</script>
