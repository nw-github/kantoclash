<template>
  <UCard :ui="{header: {padding: 'p-4 sm:p-4'}, body: {padding: 'p-0 sm:p-0'}}">
    <template #header>
      <div class="flex gap-1">
        <FormatDropdown v-model="team.format" class="w-1/2" placeholder="Format" team-only />
        <UInput
          v-model.trim="team.name"
          :trailing="false"
          placeholder="Team name"
          class="w-full"
          autofocus
        />

        <div class="flex gap-0.5">
          <!-- <UButton icon="material-symbols:save-outline" color="gray" variant="ghost" /> -->
          <TooltipButton
            :key="+teamPokepaste"
            :text="teamPokepaste ? 'Team Edit' : 'Team PokePaste'"
            :icon="
              teamPokepaste
                ? 'material-symbols:edit-square-outline'
                : 'material-symbols:content-paste'
            "
            color="gray"
            variant="ghost"
            @click="teamPokepaste = !teamPokepaste"
          />
          <TooltipButton
            text="Delete Team"
            icon="material-symbols:delete-outline"
            color="red"
            variant="ghost"
            @click="$emit('delete')"
          />
          <TooltipButton
            text="Close"
            icon="material-symbols:close"
            color="red"
            variant="ghost"
            @click="$emit('close')"
          />
        </div>
      </div>
    </template>

    <div v-if="!teamPokepaste" class="w-full h-full flex flex-col sm:flex-row">
      <div class="hidden sm:block">
        <UTabs
          v-model="selectedPokeIdx"
          orientation="vertical"
          :items="items"
          :ui="{
            wrapper: 'h-full flex',
            container: 'hidden',
            list: {
              width: 'w-min',
              rounded: 'rounded-tl-none rounded-r-none',
              tab: {height: 'h-min'},
            },
          }"
        >
          <template #default="{item}">
            <div class="size-[64px] m-1">
              <BoxSprite :species="item.species" :scale="2" :form="item.form" />
            </div>
          </template>
        </UTabs>
      </div>

      <div class="block sm:hidden">
        <UTabs
          v-model="selectedPokeIdx"
          class="px-2 pt-2"
          :items="items"
          :ui="{container: 'hidden'}"
        >
          <template #default="{item}">
            <div class="size-[32px] m-1 flex items-center">
              <BoxSprite :species="item.species" :form="item.form" />
            </div>
          </template>
        </UTabs>
      </div>

      <div class="flex flex-col h-full w-full p-2">
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
            <TooltipButton
              text="Add Pokemon"
              icon="material-symbols:add-2"
              variant="ghost"
              color="gray"
              :disabled="team.pokemon.length >= 6"
              @click="addPokemon"
            />
            <TooltipButton
              text="Delete Pokemon"
              icon="material-symbols:delete-outline"
              color="red"
              variant="ghost"
              :disabled="team.pokemon.length < 2"
              @click="deletePokemon(selectedPokeIdx)"
            />
          </div>
        </div>

        <UCard
          v-if="selectedTab === 0"
          class="flex grow h-full min-h-[23.5rem]"
          :ui="{body: {base: 'flex flex-col gap-2 grow justify-between', padding: 'p-2 sm:p-2'}}"
        >
          <div class="flex gap-2">
            <div class="flex flex-col relative grow">
              <div v-if="gen.id >= 2" class="absolute p-1 flex flex-col gap-1 z-10">
                <div class="relative">
                  <TooltipButton
                    text="Gender"
                    variant="ghost"
                    color="gray"
                    :icon="currGender.icon"
                    :ui="{icon: {base: currGender.clazz}}"
                    :disabled="currGender.forced"
                    @click="toggleGender"
                  />

                  <UIcon
                    v-if="currGender.random"
                    name="mdi:dice-3-outline"
                    class="absolute -bottom-1 -right-1 size-4"
                  />
                </div>

                <div>
                  <TooltipButton
                    text="Shiny"
                    :icon="
                      gen.getShiny(selectedPoke.data.shiny, ivsToDvs(selectedPoke.data))
                        ? 'ion:sparkles'
                        : 'ion:sparkles-outline'
                    "
                    variant="ghost"
                    color="gray"
                    :disabled="gen.id <= 2"
                    @click="selectedPoke.data.shiny = !selectedPoke.data.shiny"
                  />
                </div>
              </div>

              <SpeciesSelector
                v-model="selectedPoke.data.species"
                :class="gen.id >= 2 && 'pl-10'"
                :team
                :gen
                :gender="currGender.gender"
                :shiny="gen.getShiny(selectedPoke.data.shiny, ivsToDvs(selectedPoke.data))"
                :form="gen.getForm(
                  undefined,
                  selectedPoke.data.species as SpeciesId,
                  ivsToDvs(selectedPoke.data),
                )"
                @chose="onSpeciesChange"
              />
              <InputWithMax
                v-model.trim="selectedPoke.data.name"
                :maxlength="24"
                :placeholder="selectedPoke.species?.name ?? 'No Name'"
              />
              <ItemSelector v-if="gen.id >= 2" v-model="selectedPoke.data.item" class="pt-1" :gen />
              <AbilitySelector
                v-if="gen.id >= 3"
                v-model="selectedPoke.data.ability"
                :poke="selectedPoke.data"
                :gen
                class="pt-1"
              />
            </div>
            <div class="flex flex-col justify-between gap-1">
              <div v-if="gen.id > 1" class="flex justify-between items-center">
                <span class="text-sm">Friendship</span>
                <NumericInput
                  v-model="selectedPoke.data.friendship"
                  class="w-12"
                  placeholder="255"
                  :min="0"
                  :max="255"
                />
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm">Level</span>
                <NumericInput
                  v-model="selectedPoke.data.level"
                  class="w-12"
                  placeholder="100"
                  :min="1"
                  :max="100"
                />
              </div>
              <div v-if="gen.id >= 3" class="flex justify-between items-center">
                <span class="text-sm">Nature</span>
                <USelectMenu
                  v-model="selectedPoke.data.nature"
                  class="w-24 sm:w-28"
                  :options="natures"
                  searchable
                  placeholder="Hardy"
                  option-attribute="name"
                  value-attribute="value"
                  :search-attributes="['name', 'plus', 'minus']"
                  clear-search-on-close
                >
                  <template #option="{option}">
                    <div class="text-sm">
                      <span>{{ option.name }}</span>
                      <div v-if="option.plus" class="text-xs">
                        <span class="text-lime-500">{{ option.plus }}</span
                        >,
                        <span class="text-red-500">{{ option.minus }}</span>
                      </div>
                    </div>
                  </template>
                </USelectMenu>
              </div>
              <MoveSelector
                v-for="(_, i) in 4"
                :key="i"
                v-model="selectedPoke.data.moves[i]"
                :poke="selectedPoke.data"
                :idx="i"
                :gen
              />
            </div>
          </div>
          <div class="grid items-center grid-cols-[auto,1fr,auto,auto,auto,auto] gap-0.5 grow">
            <template v-for="(name, stat) in statKeys" :key="stat">
              <span class="px-1.5">{{ name }}</span>
              <URange
                v-model="selectedPoke.evProxy[stat]"
                :min="0"
                :max="255"
                :step="gen.id <= 2 ? 1 : 4"
                color="green"
                :disabled="gen.id <= 2 && stat === 'spd'"
                @input="onRangeInput($event, stat)"
              />
              <span class="text-center px-1.5 min-w-8 text-xs">
                {{ selectedPoke.evProxy[stat] }}
              </span>
              <NumericInput
                v-model="selectedPoke.ivProxy[stat]"
                class="w-10"
                :disabled="gen.id <= 2 && (stat === 'hp' || stat === 'spd')"
                placeholder="31"
              />

              <template v-if="selectedPoke.species">
                <div
                  class="relative group flex justify-center items-center px-1.5 min-w-10 text-gray-500"
                >
                  <UButton
                    variant="link"
                    color="white"
                    :padded="false"
                    :label="`${calcPokeStat(stat, selectedPoke.data)}`"
                    :disabled="stat === 'hp' || gen.id <= 2"
                    @click="trySetNature(stat)"
                  />

                  <span
                    v-if="gen.id >= 3 && (prevStat ? prevStat === stat : ((natureTable as any)[selectedPoke.data.nature!]?.[stat] > 1))"
                    class="absolute text-lime-500 -top-2 -right-1 font-bold"
                  >
                    +
                  </span>

                  <span
                    class="absolute text-red-500 -top-2 right-0 font-bold"
                    :class="[
                      prevStat && stat !== prevStat && stat !== 'hp' && 'group-hover:visible',
                      !prevStat && gen.id >= 3 && (natureTable as any)[selectedPoke.data.nature!]?.[stat] < 1 ? 'visible' : 'invisible'
                    ]"
                  >
                    -
                  </span>
                </div>
                <span
                  class="text-center px-1.5 min-w-9 text-xs"
                  :style="{color: baseStatColor(selectedPoke.species.stats[stat])}"
                >
                  {{ selectedPoke.species.stats[stat] }}
                </span>
              </template>
              <template v-else>
                <div class="flex justify-center items-center px-1.5 min-w-10">
                  <UButton variant="link" color="white" :padded="false" label="--" disabled />
                </div>
                <span class="text-center px-1.5 min-w-9 text-gray-500 text-xs">--</span>
              </template>
            </template>
          </div>
        </UCard>
        <UTextarea
          v-else
          v-model="currentPokeText"
          class="grow"
          :ui="{base: 'h-full min-h-[23.5rem]', rounded: 'rounded-lg'}"
          autofocus
          spellcheck="false"
        >
          <div class="absolute top-2 right-2 flex flex-col-reverse">
            <TooltipButton
              text="Save"
              :popper="{placement: 'bottom-end', offsetDistance: 40}"
              icon="material-symbols:save-outline"
              variant="ghost"
              color="gray"
              @click="
                (team.pokemon[selectedPokeIdx] = parsePokemon(team.format, currentPokeText.trim())),
                  (selectedTab = 0)
              "
            />
            <TooltipButton
              text="Copy"
              :popper="{placement: 'bottom-end', offsetDistance: 40}"
              icon="material-symbols:content-copy-outline"
              variant="ghost"
              color="gray"
              @click="copyTextArea(currentPokeText)"
            />
          </div>
        </UTextarea>
      </div>
    </div>
    <div v-else class="w-full h-[27.35rem] p-2">
      <UTextarea
        v-model="teamText"
        class="h-full"
        :ui="{base: 'h-full', rounded: 'rounded-lg'}"
        placeholder="Paste your team here..."
        variant="none"
        autofocus
      >
        <div class="absolute top-1 right-4 flex flex-col-reverse">
          <TooltipButton
            text="Save"
            :popper="{placement: 'bottom-end', offsetDistance: 40}"
            icon="material-symbols:save-outline"
            variant="ghost"
            color="gray"
            @click="teamTextChange(), (teamPokepaste = false)"
          />
          <TooltipButton
            text="Copy"
            :popper="{placement: 'bottom-end', offsetDistance: 40}"
            icon="material-symbols:content-copy-outline"
            variant="ghost"
            color="gray"
            @click="copyTextArea(teamText)"
          />
        </div>
      </UTextarea>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import {abilityList, type Species, type SpeciesId} from "~/game/species";
