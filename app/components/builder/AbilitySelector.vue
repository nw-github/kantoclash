<template>
  <Selector
    v-model:open="open"
    v-model:query="query"
    :ui="{list: 'w-84 sm:w-96'}"
    :content="{align: 'start'}"
    :items
    :filter
    :virtualize="false"
    @select="onChoose"
  >
    <UInput
      v-model="query"
      placeholder="No Ability"
      color="error"
      :class="ui"
      :disabled
      :highlight="!disabled && isIllegal(normalizeName(query))"
      trailing-icon="lucide:chevron-down"
      @focus="(open = true), $event.target.select()"
      @update:model-value="open = true"
      @keydown.tab="open = false"
    />

    <template #item="{item: [id, ability]}">
      <div class="flex gap-1 items-center pr-5">
        <span class="text-xs text-nowrap" :class="[isIllegal(id) && 'text-red-500']">
          {{ ability.name }}
        </span>
      </div>

      <div class="text-[0.6rem] text-muted text-right">
        {{ ability.desc || "No competitive use." }}
      </div>
    </template>

    <template #empty>
      <div class="p-1">No ability found</div>
    </template>
  </Selector>
</template>

<script setup lang="ts">
import type {Generation} from "~~/game/gen";
import type {PokemonDesc} from "~~/game/pokemon";
import {abilityList, type AbilityId, type Species, type SpeciesId} from "~~/game/species";

type AbilityData = (typeof abilityList)[AbilityId];

const modelQuery = defineModel<string>({default: ""});
const {poke, gen, disabled} = defineProps<{
  poke: PokemonDesc;
  gen: Generation;
  ui?: string;
  disabled?: bool;
}>();

const query = readEmptyIfDisabled(modelQuery, "", () => disabled);

const open = ref(false);
const items = computed(() => Object.entries(abilityList) as [AbilityId, AbilityData][]);
const species = computed<Species | undefined>(() => gen.speciesList[poke?.speciesId as SpeciesId]);

const filter = (abilities: [AbilityId, AbilityData][], query: string) => {
  const q = normalizeName(query);
  const all = abilities.filter(([id, data]) => id.includes(q) || data.name.includes(q));

  if (species.value) {
    const subset = all.filter(([id, _]) => species.value!.abilities.includes(id));
    if (subset.length) {
      return subset;
    }
  }

  return all;
};

const onChoose = ([_, item]: [AbilityId, AbilityData]) => (query.value = item.name);

const isIllegal = (id: string) => !species.value?.abilities.includes(id);
</script>
