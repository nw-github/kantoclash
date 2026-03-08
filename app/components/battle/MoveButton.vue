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
          <TypeBadge :type="info.type" image />
        </div>
        <span class="text-sm sm:text-base truncate">{{ move.name }}</span>
      </div>
      <span class="text-xs">
        {{ option.pp !== undefined ? option.pp : "--" }}/{{ user.base.gen.getMaxPP(move) }}
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
        <li class="pt-3">{{ describeMove(user.base.gen, option.move) }}</li>
        <li class="pt-3 -mb-1.5 italic text-sm">{{ targeting }}</li>
        <li class="pt-3 space-x-1 flex">
          <TypeBadge :type="info.type" />
          <MoveCategory :category="user.base.gen.getCategory(move, info.type)" />
          <UBadge v-if="move.kind === 'damage' && move.contact" label="Contact" />
          <UBadge v-if="move.sound" label="Sound" />
        </li>
      </ul>
    </template>
  </TouchPopover>
</template>

<script setup lang="ts">
import type {MoveOption} from "~~/game/battle";
import {abilityList} from "~~/game/species";
import {Range} from "~~/game/moves";
import {MC, type Type, type Weather} from "~~/game/utils";
import type {ItemData} from "~~/game/item";
import type {Pokemon} from "~~/game/pokemon";

defineEmits<{(e: "click"): void}>();

const {option, user, weather, opponent} = defineProps<{
  option: MoveOption;
  user: ClientActivePokemon;
  weather?: Weather;
  opponent?: ClientPlayer;
}>();
const move = computed(() => user.base.gen.moveList[option.move]);
const info = computed(() => {
  let type = move.value.type;

  if (move.value.kind === "damage" && move.value.getType) {
    type = move.value.getType(user.base, weather);
  }

  const powers: {pokes: Pokemon[]; pow?: number; acc?: number}[] = [];
  const item = user.base.item;
  for (const opp of opponent?.active?.toReversed() ?? []) {
    let pow = move.value.power;
    if (!opp || opp.fainted) {
      continue;
    }

    if (move.value.kind === "damage" && move.value.getPower) {
      pow = move.value.getPower(user.base, opp.base);
    }

    pow = pow ? applyPowerModifiers(pow, type, item) : undefined;
    const acc = applyAccuracyModifiers(move.value.acc, item);
    const other = powers.find(r => r.pow == pow && r.acc == acc);
    if (other) {
      other.pokes.push(opp.base);
      continue;
    }

    powers.push({pokes: [opp.base], pow, acc});
  }

  return {type, powers} as const;
});
const displayAgainst = computed(() => displayAgainstList.includes(move.value.range));
const targeting = computed(() => targetingMap[move.value.range]);

const applyPowerModifiers = (pow: number, type: Type, item?: ItemData) => {
  if (
    pow !== 1 &&
    item?.typeBoost?.type === type &&
    (!item.typeBoost.species || item.typeBoost.species.includes(user.base.speciesId))
  ) {
    pow += Math.floor(pow * (item.typeBoost.percent / 100));
  }
  if (option.move === "facade" && user.base.status) {
    pow *= 2;
  }
  if (option.move === "spitup" && user.v.stockpile) {
    pow *= user.v.stockpile;
  }
  if (option.move === "weatherball" && weather) {
    pow *= 2;
  }
  if (
    user.base.belowHp(3) &&
    user.v.ability &&
    abilityList[user.v.ability].pinchBoostType === type
  ) {
    pow += Math.floor(pow / 2);
  }
  if (pow <= 60 && user.v.ability === "technician") {
    pow += Math.floor(pow / 2);
  }
  return pow;
};

const applyAccuracyModifiers = (acc: number | undefined, item?: ItemData) => {
  if (acc && item?.boostAcc) {
    acc += Math.floor(acc * (item.boostAcc / 100));
  }
  if (acc && user.v.ability === "hustle" && user.base.gen.getCategory(move.value) === MC.physical) {
    acc -= Math.floor(acc * 0.2);
  }
  if (user.v.ability === "noguard") {
    acc = undefined;
  }
  return acc;
};

const targetingMap: Record<Range, string> = {
  [Range.Self]: "Targets the user.",
  [Range.Random]: "Targets a random opponent.",
  [Range.Adjacent]: "Can target any adjacent Pokémon.",
  [Range.AdjacentFoe]: "Can target any adjacent opponent.",
  [Range.AdjacentAlly]: "Can target any adjacent ally.",
  [Range.SelfOrAdjacentAlly]: "Can target the user or an adjacent ally.",
  [Range.Any]: "Can target any other Pokémon.",
  [Range.All]: "Targets all Pokémon.",
  [Range.AllAllies]: "Targets all ally Pokémon.",
  [Range.AllAdjacent]: "Targets all adjacent Pokémon.",
  [Range.AllAdjacentFoe]: "Targets all adjacent foes.",
  [Range.Field]: "Targets the field.",
};

const displayAgainstList = [
  Range.Random,
  Range.Adjacent,
  Range.AdjacentFoe,
  Range.Any,
  Range.All,
  Range.AllAdjacent,
  Range.AllAdjacentFoe,
];
</script>
