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
        <ItemSprite :item="id" :gen />
        <span class="text-xs text-nowrap" :class="[isIllegal(id) && 'text-red-500']">
          {{ item.name }}
        </span>
      </div>

      <div class="text-[0.6rem] text-gray-600 dark:text-gray-400 text-nowrap">
        {{ item.desc || "No competitive use." }}
      </div>
    </template>

    <template #empty>
      <div class="p-1">No item found</div>
    </template>
  </Selector>
</template>

<script setup lang="ts">
import type {Generation} from "~/game/gen";
import type {ItemData, ItemId} from "~/game/item";

const query = defineModel<string>({default: ""});
const {gen} = defineProps<{gen: Generation}>();

const open = ref(false);
const items = computed(() => Object.entries(gen.items) as [ItemId, ItemData][]);

const filter = (items: [ItemId, ItemData][], query: string) => {
  const q = normalizeName(query);
  const all = items.filter(
    ([id, data]) =>
      id.includes(q) || data.name.includes(q) || data.desc?.toLowerCase()?.includes(q),
  );

  const subset = all.filter(([_, data]) => data.desc && data.exists);
  if (subset.length) {
    return subset;
  }

  return all;
};

const onChoose = ([_, item]: [ItemId, ItemData]) => (query.value = item.name);

const isIllegal = (id: string) => id && !gen.items[normalizeName(id) as ItemId]?.exists;
</script>
