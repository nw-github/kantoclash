<template>
  <TouchPopover :popper="{placement: 'auto'}">
    <UButton
      :disabled="!option.valid"
      class="flex justify-between content-center w-full p-1 text-black"
      color="gray"
      @click="$emit('click')"
    >
      <div class="flex items-center">
        <div class="pl-0.5 pr-1">
          <TypeBadge :type="info.type" :alt="info.type" image />
        </div>
        <span class="text-sm sm:text-base truncate">{{ move.name }}</span>
      </div>
      <span class="text-xs">
        {{ option.pp !== undefined ? option.pp : "--" }}/{{ gen.getMaxPP(move) }}
      </span>
    </UButton>

    <template #panel>
      <ul class="list-none p-2 m-0 w-max max-w-[300px]">
        <template v-for="{pow, acc, pokes} in info.powers" :key="pokes">
          <li v-if="displayAgainst && info.powers.length > 1" class="flex gap-1 items-center">
            Against
            <BoxSprite
              v-for="{speciesId, form} in pokes"
              :key="speciesId + form"
              :species-id
              :form
            />
          </li>
          <li>
            <h4 class="inline-block w-8 text-center" :class="[move.power !== pow && 'font-bold']">
              {{ pow || "--" }}
            </h4>
            Power
          </li>
          <li>
            <h4 class="inline-block w-8 text-center" :class="[move.acc !== acc && 'font-bold']">
              {{ acc || "--" }}
            </h4>
            Accuracy
          </li>
        </template>

        <li v-if="move.priority">
          <h4 class="inline-block w-8 text-center">
            {{ move.priority > 0 ? `+${move.priority}` : move.priority }}
          </h4>
          Priority
        </li>
        <li class="pt-3">{{ describeMove(gen, option.move) }}</li>
        <li class="pt-3 -mb-1.5 italic text-sm">{{ targeting }}</li>
        <li class="pt-3 space-x-1 flex">
          <TypeBadge :type="info.type" />
          <MoveCategory :category="gen.getCategory(move, info.type)" />
          <UBadge v-if="move.kind === 'damage' && move.contact" label="Contact" />
        </li>
      </ul>
    </template>
  </TouchPopover>
</template>

<script setup lang="ts">
import type {MoveOption} from "~~/game/battle";
import type {Generation} from "~~/game/gen";
import {abilityList, type SpeciesId} from "~~/game/species";
import {Range} from "~~/game/moves";
import {MC, type Type, type Weather} from "~~/game/utils";
import type {ItemData} from "~~/game/item";
import {Nature, Pokemon, type FormId} from "~~/game/pokemon";

defineEmits<{(e: "click"): void}>();

const {gen, option, poke, weather, opponent} = defineProps<{
  option: MoveOption;
  gen: Generation;
  poke: ClientActivePokemon;
  weather?: Weather;
  opponent?: ClientPlayer;
}>();
const move = computed(() => gen.moveList[option.move]);
const info = computed(() => {
  let type = move.value.type;

  if (move.value.kind === "damage" && poke && move.value.getType) {
    type = move.value.getType(poke.base!, weather);
  }

  const powers: {pokes: {speciesId: SpeciesId; form?: FormId}[]; pow?: number; acc?: number}[] = [];
  const item = gen.items[poke.base!.item!];
  for (const opp of opponent?.active?.toReversed() ?? []) {
    let pow = move.value.power;
    if (!opp) {
      continue;
    }

    const speciesId = opp.transformed || opp.speciesId;
    const opponentPoke = new Pokemon(gen, {
      speciesId,
      level: opp.level,
      name: opp.name,
      shiny: opp.shiny,
      gender: opp.gender,
      form: opp.form,
      ivs: {},
      evs: {},
      moves: [],
      friendship: 0,
      nature: Nature.quiet,
    });
    opponentPoke.stats.hp = 100;
    opponentPoke.hp = opp.hpPercent;

    if (move.value.kind === "damage" && poke && move.value.getPower) {
      pow = move.value.getPower(poke.base!, opponentPoke);
    }

    pow = pow ? applyPowerModifiers(pow, type, item) : undefined;
    const acc = applyAccuracyModifiers(move.value.acc, item);
    const other = powers.find(r => r.pow == pow && r.acc == acc);
    if (other) {
      other.pokes.push({speciesId, form: opp.form});
      continue;
    }

    powers.push({pokes: [{speciesId, form: opp.form}], pow, acc});
  }

  return {type, powers} as const;
});
const displayAgainst = computed(() => {
  switch (move.value.range) {
    case Range.Random:
      return true;
    case Range.Adjacent:
      return true;
    case Range.AdjacentFoe:
      return true;
    case Range.Any:
      return true;
    case Range.All:
      return true;
    case Range.AllAdjacent:
      return true;
    case Range.AllAdjacentFoe:
      return true;
    default:
      return false;
  }
});

const targeting = computed(() => {
  // prettier-ignore
  switch (move.value.range) {
  case Range.Self: return "Targets the user.";
  case Range.Random: return "Targets a random opponent.";
  case Range.Adjacent: return "Can target any adjacent Pokémon.";
  case Range.AdjacentFoe: return "Can target any adjacent opponent.";
  case Range.AdjacentAlly: return "Can target any adjacent ally.";
  case Range.SelfOrAdjacentAlly: return "Can target the user or an adjacent ally.";
  case Range.Any: return "Can target any other Pokémon.";
  case Range.All: return "Targets all Pokémon.";
  case Range.AllAllies: return "Targets all ally Pokémon.";
  case Range.AllAdjacent: return "Targets all adjacent Pokémon.";
  case Range.AllAdjacentFoe: return "Targets all adjacent foes.";
  case Range.Field: return "Targets the field.";
  default: return "";
  }
});

const applyPowerModifiers = (pow: number, type: Type, item?: ItemData) => {
  if (pow !== 1 && item?.typeBoost?.type === type) {
    pow += Math.floor(pow * (item.typeBoost.percent / 100));
  }
  if (option.move === "facade" && poke.base!.status) {
    pow *= 2;
  }
  if (option.move === "spitup" && poke.v.stockpile) {
    pow *= poke.v.stockpile;
  }
  if (option.move === "weatherball" && weather) {
    pow *= 2;
  }
  if (
    poke.base!.belowHp(3) &&
    poke.v.ability &&
    abilityList[poke.v.ability].pinchBoostType === type
  ) {
    pow += Math.floor(pow / 2);
  }
  if (pow <= 60 && poke.v.ability === "technician") {
    pow += Math.floor(pow / 2);
  }
  return pow;
};

const applyAccuracyModifiers = (acc: number | undefined, item?: ItemData) => {
  if (acc && item?.boostAcc) {
    acc += Math.floor(acc * (item.boostAcc / 100));
  }
  if (acc && poke.v.ability === "hustle" && gen.getCategory(move.value) === MC.physical) {
    acc -= Math.floor(acc * 0.2);
  }
  if (poke.v.ability === "noguard") {
    acc = undefined;
  }
  return acc;
};
</script>