import type {Stats, StatId} from "~/game/utils";
import {GENERATIONS} from "~/game/gen";
import {Nature, natureTable, type FormId} from "~/game/pokemon";

defineEmits<{(e: "delete" | "close"): void}>();

const {team} = defineProps<{team: Team}>();
const toast = useToast();
const items = computed(() => {
  return team.pokemon.map(poke => ({
    label: poke.name ?? "",
    species: poke.species,
    form: gen.value.getForm(poke.form as FormId, poke.species as SpeciesId, ivsToDvsRaw(poke.ivs)),
  }));
});
const teamText = ref("");
const currentPokeText = ref("");
const selectedPokeIdx = ref(0);
const gen = computed(() => GENERATIONS[formatInfo[team.format].generation]!);
const statKeys = computed(() => getStatKeys(gen.value));
const selectedPoke = computed(() => ({
  data: team.pokemon[selectedPokeIdx.value],
  species: gen.value.speciesList[team.pokemon[selectedPokeIdx.value].species as SpeciesId] as
    | Species
    | undefined,
  evProxy: reactive(
    new Proxy(team.pokemon[selectedPokeIdx.value].evs, {
      get(target, prop) {
        if (gen.value.id <= 2) {
          if (prop === "spd") {
            prop = "spa";
          }
          return target[prop as StatId] ?? 255;
        } else {
          return target[prop as StatId] ?? 0;
        }
      },
      set(target, prop, val) {
        if (gen.value.id <= 2 && prop === "spd") {
          prop = "spa";
        }

        target[prop as StatId] = val;

        const total = getTotalEvs(target);
        if (total > gen.value.maxTotalEv) {
          let result = val - (total - gen.value.maxTotalEv);
          if (gen.value.id >= 3 && result % 4) {
            result -= result % 4;
          }
          target[prop as StatId] = result;
        }

        return true;
      },
    }),
  ),
  ivProxy: reactive(
    new Proxy(team.pokemon[selectedPokeIdx.value].ivs, {
      get(target, prop) {
        if (gen.value.id <= 2) {
          if (prop === "hp") {
            return dvToIv(gen.value.getHpIv(ivsToDvs(selectedPoke.value.data)));
          } else if (prop === "spd") {
            prop = "spa";
          }
        }
        return target[prop as StatId];
      },
      set(target, prop, val) {
        if (gen.value.id <= 2 && prop === "spd") {
          prop = "spa";
        }
        target[prop as StatId] = val;
        return true;
      },
    }),
  ),
}));

