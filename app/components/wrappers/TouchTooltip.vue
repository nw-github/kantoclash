<template>
  <UTooltip v-bind="$attrs" v-model:open="open" :text>
    <component :is="childNode" v-if="childNode" />
    <slot v-else />
  </UTooltip>
</template>

<script setup lang="ts">
import type {TooltipProps} from "@nuxt/ui";

interface Props extends /** @vue-ignore */ TooltipProps {
  text?: string;
}

const {text} = defineProps<Props>();

const wantsOpen = ref(false);
const open = computed({
  get: () => wantsOpen.value && !!text,
  set: v => (wantsOpen.value = v),
});

const slots = useSlots();

const childEl = ref<HTMLElement | null>();

const childNode = computed(() => {
  const children = slots.default?.();
  if (!children || !children.length) {
    return;
  }

  children[0].props ??= {};
  children[0].props.onTouchstart = (e: TouchEvent) => {
    wantsOpen.value = true;
    childEl.value = e.currentTarget as HTMLElement | null;
  };
  children[0].props.onTouchend = (e: TouchEvent) => e.preventDefault();
  return children[0];
});

onClickOutside(childEl, () => (wantsOpen.value = false));
</script>
