<template>
  <UCard :ui="{ header: { padding: 'p-4 sm:p-4' }, body: { padding: 'p-0 sm:p-0' } }">
    <template #header>
      <div class="flex space-x-1">
        <FormatDropdown v-model="team.format" class="w-1/2" placeholder="Format" team-only />
        <UInput v-model="team.name" :trailing="false" placeholder="Team name" class="w-full" />

        <div class="flex space-x-0.5">
          <!-- <UButton icon="material-symbols:save-outline" color="gray" variant="ghost" /> -->
          <UTooltip text="Delete Team">
            <UButton
              icon="material-symbols:delete-outline"
              color="red"
              variant="ghost"
              @click="$emit('delete')"
            />
          </UTooltip>
          <UTooltip text="Close">
            <UButton
              icon="material-symbols:close"
              color="red"
              variant="ghost"
              @click="$emit('close')"
            />
          </UTooltip>
        </div>
      </div>
    </template>

    <UTabs
      v-model="selectedPoke"
      orientation="vertical"
      class="flex gap-2 pr-2"
      :items="items"
      :ui="{ list: { width: 'w-min', rounded: 'rounded-tl-none', tab: { height: 'h-min' } } }"
    >
      <template #default="{ item }">
        <div class="size-[64px] m-1">
          <Sprite
            :species="(speciesList as Record<string, Species>)[item.poke.species]"
            :scale="2"
            kind="box"
          />
        </div>
      </template>
      <template #item="{ item, index }">
        <div class="parent-h-100 flex flex-col h-full">
          <div class="flex justify-between pb-1.5">
            <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-1 h-10 items-center">
              <UButton
                variant="ghost"
                icon="material-symbols:edit-square-outline"
                label="Edit"
                color="gray"
                class="rounded-md text-gray-500 dark:text-gray-400"
                :class="[
                  selectedTab === 0 &&
                    'text-gray-900 dark:text-white bg-white dark:bg-gray-900 shadow-sm',
                ]"
                @click="selectedTab = 0"
              />
              <UButton
                variant="ghost"
                icon="material-symbols:content-paste"
                label="PokePaste"
                color="gray"
                class="rounded-md text-gray-500 dark:text-gray-400"
                :class="[
                  selectedTab === 1 &&
                    'text-gray-900 dark:text-white bg-white dark:bg-gray-900 shadow-sm',
                ]"
                @click="selectedTab = 1"
              />
            </div>

            <div class="flex items-center">
              <UTooltip text="Add Pokemon">
                <UButton
                  icon="material-symbols:add-2"
                  variant="ghost"
                  color="gray"
                  :disabled="props.team.pokemon.length >= 6"
                  @click="addPokemon"
                />
              </UTooltip>
              <UTooltip text="Delete Pokemon">
                <UButton
                  icon="material-symbols:delete-outline"
                  color="red"
                  variant="ghost"
                  :disabled="props.team.pokemon.length < 2"
                  @click="deletePokemon(index)"
                />
              </UTooltip>
            </div>
          </div>

          <UCard
            v-if="selectedTab === 0"
            class="flex grow"
            :ui="{
              body: { base: 'flex flex-col gap-2 grow justify-between', padding: 'p-2 sm:p-2' },
            }"
          >
            <div class="flex space-x-2">
              <div class="flex flex-col">
                <PokemonSelector v-model="item.poke.species" :team="team" />
                <UInput
                  v-model="item.poke.name"
                  :maxlength="24"
                  :placeholder="item.species?.name ?? ''"
                >
                  <template #trailing>
                    <span class="text-xs text-gray-500 dark:text-gray-400">
                      {{ item.poke.name?.length ?? 0 }}/24
                    </span>
                  </template>
                </UInput>
              </div>
              <div class="flex flex-col justify-between gap-1">
                <div class="flex justify-between items-center">
                  <span>Level</span>
                  <NumericInput
                    v-model="item.poke.level"
                    class="w-20"
                    placeholder="100"
                    :min="1"
                    :max="100"
                  />
                </div>
                <MoveSelector
                  v-for="(_, i) in 4"
                  :key="i"
                  v-model="item.poke.moves[i]"
                  :poke="item.poke"
                />
              </div>
            </div>
            <div class="grid items-center grid-cols-[auto,1fr,auto,auto,auto,auto] gap-1">
              <template v-for="stat in statKeys" :key="stat">
                <span class="px-1.5">{{ statName[stat] }}</span>
                <URange v-model="item.poke.evs[stat]" :min="0" :max="255" color="green" />
                <span class="text-center px-1.5 min-w-8 text-xs">
                  {{ item.poke.evs[stat] }}
                </span>
                <NumericInput
                  v-if="stat === 'hp'"
                  class="w-10"
                  disabled
                  :placeholder="String(dvToIv(getHpDvFromEvs(item.poke)))"
                />
                <NumericInput
                  v-else
                  v-model="item.poke.ivs[stat]"
                  class="w-10"
                  placeholder="31"
                  :min="0"
                  :max="31"
                />

                <template v-if="item.species">
                  <span v-if="item.species" class="text-center px-1.5 min-w-10 text-gray-500">
                    {{ calcPokeStat(stat, item.poke) }}
                  </span>
                  <span
                    class="text-center px-1.5 min-w-8 text-xs"
                    :class="baseStatColor(item.species.stats[stat])"
                  >
                    {{ item.species.stats[stat] }}
                  </span>
                </template>
                <template v-else>
                  <span class="text-center px-1.5 min-w-10 text-gray-500">--</span>
                  <span class="text-center px-1.5 min-w-8 text-gray-500 text-xs">--</span>
                </template>
              </template>
            </div>
          </UCard>
          <UTextarea
            v-else
            v-model="textAreaText"
            class="grow"
            :ui="{ base: 'h-full min-h-80', rounded: 'rounded-lg' }"
            @change="team.pokemon[item.teamIndex] = parsePokemon(textAreaText.trim())"
          >
            <UButton
              class="absolute top-2 right-2"
              icon="material-symbols:content-copy-outline"
              variant="ghost"
              color="gray"
              @click="copyTextArea"
            />
          </UTextarea>
        </div>
      </template>
    </UTabs>
  </UCard>
