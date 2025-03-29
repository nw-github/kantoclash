<template>
  <div>
    <div v-if="players.get(myId).active.every(a => !a)" class="pb-2">Choose your lead</div>

    <div v-if="!options || !options.length" class="italic">Waiting for opponent...</div>
    <div v-else-if="choices.length" class="flex flex-col gap-1 pb-2">
      <div
        v-for="([opts, choice], i) in choices"
        :key="i"
        class="italic flex gap-1"
        :class="choices.length === options.length ? 'flex-col' : 'items-center'"
      >
        <div class="italic">{{ choiceMessage(i, choice, opts) }}...</div>
        <TooltipButton
          v-if="i === choices.length - 1"
          icon="material-symbols:cancel"
          label="Cancel"
          @click="cancelMove"
        />
      </div>
    </div>

    <div v-if="currTargets.length">
      <div class="flex gap-1 pb-2 items-center">
        <span>Target who?</span>
        <TooltipButton
          icon="material-symbols:arrow-back-rounded"
          label="Back"
          @click="cancelTarget"
        />
      </div>

      <div class="grid gap-2 grid-cols-2 h-min">
        <TargetButton
          v-for="(poke, i) in players.get(opponent).active"
          :key="i"
          :poke="poke!"
          :disabled="poke!.fainted || !currTargets.includes(`${opponent}:${i}`)"
          :active="false"
          @click="selectTarget(`${opponent}:${i}`)"
        />
        <TargetButton
          v-for="(poke, i) in players.get(myId).active"
          :key="i"
          :poke="poke!"
          :disabled="poke!.fainted || !currTargets.includes(`${myId}:${i}`)"
          :active="true"
          @click="selectTarget(`${myId}:${i}`)"
        />
      </div>
    </div>
    <div v-else-if="currOption" class="grid gap-2 sm:grid-cols-[1fr,1.5fr] h-min">
      <div class="flex flex-col gap-1 sm:gap-2">
        <template v-for="(option, i) in currOption.moves">
          <MoveButton
            v-if="option.display"
            :key="i"
            :option
            :gen
            :poke="players.poke(currOption.id)!.base!"
            @click="selectMove(currOption, i)"
          />
        </template>
      </div>

      <div class="grid grid-cols-2 gap-1 sm:gap-2 items-center">
        <SwitchButton
          v-for="(poke, i) in team"
          :key="i"
          :poke
          :disabled="!currOption.canSwitch || !isValidSwitch(i, poke)"
          :active="players.get(myId).active.some(p => p?.indexInTeam === i)"
          @click="selectSwitch(currOption, i)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {Options} from "~/game/battle";
import type {Pokemon} from "~/game/pokemon";
import type {Choice, MoveChoice} from "~/server/gameServer";
import {Range, type Move} from "~/game/moves";
import type {Generation} from "~/game/gen";
import type {PokeId} from "~/game/events";

const emit = defineEmits<{(e: "choice", choice: Choice): void; (e: "cancel"): void}>();
const {players, myId, options, team, opponent, gen} = defineProps<{
  players: Players;
  myId: string;
  opponent: string;
  gen: Generation;
  options?: Options[];
  team: Pokemon[];
}>();

const choices = ref<[Options, Choice][]>([]);
const currOptionIdx = ref(0);
const currOption = computed(() => options?.[currOptionIdx.value]);
const currMoveChoice = ref<MoveChoice>();
const currTargets = ref<PokeId[]>([]);
const isSingles = computed(() => players.get(myId).active.length === 1);

watch(
  () => options,
  () => {
    choices.value = [];
    currOptionIdx.value = 0;
    currMoveChoice.value = undefined;
    currTargets.value = [];
  },
);

