<template>
  <div class="divide-y divide-default h-full flex flex-col">
    <div class="p-4 flex gap-1">
      <FormatDropdown v-model="team.format" class="w-1/2" placeholder="Format" team-only />
      <UInput
        v-model.trim="team.name"
        :trailing="false"
        placeholder="Team name"
        class="w-full"
        autofocus
      />

      <div class="flex gap-0.5">
        <TooltipButton
          :key="+teamPokepaste"
          :text="teamPokepaste ? 'Team Edit' : 'Team PokePaste'"
          :icon="
            teamPokepaste
              ? 'material-symbols:edit-square-outline'
              : 'material-symbols:content-paste'
          "
          color="neutral"
          variant="ghost"
          @click="() => void (teamPokepaste = !teamPokepaste)"
        />
        <TooltipButton
          text="Delete Team"
          icon="material-symbols:delete-outline"
          color="error"
          variant="ghost"
          @click="() => $emit('delete')"
        />
        <TooltipButton
          text="Close"
          icon="material-symbols:close"
          color="error"
          variant="ghost"
          @click="() => $emit('close')"
        />
      </div>
    </div>

    <div v-if="!teamPokepaste" class="w-full h-full flex flex-col sm:flex-row overflow-hidden">
      <div class="hidden sm:block">
        <UTabs
          v-model="rawSelectedPokeIdx"
          orientation="vertical"
          color="neutral"
          :items
          :ui="{
            root: 'h-full flex',
            list: 'w-min rounded-tl-none rounded-r-none h-full',
            trigger: 'my-0.5 py-0 px-2 hover:data-[state=inactive]:bg-accented',
            indicator: 'bg-default',
          }"
          :content="false"
        >
          <template #default="{item: {speciesId, form}}">
            <BoxSprite class="-m-1" :species-id :scale="2" :form />
          </template>
        </UTabs>
      </div>

      <div class="block sm:hidden">
        <UTabs
          v-model="rawSelectedPokeIdx"
          class="px-2 pt-2"
          :ui="{
            trigger: 'hover:data-[state=inactive]:bg-accented mx-0.5',
            indicator: 'bg-default',
          }"
          :items
          :content="false"
          color="neutral"
        >
          <template #default="{item: {speciesId, form}}">
            <div class="size-[32px] flex items-center justify-center">
              <BoxSprite :species-id :form />
            </div>
          </template>
        </UTabs>
      </div>

      <UTabs
        v-model="selectedTab"
        variant="link"
        color="neutral"
        :ui="{
          root: 'h-full w-full px-2 pb-2 pt-1 overflow-hidden',
          content: 'h-full overflow-hidden',
        }"
        :items="[
          {label: 'Edit', icon: 'material-symbols:edit-square-outline', slot: 'edit' as const},
          {label: 'PokéPaste', icon: 'material-symbols:content-paste', slot: 'pokepaste' as const},
        ]"
      >
        <template #list-trailing>
          <div class="ml-auto flex items-center">
            <TooltipButton
              text="Add Random Pokemon"
              icon="mdi:dice-6-outline"
              variant="ghost"
              color="neutral"
              :disabled="team.pokemon.length >= 6"
              @click="newRandom"
            />
            <TooltipButton
              text="Add Pokemon"
              icon="material-symbols:add-2"
              variant="ghost"
              color="neutral"
              :disabled="team.pokemon.length >= 6"
              @click="addPokemon"
            />
            <TooltipButton
              text="Delete Pokemon"
              icon="material-symbols:delete-outline"
              color="error"
              variant="ghost"
              :disabled="team.pokemon.length < 2"
              @click="() => deletePokemon(selectedPokeIdx)"
            />
          </div>
        </template>

        <template #edit>
          <div class="h-full flex flex-col gap-2 justify-between p-1 rounded-md overflow-y-auto">
            <div class="flex gap-2">
              <div class="flex flex-col relative grow">
                <div class="absolute p-1 flex flex-col gap-1 z-10">
                  <div v-if="gen.id >= 2" class="relative">
                    <TooltipButton
                      text="Gender"
                      variant="ghost"
                      color="neutral"
                      :icon="currGender.icon"
                      :ui="{leadingIcon: currGender.clazz}"
                      :disabled="currGender.forced"
                      size="sm"
                      @click="toggleGender"
                    />

                    <UIcon
                      v-if="currGender.random"
                      name="mdi:dice-3-outline"
                      class="absolute -bottom-1 -right-1 size-3"
                    />
                  </div>

                  <TooltipButton
                    v-if="gen.id >= 2"
                    text="Shiny"
                    :icon="
                      gen.getShiny(selectedPoke.data.shiny, ivsToDvs(selectedPoke.data))
                        ? 'ion:sparkles'
                        : 'ion:sparkles-outline'
                    "
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    :disabled="gen.id <= 2"
                    @click="() => void (selectedPoke.data.shiny = !selectedPoke.data.shiny)"
                  />

                  <TooltipButton
                    text="Randomize Set"
                    icon="mdi:dice-3-outline"
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    :disabled="!selectedPoke.species"
                    @click="() => randomizeCurrent(true)"
                  />

                  <UPopover
                    v-if="choosableForms[selectedPoke.data.speciesId as SpeciesId] && !(gen.id <= 2 && selectedPoke.data.speciesId === 'unown')"
                    :content="{align: 'start'}"
                    :ui="{content: 'grid grid-cols-[repeat(5,max-content)] p-1 gap-1'}"
                  >
                    <TooltipButton
                      text="Change Form"
                      size="sm"
                      icon="lucide:chevron-down"
                      variant="ghost"
                      color="neutral"
                    />

                    <template #content>
                      <UButton
                        v-for="form in choosableForms[selectedPoke.data.speciesId as SpeciesId]"
                        :key="form"
                        variant="ghost"
                        color="neutral"
                        @click="selectedPoke.data.form = form"
                      >
                        <template #leading>
                          <BoxSprite
                            :species-id="selectedPoke.data.speciesId"
                            :form
                            :scale="1.25"
                            :shiny="selectedPoke.data.shiny"
                          />
                        </template>
                      </UButton>
                    </template>
                  </UPopover>
                </div>

                <SpeciesSelector
                  v-model="selectedPoke.data.speciesId"
                  ui="pl-10"
                  :team
                  :gen
                  :gender="currGender.gender"
                  :shiny="gen.getShiny(selectedPoke.data.shiny, ivsToDvs(selectedPoke.data))"
                  :form="gen.getForm(
                    selectedPoke.data.form,
                    selectedPoke.data.speciesId as SpeciesId,
                    ivsToDvs(selectedPoke.data),
                    (selectedPoke.data.item && normalizeName(selectedPoke.data.item)) as ItemId,
                    selectedPoke.data.moves.map(normalizeMoveName),
                  )"
                  @select="onSpeciesChange"
                />
                <InputWithMax
                  v-model.trim="selectedPoke.data.name"
                  :maxlength="24"
                  :placeholder="selectedPoke.species?.name ?? 'No Name'"
                />
                <ItemSelector
                  v-model="selectedPoke.data.item"
                  ui="pt-1"
                  :disabled="gen.id <= 1"
                  :poke="selectedPoke.data"
                  :gen
                />
                <AbilitySelector
                  v-model="selectedPoke.data.ability"
                  ui="pt-1"
                  :disabled="gen.id <= 2"
                  :poke="selectedPoke.data"
                  :gen
                />
              </div>
              <div class="flex flex-col justify-between gap-1">
                <div class="flex justify-between items-center">
                  <span class="text-sm">Level</span>
                  <NumericInput
                    v-model="selectedPoke.data.level"
                    class="w-12"
                    :placeholder="String(format.maxLevel)"
                    :min="1"
                    :max="format.maxLevel"
                  />
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm">Friendship</span>
                  <NumericInput
                    v-model="friendship"
                    class="w-12"
                    :placeholder="friendshipDisabled ? 'N/A' : '255'"
                    :disabled="friendshipDisabled"
                    :min="0"
                    :max="255"
                  />
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm">Nature</span>
                  <USelectMenu
                    v-model="nature"
                    class="w-24 sm:w-28"
                    label-key="name"
                    value-key="value"
                    :filter-fields="['name', 'plus', 'minus']"
                    :items="natures"
                    :placeholder="natureDisabled ? 'N/A' : 'Hardy'"
                    :disabled="natureDisabled"
                  >
                    <template #item="{item}">
                      <div class="text-sm">
                        <span>{{ item.name }}</span>
                        <div v-if="item.plus" class="text-xs">
                          <span class="text-lime-500">{{ item.plus }}</span
                          >,
                          <span class="text-red-500">{{ item.minus }}</span>
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
                  :format="team.format"
                  :gen
                />
              </div>
            </div>
            <div class="grid items-center grid-cols-[auto_1fr_auto_auto_auto_auto] gap-0.5 grow">
              <template v-for="(name, stat) in statKeys" :key="stat">
                <span class="px-1.5">{{ name }}</span>
                <USlider
                  v-model="selectedPoke.evProxy[stat]"
                  :min="0"
                  :max="gen.id <= 2 ? 255 : 252"
                  :step="gen.id <= 2 ? 1 : 4"
                  color="success"
                  :disabled="gen.id <= 2 && stat === 'spd'"
                  @input="onRangeInput($event, stat)"
                />
                <UInputNumber
                  v-model="selectedPoke.evProxy[stat]"
                  :ui="{root: 'w-12 sm:w-10 text-xs', base: 'text-center'}"
                  size="sm"
                  variant="none"
                  :min="0"
                  :max="255"
                  :increment="false"
                  :decrement="false"
                  :placeholder="String(selectedPoke.evProxy[stat])"
                />
                <NumericInput
                  v-model="selectedPoke.ivProxy[stat]"
                  class="w-10"
                  :disabled="gen.id <= 2 && (stat === 'hp' || stat === 'spd')"
                  placeholder="31"
                  :min="0"
                  :max="31"
                />

                <template v-if="selectedPoke.species">
                  <div class="relative group flex justify-center items-center px-1.5 min-w-10">
                    <UButton
                      variant="link"
                      color="neutral"
                      class="px-0 sm:px-0"
                      :label="`${calcPokeStat(stat, selectedPoke.data)}`"
                      :disabled="stat === 'hp' || gen.id <= 2"
                      @click="trySetNature(stat)"
                    />

                    <span
                      v-if="gen.id >= 3 && (prevStat ? prevStat === stat : ((natureTable as any)[nature!]?.[stat] > 1))"
                      class="absolute text-lime-500 -top-2 -right-1 font-bold"
                    >
                      +
                    </span>

                    <span
                      class="absolute text-red-500 -top-2 right-0 font-bold"
                      :class="[
                      prevStat && stat !== prevStat && stat !== 'hp' && 'group-hover:visible',
                      !prevStat && gen.id >= 3 && (natureTable as any)[nature!]?.[stat] < 1 ? 'visible' : 'invisible'
                    ]"
                    >
                      -
                    </span>
                  </div>
                  <span
                    class="text-center px-1.5 min-w-9 text-sm"
                    :style="{color: baseStatColor(selectedPoke.species.stats[stat])}"
                  >
                    {{ selectedPoke.species.stats[stat] }}
                  </span>
                </template>
                <template v-else>
                  <div class="flex justify-center items-center px-1.5 min-w-10">
                    <UButton variant="link" color="neutral" :padded="false" label="--" disabled />
                  </div>
                  <span class="text-center px-1.5 min-w-9 text-dimmed text-sm">--</span>
                </template>
              </template>
            </div>
          </div>
        </template>

        <template #pokepaste>
          <UTextarea
            v-model="currentPokeText"
            class="w-full h-full overflow-y-auto"
            :ui="{base: 'h-full', trailing: 'pointer-events-none'}"
            variant="none"
            autofocus
            autoresize
            spellcheck="false"
          >
            <template #trailing>
              <div class="flex flex-col-reverse pointer-events-auto mr-1.5">
                <TooltipButton
                  text="Save"
                  icon="material-symbols:save-outline"
                  variant="ghost"
                  color="neutral"
                  @click="
                    () => {
                      team.pokemon[selectedPokeIdx] = parsePokemon(
                        team.format,
                        currentPokeText.trim(),
                      );
                      selectedTab = '0';
                    }
                  "
                />
                <TooltipButton
                  text="Copy"
                  icon="material-symbols:content-copy-outline"
                  variant="ghost"
                  color="neutral"
                  @click="() => copyTextArea(currentPokeText)"
                />
              </div>
            </template>
          </UTextarea>
        </template>
      </UTabs>
    </div>
    <UTextarea
      v-else
      v-model="teamText"
      class="w-full h-full p-2 overflow-y-auto"
      :ui="{base: 'h-full', trailing: 'pointer-events-none'}"
      placeholder="Paste your team here..."
      variant="none"
      autofocus
      autoresize
      spellcheck="false"
    >
      <template #trailing>
        <div class="flex flex-col-reverse pointer-events-auto mr-2.5">
          <TooltipButton
            text="Save"
            icon="material-symbols:save-outline"
            variant="ghost"
            color="neutral"
            @click="() => void (teamTextChange(), (teamPokepaste = false))"
          />
          <TooltipButton
            text="Copy"
            icon="material-symbols:content-copy-outline"
            variant="ghost"
            color="neutral"
            @click="() => copyTextArea(teamText)"
          />
        </div>
      </template>
    </UTextarea>
  </div>
