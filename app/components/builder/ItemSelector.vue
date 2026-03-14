<template>
  <Selector
    ref="selector"
    v-model:open="open"
    v-model:query="query"
    :content="{align: 'start'}"
    :items
    :filter
    @chose="onChoose"
  >
    <UInput
      v-model="query"
      placeholder="No Item"
      color="error"
      :class="ui"
      :highlight="!!isIllegal(normalizeName(query))"
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

      <div class="text-[0.6rem] text-muted text-nowrap">
        {{ item.desc || "No competitive use." }}
      </div>
    </template>

    <template #empty>
      <div class="p-1">No item found</div>
    </template>
  </Selector>
</template>

<script setup lang="ts">
import type {Generation} from "~~/game/gen";
import type {ItemData, ItemId} from "~~/game/item";
import type {PokemonDesc} from "~~/game/pokemon";
import type {SpeciesId} from "~~/game/species";

const query = defineModel<string>({default: ""});
const {gen, poke} = defineProps<{gen: Generation; poke: PokemonDesc; ui?: string}>();

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

const isIllegal = (id: string) => {
  const species = gen.speciesList[poke.speciesId as SpeciesId];
  if (species && species.requiresItem && species.requiresItem !== id) {
    return true;
  }
  return id && !gen.items[normalizeName(id) as ItemId]?.exists;
};
</script>
