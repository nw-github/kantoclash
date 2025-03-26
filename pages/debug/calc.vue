<template>
  <div class="overflow-y-auto h-full overflow-x-hidden p-2">
    <code>
      {{ getHiddenPower(dvs) }}
    </code>

    <div class="pb-10 flex gap-1">
      <UFormGroup label="Atk">
        <NumericInput v-model="dvs.atk" :min="0" :max="15" />
      </UFormGroup>
      <UFormGroup label="Def">
        <NumericInput v-model="dvs.def" :min="0" :max="15" />
      </UFormGroup>

      <UFormGroup label="Spa">
        <NumericInput v-model="dvs.spa" :min="0" :max="15" />
      </UFormGroup>

      <UFormGroup label="Spe">
        <NumericInput v-model="dvs.spe" :min="0" :max="15" />
      </UFormGroup>
    </div>

    <div class="flex justify-between gap-2">
      <USelectMenu
        v-model="userSpecies"
        :options="allSpecies"
        searchable
        class="grow"
        clear-search-on-close
      />
      <code>{{ user.stats }}</code>
    </div>
    <div class="flex justify-between gap-2">
      <USelectMenu
        v-model="targetSpecies"
        :options="allSpecies"
        searchable
        class="grow"
        clear-search-on-close
      />
      <code>{{ target.stats }}</code>
    </div>

    <UFormGroup label="Level">
      <UInput v-model.number="level" />
    </UFormGroup>

    <div class="py-2">
      <UCheckbox v-model="isCrit" label="Critical hit" />
      <UCheckbox v-model="burn" label="Burn" />
      <UButton label="Swap" @click="[userSpecies, targetSpecies] = [targetSpecies, userSpecies]" />
    </div>

    <div class="py-2">
      <USelectMenu v-model="moves" :options="allMoves" multiple searchable />
      <UButton label="Clear" @click="moves.length = 0" />
    </div>

    <div v-for="[id, move, rolls, min, max] in moves.map(getRolls)" :key="id" class="py-5">
      <div>
        {{ id }} ({{ move.power ?? 0 }}), {{ move.type }}, {{ getCategory(move) }} | {{ min }}% -
        {{ max }}%
      </div>
      <code class="text-sm">
        {{ [...rolls] }}
      </code>
      <UFormGroup :error="errors[id]">
        {{ void verify(id, rolls) }}
        <UTextarea v-model="texts[id]" @change="verify(id, rolls)" />
      </UFormGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import {getCategory, moveList, type MoveId} from "~/game/moves";
import {getHiddenPower, Pokemon} from "~/game/pokemon";
import {type SpeciesId, speciesList} from "~/game/species";
import {
  calcDamage,
  getEffectiveness,
  hpPercentExact,
  isSpecial,
  type StageStats,
  type Stats,
} from "~/game/utils";

definePageMeta({middleware: ["admin"]});

const dvs = reactive<Partial<StageStats>>({atk: 15, def: 15, spa: 15, spe: 15});

const allMoves = Object.keys(moveList) as MoveId[];
const allSpecies = Object.keys(speciesList) as MoveId[];

const userSpecies = ref<SpeciesId>("aerodactyl");
const targetSpecies = ref<SpeciesId>("victreebel");
const moves = ref<MoveId[]>(["doubleedge", "fireblast", "fly", "explosion"]);
const texts = reactive<Partial<Record<MoveId, string>>>({});
const errors = reactive<Partial<Record<MoveId, string>>>({});
const burn = ref(false);
const isCrit = ref(false);
const level = ref(100);
const user = computed(
  () => new Pokemon(userSpecies.value, {}, {}, isNaN(level.value) ? 100 : +level.value, []),
);
const target = computed(
  () => new Pokemon(targetSpecies.value, {}, {}, isNaN(level.value) ? 100 : +level.value, []),
);

const verify = (id: MoveId, rolls: number[]) => {
  if (!texts[id]) {
    return;
  }

  const res = texts[id].matchAll(/\d+/g);
  if (!res) {
    errors[id] = "Invalid";
    return;
  }

  const values = res.map(v => +v).toArray();
  if (values.length !== rolls.length) {
    errors[id] = "Length mismatch";
  } else if (!values.every((v, i) => rolls[i] === v)) {
    const mismatches = [];
    for (let i = 0; i < rolls.length; i++) {
      if (rolls[i] !== values[i]) {
        mismatches.push(`Expected ${values[i]}, got ${rolls[i]}`);
      }
    }
    errors[id] = mismatches.join(", ");
  } else {
    errors[id] = undefined;
  }
};

const getRolls = (id: MoveId) => {
  const getStat = (poke: Pokemon, stat: keyof Stats, screen?: boolean) => {
    let res = poke.stats[stat];
    if (stat === "atk" && !isCrit.value && burn.value) {
      res = Math.max(Math.floor(res / 2), 1);
    }

    if (screen) {
      res *= 2;
    }

    return res;
  };

  const move = moveList[id];

  if (!move.power) {
    return [id, move, [] as number[], 0, 0, target.value.stats.hp] as const;
  }

  const eff = getEffectiveness(move.type, speciesList[target.value.speciesId].types);
  let atk = getStat(user.value, isSpecial(move.type) ? "spa" : "atk");
  let def = getStat(target.value, isSpecial(move.type) ? "spa" : "def");
  if (atk >= 256 || def >= 256) {
    atk = Math.max(Math.floor(atk / 4) % 256, 1);
    // defense doesn't get capped here on cart, potentially causing divide by 0
    def = Math.max(Math.floor(def / 4) % 256, 1);
  }

  if (id === "explosion" || id === "selfdestruct") {
    def = Math.max(Math.floor(def / 2), 1);
  }

  const isStab = speciesList[user.value.speciesId].types.includes(move.type);
  const rolls = [];
  for (let rand = 217; rand <= 255; rand++) {
    rolls.push(
      calcDamage({
        lvl: user.value.level,
        pow: move.power ?? 0,
        atk,
        def,
        eff,
        isCrit: isCrit.value,
        isStab,
        rand,
      }),
    );
  }

  const [min, max] = [Math.min(...rolls), Math.max(...rolls)];
  return [
    id,
    move,
    rolls,
    roundTo(hpPercentExact(min, target.value.stats.hp), 1),
    roundTo(hpPercentExact(max, target.value.stats.hp), 1),
    target.value.stats.hp,
  ] as const;
};
</script>
