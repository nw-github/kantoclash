<template>
  <TouchPopover :content="{side: lessThanSm ? 'top' : 'right'}" :ui>
    <UButton
      class="w-full flex justify-between p-1"
      color="neutral"
      variant="subtle"
      :disabled="!option.valid"
      @click="$emit('click')"
    >
      <div class="flex items-center">
        <div class="pl-0.5 pr-1">
          <TypeBadge :type="info.type" image />
        </div>
        <span class="text-xs sm:text-base truncate">{{ move.name }}</span>
      </div>
      <span class="text-[calc(var(--text-xs)*0.75)] sm:text-xs">
        <span :class="ppColor(option.pp ?? 100)">{{
          option.pp !== undefined ? option.pp : "--"
        }}</span
        >/{{ user.base.gen.getMaxPP(move) }}
      </span>
    </UButton>

    <template #content>
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
import type {MoveOption, Player} from "~~/game/battle";
import {MC, Range} from "~~/game/utils";
import type {ItemData} from "~~/game/item";
import type {Pokemon} from "~~/game/pokemon";

import {breakpointsTailwind} from "@vueuse/core";

defineEmits<{click: []}>();

const breakpoint = useBreakpoints(breakpointsTailwind);
const lessThanSm = breakpoint.smaller("sm");
const manager = injectManager();

const {option, user, opponent} = defineProps<{
  option: MoveOption;
  user: ClientActivePokemon;
  opponent?: Player;
  ui?: string;
}>();
const move = computed(() => user.base.gen.moveList[option.move]);
const info = computed(() => {
  const move = user.base.gen.moveList[option.move];
  const battle = manager?.battle;
  const weather = battle?.getWeather();
  const type = user.base.gen.getMoveType(move, user.base, weather);
  const powers: {pokes: Pokemon[]; pow?: number; acc?: number}[] = [];
  const item = user.base.item;
  for (const opp of opponent?.active?.toReversed() ?? []) {
    if (!opp || opp.v.fainted || !battle) {
      continue;
    }

    let power = move.power;
    if (move.kind === "damage" && move.id !== "present" && move.id !== "gyroball") {
      power = battle.gen.getMoveBasePower(move, battle, user, opp);
      power = battle.gen.calc.getBoostedPower({battle, user, target: opp, type, power, move});
    }

    const acc = applyAccuracyModifiers(user.base.gen.getMoveAcc(move, weather), item);
    const other = powers.find(r => r.pow == power && r.acc == acc);
    if (other) {
      other.pokes.push(opp.base);
      continue;
    }

    powers.push({pokes: [opp.base], pow: power, acc});
  }

  return {type, powers} as const;
});
const displayAgainst = computed(() => displayAgainstList.includes(move.value.range));
const targeting = computed(() => targetingMap[move.value.range]);

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