const getTargets = (userIndex: number, move: Move) => {
  type GetTarget = {allyOnly?: bool; oppOnly?: bool; adjacent?: bool; self?: boolean};

  const getTarget = ({allyOnly, oppOnly, adjacent, self}: GetTarget) => {
    const targets: PokeId[] = [];
    const opp = players.get(opponent);
    const me = players.get(myId);
    if (adjacent) {
      for (let i = userIndex - 1; i <= userIndex + 1; i++) {
        if (!allyOnly && opp.active[i]) {
          targets.push(`${opponent}:${i}`);
        }
        if (!oppOnly && me.active[i]) {
          targets.push(`${myId}:${i}`);
        }
      }
    } else {
      targets.push(...me.active.filter(v => !!v).map((_, i) => `${myId}:${i}` as const));
      targets.push(...opp.active.filter(v => !!v).map((_, i) => `${myId}:${i}` as const));
    }

    let idx = targets.indexOf(`${myId}:${userIndex}`);
    if (!self && idx !== -1) {
      targets.splice(idx, 1);
    }
    return targets;
  };

  // prettier-ignore
  switch (move.range) {
  case Range.Field:
  case Range.Random:
  case Range.Self:
  case Range.AllAdjacent:
  case Range.AllAdjacentFoe:
  case Range.All:
  case Range.AllAllies:
    return [];
  case Range.Adjacent:
    return getTarget({ adjacent: true });
  case Range.AdjacentFoe:
    return getTarget({ oppOnly: true, adjacent: true });
  case Range.AdjacentAlly:
    return getTarget({ allyOnly: true, adjacent: true });
  case Range.SelfOrAdjacentAlly:
    return getTarget({ allyOnly: true, adjacent: true, self: true });
  case Range.Any:
    return getTarget({ });
  }
};

const makeChoice = (options: Options, choice: Choice) => {
  choices.value.push([options, choice]);
  currOptionIdx.value++;
  emit("choice", choice);
  currMoveChoice.value = undefined;
  currTargets.value = [];
};

const selectTarget = (target: PokeId) => {
  currMoveChoice.value!.target = target;
  makeChoice(currOption.value!, currMoveChoice.value!);
};

const selectMove = (options: Options, index: number) => {
  const choice = {
    type: "move",
    who: Number(options.id.split(":")[1]),
    moveIndex: index,
    target: `${opponent}:0`,
  } as const;
  const targets = getTargets(choice.who, gen.moveList[options.moves[index].move]);
  if (targets.length > 1) {
    currMoveChoice.value = choice;
    currTargets.value = targets;
    return;
  }

  makeChoice(options, choice);
};

const selectSwitch = (options: Options, index: number) => {
  const choice: Choice = {type: "switch", who: Number(options.id.split(":")[1]), pokeIndex: index};
  choices.value.push([options, choice]);
  currOptionIdx.value++;
  emit("choice", choice);
};

const cancelMove = () => {
  choices.value = [];
  currOptionIdx.value = 0;
  currMoveChoice.value = undefined;
  currTargets.value = [];
  emit("cancel");
};

const cancelTarget = () => {
  currMoveChoice.value = undefined;
  currTargets.value = [];
};

const choiceMessage = (i: number, choice: Choice, options: Options) => {
  const self = players.get(myId);
  if (choice.type === "switch") {
    const active = self.active[choice.who];
    if (active?.base) {
      return `${active.base.name} will be replaced by ${team![choice.pokeIndex].name}`;
    } else {
      return `${team![choice.pokeIndex].name} will be sent out ${i === 0 ? "first" : "second"}`;
    }
  } else if (choice.type === "move") {
    const active = self.active[choice.who];
    const move = options.moves[choice.moveIndex].move;
    return `${active!.name} will use ${gen.moveList[move].name}`;
  }
};

const isValidSwitch = (i: number, poke: Pokemon) => {
  if (players.get(myId).active.some(p => p?.indexInTeam === i)) {
    return false;
  } else if (choices.value.some(([, c]) => c.type === "switch" && c.pokeIndex === i)) {
    return false;
  }
  return !!poke.hp;
};
</script>