const onRangeInput = (e: Event & {target: HTMLInputElement}, stat: StatId) => {
  if (getTotalEvs(selectedPoke.value.evProxy) > gen.value.maxTotalEv) {
    e.target.value = String(selectedPoke.value.evProxy[stat]);
    e.preventDefault();
  }
};

const selectedTab = ref(0);
const teamPokepaste = ref(false);
const currGender = computed(() => {
  const species = gen.value.speciesList[selectedPoke.value.data.species as SpeciesId];
  if (!species) {
    return {gender: "N", icon: "material-symbols:question-mark", clazz: "", forced: true} as const;
  }

  let gender = gen.value.getGender(undefined, species, ivToDv(selectedPoke.value.data.ivs.atk));
  const forced = gender !== undefined;
  if (!forced) {
    gender = selectedPoke.value.data.gender;
  }

  if (gender === "M") {
    return {gender, icon: "material-symbols:male", clazz: "text-sky-400", forced} as const;
  } else if (gender === "F") {
    return {gender, icon: "material-symbols:female", clazz: "text-pink-400", forced} as const;
  } else if (gender === "N") {
    return {gender, icon: "material-symbols:question-mark", clazz: "", forced} as const;
  } else {
    return {gender, icon: "material-symbols:male", clazz: "text-sky-400", random: true} as const;
  }
});

