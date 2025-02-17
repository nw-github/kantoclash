<template>
  <UCard :ui="{ header: { padding: 'p-4 sm:p-4' }, body: { padding: 'p-0 sm:p-0' } }">
    <template #header>
      <div class="flex space-x-1">
        <FormatDropdown class="w-1/2" placeholder="Format" v-model="team.format" teamOnly />
        <UInput :trailing="false" placeholder="Team name" class="w-full" v-model="team.name" />

        <div class="flex space-x-0.5">
          <UButton
            icon="material-symbols:add-2"
            variant="ghost"
            color="gray"
            @click="selectedPoke = props.team.pokemon.push(parsePokemon(''))"
            :disabled="props.team.pokemon.length >= 6"
          />
          <!-- <UButton icon="material-symbols:save-outline" color="gray" variant="ghost" /> -->
          <UButton icon="material-symbols:delete-outline" color="red" variant="ghost" />
          <UButton icon="material-symbols:close" color="red" variant="ghost" />
        </div>
      </div>
    </template>

    <UTabs
      orientation="vertical"
      class="flex gap-2 pr-2"
      :items="items"
      :ui="{ list: { width: 'w-min', rounded: 'rounded-tl-none', tab: { height: 'h-min' } } }"
      v-model="selectedPoke"
    >
      <template #default="{ item }">
        <div class="w-[64px] h-[64px] m-1">
          <Sprite
            :species="(speciesList as Record<string, Species>)[item.poke.species]"
            :scale="2"
            kind="box"
          />
        </div>
      </template>
      <template #item="{ item }">
        <UTabs
          class="parent-h-100 tab-2 flex flex-col h-full"
          :items="[{ label: 'Edit' }, { label: 'PokePaste' }]"
          @change="index => index === 1 && (textAreaText = descToString(item.poke))"
        >
          <template #item="{ index }">
            <UCard
              class="parent-h-100 h-full flex"
              :ui="{ body: { base: 'flex flex-col gap-2 grow', padding: 'p-2 sm:p-2' } }"
              v-if="index === 0"
            >
              <div class="flex space-x-2 grow">
                <div class="flex flex-col items-center justify-between">
                  <div class="w-[128px] h-[117px] my-2">
                    <Sprite :species="item.species" :scale="2" kind="front" />
                  </div>
                  <UInput
                    :maxlength="24"
                    v-model="item.poke.name"
                    :placeholder="item.species?.name ?? ''"
                  >
                    <template #trailing>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ item.poke.name?.length ?? 0 }}/24
                      </span>
                    </template>
                  </UInput>
                </div>
                <div class="flex flex-col justify-between">
                  <div class="flex justify-between items-center">
                    <span>Level:</span>
                    <UInput class="w-20" placeholder="100" />
                  </div>
                  <UInput
                    v-for="(_, i) in 4"
                    v-model="item.poke.moves[i]"
                    placeholder="Add move..."
                  />
                </div>
              </div>
              <div class="grid items-center grid-cols-[auto,1fr,auto,auto,auto,auto] gap-1">
                <template v-for="stat in statKeys">
                  <span class="px-1.5">{{ statName[stat] }}</span>
                  <URange :min="0" :max="255" color="green" v-model="item.poke.evs[stat]" />
                  <span class="text-center px-1.5 min-w-8 text-xs">
                    {{ item.poke.evs[stat] }}
                  </span>
                  <UInput class="w-10" :disabled="stat === 'hp'" />
                  <template v-if="item.species">
                    <span class="text-center px-1.5 min-w-10 text-gray-500" v-if="item.species">
                      {{
                        calcStat(
                          item.species.stats[stat],
                          item.poke.level,
                          item.poke.ivs[stat] / 2,
                          item.poke.evs[stat] * 257,
                        )
                      }}
                    </span>
                    <span class="text-center px-1.5 min-w-8 text-gray-500 text-xs">
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
              class="parent-h-100 h-full"
              v-else
              :ui="{ base: 'h-full', rounded: 'rounded-lg' }"
              v-model="textAreaText"
              @change="team.pokemon[item.teamIndex] = parsePokemon(textAreaText)"
            >
              <UButton
                class="absolute top-2 right-2"
                icon="material-symbols:content-copy-outline"
                variant="ghost"
                color="gray"
                @click="copyTextArea"
              />
            </UTextarea>
          </template>
        </UTabs>
      </template>
    </UTabs>
  </UCard>
</template>

<style>
*:has(> .parent-h-100) {
  height: 100%;
  padding-bottom: 0.5rem;
}

.tab-2 > :nth-child(2) {
  height: 100%;
}
</style>

<script setup lang="ts">
import { calcStat } from "@/game/pokemon";
import { speciesList, type Species } from "@/game/species";
import { statKeys, type Stats } from "@/game/utils";

// const unusedMoves = computed(() => species.moves.filter(id => !moves.value.includes(id)));

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

for (const poke of props.team.pokemon) {
  for (let i = poke.moves.length; i < 4; i++) {
    poke.moves.push("");
  }
}

const copyTextArea = () => {
  navigator.clipboard.writeText(textAreaText.value);
  toast.add({ title: `Copied to clipboard!` });
};
</script>
