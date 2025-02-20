<template>
  <div class="relative">
    <slot></slot>

    <Transition appear mode="out-in">
      <ul
        class="absolute z-30 max-h-60 p-0.5 focus:outline-none overflow-y-auto scroll-py-1 ring-1 ring-gray-200 dark:ring-gray-700 rounded-md shadow-lg bg-white dark:bg-gray-800"
        :class="base"
        ref="container"
        v-if="open"
      >
        <li class="pb-1" v-if="searchable">
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
          class="cursor-default select-none relative flex items-center justify-between gap-1 rounded-md px-1.5 py-1 text-sm text-gray-900 dark:text-white"
          :class="[hovered === i && 'bg-gray-100 dark:bg-gray-900 hovered']"
          @click="select(i)"
          @mouseover="hovered = i"
          @mouseleave="hovered = hovered === i ? -1 : hovered"
        >
          <slot :item :index="i" name="item"></slot>
        </li>

        <li class="text-center text-sm" v-if="!filteredItems.length">
          <slot name="empty">No Items.</slot>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.v-enter-active {
  transition: opacity 0.1s ease;
}
.v-leave-from,
.v-leave-active {
  transition-duration: 0s;
  transition-property: none;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>

<script setup lang="ts" generic="T">
const modelQuery = defineModel<string>("query", { default: "" });
const open = defineModel<boolean>("open", { default: false });
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
const emit = defineEmits<{ (e: "chose", item: T): void }>();
const container = ref<HTMLUListElement>();
const hovered = ref(0);
const query = useDebounce(modelQuery, 100);

watch(open, async value => {
  if (value && filteredItems.value.length) {
    hovered.value = 0;
  }
});

onKeyStroke("ArrowDown", () => trySetHovered(1));
onKeyStroke("ArrowUp", () => trySetHovered(-1));
onKeyStroke("Enter", () => select(hovered.value));
onClickOutside(container, () => (open.value = false));

const filteredItems = computed(() => filter(items, query.value));

const trySetHovered = (offset: number) => {
  if (!open.value) {
    return;
  }

  if (offset < 0) {
    if (hovered.value === -1) {
      hovered.value = filteredItems.value.length - 1;
    }

    hovered.value = Math.max(0, hovered.value - 1);
  } else {
    hovered.value = Math.min(filteredItems.value.length - 1, hovered.value + 1);
  }

  nextTick(() => {
    document.querySelector(".hovered")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
};

function select(value: number) {
  if (open.value && filteredItems.value[value]) {
    emit("chose", filteredItems.value[value]);
    open.value = false;
  }
}
</script>