const toggleGender = () => {
  if (selectedPoke.value.data.gender === "M") {
    selectedPoke.value.data.gender = "F";
  } else if (selectedPoke.value.data.gender === "F") {
    selectedPoke.value.data.gender = undefined;
  } else {
    selectedPoke.value.data.gender = "M";
  }
};

const natures = computed(() => {
  return Object.values(Nature)
    .filter(t => typeof t === "number")
    .map(k => ({
      value: k,
      name: toTitleCase(Nature[k]),
      plus: Object.keys(natureTable[k]).map(k => `+${statKeys.value[k as StatId]!}`)[0],
      minus: Object.keys(natureTable[k]).map(k => `-${statKeys.value[k as StatId]!}`)[1],
    }));
});

const getTotalEvs = (stats: Partial<Stats>) => {
  let v = 0;
  for (const stat in statKeys.value) {
    v += stats[stat as StatId] ?? 0;
  }
  return v;
};

watch([selectedPokeIdx, selectedTab], ([_, tab]) => {
  if (tab === 1) {
    currentPokeText.value = descToString(team.format, team.pokemon[selectedPokeIdx.value]).trim();
  }
});

watch(teamPokepaste, v => {
  if (v) {
    teamText.value = teamToString(team).trim();
  }
});

const onSpeciesChange = (s: Species) => {
  if (s.abilities.length) {
    selectedPoke.value.data.ability = abilityList[s.abilities[0]].name;
  }
};