</template>

<script setup lang="ts">
import {abilityList, type Species, type SpeciesId} from "~~/game/species";
import type {Stats, StatId} from "~~/game/utils";
import {GENERATIONS} from "~~/game/gen";
import {choosableForms, Nature, natureTable, type FormId} from "~~/game/pokemon";
import type {ItemId} from "~~/game/item";
import {defaultCustomize, getRandomPokemon} from "~~/server/utils/formats";

defineEmits<{delete: []; close: []}>();

const {team} = defineProps<{team: Team}>();
const toast = useToast();
const items = computed(() => {
  return team.pokemon.map(poke => ({
    label: poke.name ?? "",
    speciesId: poke.speciesId,
    form: gen.value.getForm(
      poke.form as FormId,
      poke.speciesId as SpeciesId,
      ivsToDvsRaw(poke.ivs),
      (poke.item && normalizeName(poke.item)) as ItemId,
      poke.moves.map(normalizeMoveName),
    ),
  }));
});
const teamText = ref("");
const currentPokeText = ref("");
const rawSelectedPokeIdx = ref("0");

const selectedPokeIdx = computed({
  get: () => +rawSelectedPokeIdx.value,
  set: v => (rawSelectedPokeIdx.value = String(v)),
});
const format = computed(() => formatInfo[team.format]);
const gen = computed(() => GENERATIONS[format.value.generation]!);
const statKeys = computed(() => getStatKeys(gen.value));
const selectedPoke = computed(() => ({
  data: team.pokemon[selectedPokeIdx.value],
  species: gen.value.speciesList[team.pokemon[selectedPokeIdx.value].speciesId as SpeciesId] as
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

const natureDisabled = computed(() => gen.value.id <= 2);
const friendshipDisabled = computed(() => gen.value.id <= 1);
const nature = readEmptyIfDisabled(
  computed({
    get: () => selectedPoke.value.data.nature,
    set: v => (selectedPoke.value.data.nature = v),
  }),
  undefined,
  natureDisabled,
);
const friendship = readEmptyIfDisabled(
  computed({
    get: () => selectedPoke.value.data.friendship,
    set: v => (selectedPoke.value.data.friendship = v),
  }),
  undefined,
  friendshipDisabled,
);

const selectedTab = ref("0");
const teamPokepaste = ref(false);
const currGender = computed(() => {
  const species = gen.value.speciesList[selectedPoke.value.data.speciesId as SpeciesId];
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

watch([selectedTab, selectedPokeIdx, selectedPoke], ([tab]) => {
  if (tab === "1") {
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

  if (s.requiresItem) {
    selectedPoke.value.data.item = gen.value.items[s.requiresItem].name;
  }
};

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
      gen.value.speciesList[poke.speciesId as SpeciesId].stats,
      poke.level ?? format.value.maxLevel,
      ivsToDvs(poke),
      {[stat]: evToStatexp(poke.evs[stat])},
    );
  } else {
    return gen.value.calcStat(
      stat,
      gen.value.speciesList[poke.speciesId as SpeciesId].stats,
      poke.level ?? format.value.maxLevel,
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
    poke.name || gen.value.speciesList[poke.speciesId as SpeciesId]?.name || `Pokemon ${i + 1}`;
  toast.add({
    title: `${name} deleted!`,
    actions: [{label: "Undo", onClick: () => void team.pokemon.splice(i, 0, poke)}],
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

const newRandom = async () => {
  await addPokemon();
  randomizeCurrent(false);
};

const randomizeCurrent = (keepSpecies: bool) => {
  const current = selectedPoke.value.data;
  const [pokemon] = getRandomPokemon(
    gen.value,
    1,
    (_, id) => !keepSpecies || id === current.speciesId,
    (s, id) => defaultCustomize(gen.value, format.value.maxLevel, s, id),
  );

  current.evs = pokemon.evs ?? {};
  current.ivs = pokemon.ivs ?? {};
  current.level = undefined;
  current.name = pokemon.name;
  current.speciesId = pokemon.speciesId;
  current.moves = pokemon.moves.map(move => gen.value.moveList[move].name);
  current.friendship = pokemon.friendship === 255 ? undefined : pokemon.friendship;
  current.item = pokemon.item && gen.value.items[pokemon.item].name;
  current.shiny = pokemon.shiny;
  current.gender = pokemon.gender;
  current.nature = pokemon.nature;
  current.ability = pokemon.ability && abilityList[pokemon.ability].name;
  current.form = pokemon.form;
};

const teamTextChange = () => {
  const [parsed] = parseTeams(teamText.value, team.format);
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

onMounted(() => {
  for (const poke of team.pokemon) {
    for (let i = poke.moves.length; i < 4; i++) {
      poke.moves.push("");
    }
  }
});
</script>
