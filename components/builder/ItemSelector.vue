<template>
  <Selector
    ref="selector"
    v-model:open="open"
    v-model:query="query"
    base="left-0 mt-1"
    :items
    :filter
    @chose="onChoose"
  >
    <UInput
      v-model="query"
      placeholder="No Item"
      :color="isIllegal(normalizeName(query)) ? 'red' : undefined"
      trailing-icon="heroicons:chevron-down-20-solid"
      @focus="open = true"
      @update:model-value="open = true"
      @keydown.tab="open = false"
    />

    <template #item="{item: [id, item]}">
      <div class="flex gap-1 items-center pr-5">
        <ItemSprite :item="id" />
        <span class="text-xs text-nowrap" :class="[isIllegal(id) && 'text-red-500']">
          {{ item.name }}
        </span>
      </div>

      <div class="text-[0.6rem] text-gray-600 dark:text-gray-400 text-nowrap">
        {{ itemDesc[id] ?? "No competitive use." }}
      </div>
    </template>

    <template #empty>
      <div class="p-1">No item found</div>
    </template>
  </Selector>
</template>

<script setup lang="ts">
import type {Generation} from "~/game/gen";
import {itemList, type ItemData, type ItemId} from "~/game/item";

const query = defineModel<string>({default: ""});
const {gen} = defineProps<{gen: Generation}>();

const open = ref(false);
const items = computed(() => Object.entries(itemList) as [ItemId, ItemData][]);

const filter = (items: [ItemId, ItemData][], query: string) => {
  const q = normalizeName(query);
  const all = items.filter(
    ([id, data]) =>
      id.includes(q) || data.name.includes(q) || itemDesc[id]?.toLowerCase()?.includes(q),
  );

  const subset = all.filter(([id, _]) => id in itemDesc && id in gen.items);
  if (subset.length) {
    return subset;
  }

  return all;
};

const onChoose = ([_, item]: [ItemId, ItemData]) => (query.value = item.name);

const isIllegal = (id: string) => id && !(normalizeName(id) in gen.items);
</script>
