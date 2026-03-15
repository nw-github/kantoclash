<template>
  <UPopover
    v-model:open="open"
    :dismissible="false"
    :ui="{content: 'p-0 -mt-1.5 rounded-md ring ring-default shadow-lg bg ' + (ui?.content ?? '')}"
    :content
  >
    <template #anchor>
      <slot />
    </template>

    <template #content>
      <div ref="container">
        <div v-if="searchable" class="pb-1">
          <UInput
            v-model="modelQuery"
            class="w-full"
            placeholder="Search..."
            variant="none"
            autofocus
            @keydown.tab="open = false"
          />
        </div>

        <UScrollArea
          v-slot="{item, index}"
          :items="filteredItems"
          class="max-h-60 p-0.5 focus:outline-none"
          :class="ui?.list"
          :virtualize
        >
          <div
            class="cursor-default select-none relative flex items-center justify-between gap-1 rounded-md px-1.5 py-1 text-sm"
            :class="[hovered === index && 'bg-elevated/50 hovered']"
            @click="select(index)"
            @mouseover="hovered = index"
            @mouseleave="hovered = hovered === index ? -1 : hovered"
          >
            <slot :item :index name="item" />
          </div>
        </UScrollArea>

        <div v-if="!filteredItems.length" class="text-center text-sm">
          <slot name="empty">No Items.</slot>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts" generic="T">
import type {PopoverProps, ScrollAreaProps} from "@nuxt/ui";

const modelQuery = defineModel<string>("query", {default: ""});
const open = defineModel<boolean>("open", {default: false});
const {
  items,
  filter,
  virtualize = true,
} = defineProps<{
  items: T[];
  filter: (items: T[], query: string) => T[];
  searchable?: boolean;
  content?: PopoverProps["content"];
  ui?: {list?: string; content?: string};
  virtualize?: ScrollAreaProps["virtualize"];
}>();
const emit = defineEmits<{(e: "chose", item: T): void}>();
const hovered = ref(0);
const query = useDebounce(modelQuery, 100);
const queryUnmodified = ref(true);

watch(open, isOpen => {
  if (isOpen && filteredItems.value.length) {
    hovered.value = 0;
  }

  if (!isOpen) {
    queryUnmodified.value = true;
  }
});

watch(query, () => {
  if (hovered.value === -1) {
    trySetHovered(1);
  }

  if (open.value) {
    queryUnmodified.value = false;
  }
});

onKeyStroke("ArrowDown", () => trySetHovered(1));
onKeyStroke("ArrowUp", () => trySetHovered(-1));
onKeyStroke("Home", () => trySetHovered(-items.length));
onKeyStroke("End", () => trySetHovered(items.length));
onKeyStroke("Enter", () => select(hovered.value));
onClickOutside(useTemplateRef("container"), () => (open.value = false));

const filteredItems = computed(() => filter(items, queryUnmodified.value ? "" : query.value));

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
