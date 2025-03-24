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
              <BoxSprite :species="item.species" :scale="2" />
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
              <BoxSprite :species="item.species" />
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
              <div
                v-if="gen.id > 1 && gen.speciesList[selectedPoke.data.species as SpeciesId]"
                class="absolute p-2 flex flex-col gap-1"
              >
                <GenderIcon
                  class="size-6"
                  :gender="getGender(
                    gen.speciesList[selectedPoke.data.species as SpeciesId],
                    ivToDv(selectedPoke.data.ivs.atk),
                  )"
                />

                <UIcon
                  v-if="getShiny(ivsToDvs(selectedPoke.data))"
                  name="tabler:sparkles"
                  class="size-6"
                />
              </div>

              <PokemonSelector
                v-model="selectedPoke.data.species"
                :team
                :gen
                :shiny="getShiny(ivsToDvs(selectedPoke.data))"
              />
              <InputWithMax
                v-model.trim="selectedPoke.data.name"
                :maxlength="24"
                :placeholder="selectedPoke.species?.name ?? ''"
              />
              <ItemSelector v-if="gen.id >= 2" v-model="selectedPoke.data.item" class="pt-1" :gen />
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
              <MoveSelector
                v-for="(_, i) in 4"
                :key="i"
                v-model="selectedPoke.data.moves[i]"
                :poke="selectedPoke.data"
                :gen
              />
            </div>
          </div>
          <div class="grid items-center grid-cols-[auto,1fr,auto,auto,auto,auto] gap-1 grow">
            <template v-for="(name, stat) in statKeys" :key="stat">
              <span class="px-1.5">{{ name }}</span>
              <URange
                v-model="selectedPoke.evProxy[stat === 'spd' ? 'spa' : stat]"
                :min="0"
                :max="255"
                color="green"
                :disabled="stat === 'spd'"
              />
              <span class="text-center px-1.5 min-w-8 text-xs">
                {{ selectedPoke.evProxy[stat === "spd" ? "spa" : stat] }}
              </span>
              <NumericInput
                v-if="stat === 'hp'"
                class="w-10"
                disabled
                :placeholder="String(dvToIv(getHpDv(ivsToDvs(selectedPoke.data))))"
              />
              <NumericInput
                v-else
                v-model="selectedPoke.data.ivs[stat === 'spd' ? 'spa' : stat]"
                class="w-10"
                placeholder="31"
                :min="0"
                :max="31"
                :disabled="stat === 'spd'"
              />

              <template v-if="selectedPoke.species">
                <span
                  v-if="selectedPoke.data.species"
                  class="text-center px-1.5 min-w-10 text-gray-500"
                >
                  {{ calcPokeStat(stat, selectedPoke.data) }}
                </span>
                <span
                  class="text-center px-1.5 min-w-8 text-xs"
                  :style="{color: baseStatColor(selectedPoke.species.stats[stat] ?? 0)}"
                >
                  {{ selectedPoke.species.stats[stat] ?? 0 }}
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
          v-model="currentPokeText"
          class="grow"
          :ui="{base: 'h-full min-h-[23.5rem]', rounded: 'rounded-lg'}"
          autofocus
          @change="team.pokemon[selectedPokeIdx] = parsePokemon(currentPokeText.trim())"
        >
          <TooltipButton
            text="Copy"
            :popper="{placement: 'bottom-end', offsetDistance: 40}"
            class="absolute top-2 right-2"
            icon="material-symbols:content-copy-outline"
            variant="ghost"
            color="gray"
            @click="copyTextArea(currentPokeText)"
          />
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
        @change="teamTextChange"
      >
        <TooltipButton
          text="Copy"
          :popper="{placement: 'bottom-end', offsetDistance: 40}"
          class="absolute top-1 right-2"
          icon="material-symbols:content-copy-outline"
          variant="ghost"
          color="gray"
          @click="copyTextArea(teamText)"
        />
      </UTextarea>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import {calcStat, getGender, getHpDv, getShiny} from "~/game/pokemon";
import type {Species, SpeciesId} from "~/game/species";
import type {Stats} from "~/game/utils";
import {GENERATIONS} from "~/game/gen";

defineEmits<{(e: "delete" | "close"): void}>();

const {team} = defineProps<{team: Team}>();
const toast = useToast();
const items = computed(() => {
  return team.pokemon.map(poke => ({label: poke.name ?? "", species: poke.species}));
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
        return target[prop as keyof Stats] ?? 255;
      },
      set(target, prop, val) {
        target[prop as keyof Stats] = val;
        return true;
      },
    }),
  ),
}));
const selectedTab = ref(0);
const teamPokepaste = ref(false);

watch([selectedPokeIdx, selectedTab], ([_, tab]) => {
  if (tab === 1) {
    currentPokeText.value = descToString(team.pokemon[selectedPokeIdx.value]);
  }
});

watch(teamPokepaste, v => {
  if (v) {
    teamText.value = teamToString(team);
  }
});

for (const poke of team.pokemon) {
  for (let i = poke.moves.length; i < 4; i++) {
    poke.moves.push("");
  }
}

const copyTextArea = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.add({title: `Copied to clipboard!`});
};

const ivsToDvs = (poke: TeamPokemonDesc) => {
  const dvs: Partial<Stats> = {};
  for (const stat in statKeys.value) {
    dvs[stat as keyof Stats] = ivToDv(poke.ivs[stat as keyof Stats]);
  }
  return dvs;
};

const calcPokeStat = (stat: keyof Stats, poke: TeamPokemonDesc) => {
  return calcStat(
    stat,
    gen.value.speciesList[poke.species as SpeciesId].stats,
    poke.level ?? 100,
    ivsToDvs(poke),
    {[stat]: evToStatexp(poke.evs[stat])},
  );
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

  const length = team.pokemon.push(parsePokemon(""));
  await nextTick();
  selectedPokeIdx.value = length - 1;
};

const teamTextChange = () => {
  const [parsed] = parseTeams(teamText.value);
  if (!parsed) {
    return;
  }

  if (parsed.pokemon.length === 0) {
    parsed.pokemon.push(parsePokemon(""));
  }

  team.format = parsed.format;
  team.name = parsed.name;
  team.pokemon = parsed.pokemon;
};
</script>