</template>

<style>
*:has(> .parent-h-100) {
  height: 100%;
  padding-bottom: 0.5rem;
}
</style>

<script setup lang="ts">
import { calcStat, getHpDv } from "@/game/pokemon";
import { speciesList, type Species, type SpeciesId } from "@/game/species";
import { statKeys, type Stats } from "@/game/utils";
import { evToStatexp, ivToDv } from "~/utils/pokemon";

defineEmits<{ (e: "delete" | "close"): void }>();

const statName: Record<keyof Stats, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spc: "Spc",
  spe: "Spe",
};

const props = defineProps<{ team: Team }>();
const toast = useToast();
const items = computed(() => {
  const pokemon = props.team.pokemon.map((poke, i) => ({
    label: poke.name ?? "",
    poke,
    teamIndex: i,
    species: (speciesList as Record<string, Species>)[poke.species],
  }));
  return pokemon;
});
const textAreaText = ref("");
const selectedPoke = ref(0);
const selectedTab = ref(0);

watch([selectedPoke, selectedTab], ([_, tab]) => {
  if (tab === 1) {
    textAreaText.value = descToString(props.team.pokemon[selectedPoke.value]);
  }
});

for (const poke of props.team.pokemon) {
  for (let i = poke.moves.length; i < 4; i++) {
    poke.moves.push("");
  }

  for (const key of statKeys) {
    poke.evs[key] ??= 255;
  }
}

const copyTextArea = () => {
  navigator.clipboard.writeText(textAreaText.value);
  toast.add({ title: `Copied to clipboard!` });
};

const getHpDvFromEvs = (poke: PokemonDesc) => {
  const dvs: Partial<Stats> = {};
  for (const stat of statKeys) {
    dvs[stat] = ivToDv(poke.ivs[stat]);
  }
  return getHpDv(dvs);
};

const calcPokeStat = (stat: keyof Stats, poke: PokemonDesc) => {
  return calcStat(
    stat === "hp",
    speciesList[poke.species as SpeciesId].stats[stat],
    poke.level ?? 100,
    stat === "hp" ? getHpDvFromEvs(poke) : ivToDv(poke.ivs[stat]),
    evToStatexp(poke.evs[stat]),
  );
};

const deletePokemon = (i: number) => {
  if (props.team.pokemon.length <= 1) {
    return;
  }

  const [poke] = props.team.pokemon.splice(i, 1);
  if (selectedPoke.value >= props.team.pokemon.length) {
    selectedPoke.value = props.team.pokemon.length - 1;
  }

  const name = poke.name || speciesList[poke.species as SpeciesId]?.name || `Pokemon ${i + 1}`;
  toast.add({
    title: `${name} deleted!`,
    actions: [{ label: "Undo", click: () => props.team.pokemon.splice(i, 0, poke) }],
  });
};

const addPokemon = async () => {
  if (props.team.pokemon.length >= 6) {
    return;
  }

  const length = props.team.pokemon.push(parsePokemon(""));
  await nextTick();
  selectedPoke.value = length - 1;
};
</script>
