<template>
  <div class="relative">
    <slot />

    <AnimatePresence>
      <motion.ul
        v-if="open"
        ref="container"
        class="absolute z-30 max-h-60 p-0.5 focus:outline-none overflow-y-auto overflow-x-hidden scroll-py-1 ring-1 ring-gray-200 dark:ring-gray-700 rounded-md shadow-lg bg-white dark:bg-gray-800"
        :class="base"
        :initial="{opacity: 0}"
        :transition="{duration: 0.1, ease: 'easeOut'}"
        :animate="{opacity: 1}"
        :exit="{opacity: 0}"
      >
        <li v-if="searchable" class="pb-1">
          <UInput
            v-model="modelQuery"
            placeholder="Search..."
            variant="none"
            autofocus
            @keydown.tab="open = false"
          />
        </li>

        <li
          v-for="(item, i) in filteredItems"
          :key="i"
          class="cursor-default select-none relative flex items-center justify-between gap-1 rounded-md px-1.5 py-1 text-sm text-gray-900 dark:text-white"
          :class="[hovered === i && 'bg-gray-100 dark:bg-gray-900 hovered']"
          @click="select(i)"
          @mouseover="hovered = i"
          @mouseleave="hovered = hovered === i ? -1 : hovered"
        >
          <slot :item :index="i" name="item" />
        </li>

        <li v-if="!filteredItems.length" class="text-center text-sm">
          <slot name="empty">No Items.</slot>
        </li>
      </motion.ul>
    </AnimatePresence>
  </div>
</template>

<script setup lang="ts" generic="T">
import {motion} from "motion-v";

const modelQuery = defineModel<string>("query", {default: ""});
const open = defineModel<boolean>("open", {default: false});
const {
  items,
  filter,
  base = "",
} = defineProps<{
  items: T[];
  filter: (items: T[], query: string) => T[];
  base?: string;
  searchable?: boolean;
}>();
const emit = defineEmits<{(e: "chose", item: T): void}>();
const container = ref<HTMLUListElement>();
const hovered = ref(0);
const query = useDebounce(modelQuery, 100);

watch(open, async value => {
  if (value && filteredItems.value.length) {
    hovered.value = 0;
  }
});

watch(query, () => hovered.value === -1 && trySetHovered(1));

onKeyStroke("ArrowDown", () => trySetHovered(1));
onKeyStroke("ArrowUp", () => trySetHovered(-1));
onKeyStroke("Home", () => trySetHovered(-items.length));
onKeyStroke("End", () => trySetHovered(items.length));
onKeyStroke("Enter", () => select(hovered.value));
onClickOutside(container, () => (open.value = false));

const filteredItems = computed(() => filter(items, query.value));

const trySetHovered = (offset: number) => {
  if (!open.value) {
    return;
  }

  if (offset < 0) {
    if (hovered.value === -1) {
      hovered.value = filteredItems.value.length + offset;
    }

    hovered.value = Math.max(0, hovered.value + offset);
  } else {
    hovered.value = Math.min(filteredItems.value.length - 1, hovered.value + offset);
  }

  nextTick(() => {
    document.querySelector(".hovered")?.scrollIntoView({block: "nearest", inline: "nearest"});
  });
};

function select(value: number) {
  if (open.value && filteredItems.value[value]) {
    emit("chose", filteredItems.value[value]);
    open.value = false;
  }
}
</script>