for (const poke of team.pokemon) {
  for (let i = poke.moves.length; i < 4; i++) {
    poke.moves.push("");
  }
}

const copyTextArea = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.add({title: `Copied to clipboard!`});
};

const ivsToDvsRaw = (ivs: Partial<Stats>) => {
  const dvs: Partial<Stats> = {};
  for (const stat in statKeys.value) {
    dvs[stat as StatId] = ivToDv(ivs[stat as StatId]);
  }
  return dvs;
};

const ivsToDvs = (poke: TeamPokemonDesc) => {
  return ivsToDvsRaw(poke.ivs);
};

const calcPokeStat = (stat: StatId, poke: TeamPokemonDesc) => {
  if (gen.value.id <= 2) {
    return gen.value.calcStat(
      stat,
      gen.value.speciesList[poke.species as SpeciesId].stats,
      poke.level ?? 100,
      ivsToDvs(poke),
      {[stat]: evToStatexp(poke.evs[stat])},
    );
  } else {
    return gen.value.calcStat(
      stat,
      gen.value.speciesList[poke.species as SpeciesId].stats,
      poke.level ?? 100,
      poke.ivs,
      poke.evs,
      poke.nature,
    );
  }
};

const deletePokemon = (i: number) => {
  if (team.pokemon.length <= 1) {
    return;
  }

  const [poke] = team.pokemon.splice(i, 1);
  if (selectedPokeIdx.value >= team.pokemon.length) {
    selectedPokeIdx.value = team.pokemon.length - 1;
  }

  const name =
    poke.name || gen.value.speciesList[poke.species as SpeciesId]?.name || `Pokemon ${i + 1}`;
  toast.add({
    title: `${name} deleted!`,
    actions: [{label: "Undo", click: () => team.pokemon.splice(i, 0, poke)}],
  });
};

const addPokemon = async () => {
  if (team.pokemon.length >= 6) {
    return;
  }

  const length = team.pokemon.push(parsePokemon(team.format, ""));
  await nextTick();
  selectedPokeIdx.value = length - 1;
};

const teamTextChange = () => {
  const [parsed] = parseTeams(teamText.value);
  if (!parsed) {
    return;
  }

  if (parsed.pokemon.length === 0) {
    parsed.pokemon.push(parsePokemon(parsed.format, ""));
  }

  team.format = parsed.format;
  team.name = parsed.name;
  team.pokemon = parsed.pokemon;
};

const prevStat = ref<StatId>();

watch([selectedPoke, gen], () => {
  prevStat.value = undefined;
});

const trySetNature = (stat: StatId) => {
  if (stat === "hp") {
    return;
  } else if (!prevStat.value) {
    prevStat.value = stat;
    return;
  } else if (stat === prevStat.value) {
    prevStat.value = undefined;
    selectedPoke.value.data.nature = undefined;
    return;
  }

  for (const nature of Object.values(Nature)) {
    if (typeof nature !== "number") {
      continue;
    }

    const [plus, minus] = Object.keys(natureTable[nature]);
    if (plus === prevStat.value && minus === stat) {
      selectedPoke.value.data.nature = nature;
      prevStat.value = undefined;
      return;
    }
  }
};
</script>
