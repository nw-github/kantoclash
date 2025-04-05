<template>
  <div>
    <div v-if="players.get(myId).active.every(a => !a)" class="pb-2">Choose your lead</div>
    <div v-else-if="currOption && options!.length > 1" class="pb-2 flex gap-1 items-center">
      <BoxSprite :species="players.poke(currOption.id)!.speciesId" />
      What will {{ players.poke(currOption.id)!.name }} do?
    </div>

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

    <div v-if="currTargets">
      <div class="flex gap-1 pb-2 items-center">
        <span>Target who?</span>
        <TooltipButton
          icon="material-symbols:arrow-back-rounded"
          label="Back"
          @click="cancelTarget"
        />
      </div>

      <div class="grid gap-2 grid-cols-2 h-min sm:w-1/2">
        <template v-for="(poke, i) in players.get(opponent).active" :key="i">
          <TargetButton
            v-if="poke"
            :poke
            :disabled="poke.fainted || !currTargets.includes(`${opponent}:${i}`)"
            :active="false"
            @click="selectTarget(`${opponent}:${i}`)"
          />
        </template>
        <template v-for="(poke, i) in players.get(myId).active" :key="i">
          <TargetButton
            v-if="poke"
            :poke
            :disabled="poke.fainted || !currTargets.includes(`${myId}:${i}`)"
            :active="true"
            @click="selectTarget(`${myId}:${i}`)"
          />
        </template>
      </div>
    </div>
    <div v-else-if="currOption" class="grid gap-2 sm:grid-cols-[1fr,1.5fr] h-min">
      <div class="flex flex-col gap-1 sm:gap-2">
        <template v-for="(option, i) in currOption.moves">
          <MoveButton
            v-if="option.display && players.poke(currOption.id)?.base"
            :key="i"
            :option
            :gen
            :poke="players.poke(currOption.id)!"
            @click="selectMove(currOption, i)"
          />
        </template>
      </div>

      <div class="grid grid-cols-2 gap-1 sm:gap-2 items-center">
        <SwitchButton
          v-for="(poke, i) in team"
          :key="i"
          :poke
          :disabled="!isValidSwitch(currOption, i)"
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
import type {Generation} from "~/game/gen";
import type {PokeId} from "~/game/events";
import {playerId} from "~/game/utils";
import {isSpreadMove} from "~/game/moves";

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
const currTargets = computed(
  () => currOption.value?.moves[currMoveChoice.value?.moveIndex ?? -1]?.targets,
);

watch(
  () => options,
  () => {
    choices.value = [];
    currOptionIdx.value = 0;
    currMoveChoice.value = undefined;
  },
);

const makeChoice = (options: Options, choice: Choice) => {
  choices.value.push([options, choice]);
  currOptionIdx.value++;
  emit("choice", choice);
  currMoveChoice.value = undefined;
};

const selectTarget = (target: PokeId) => {
  currMoveChoice.value!.target = target;
  makeChoice(currOption.value!, currMoveChoice.value!);
};

const selectMove = (options: Options, index: number) => {
  const who = Number(options.id.split(":")[1]);
  const targets = options.moves[index].targets;
  const choice = {type: "move", who, moveIndex: index, target: targets[0]} as const;
  if (targets.length > 1) {
    currMoveChoice.value = choice;
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
  emit("cancel");
};

const cancelTarget = () => {
  currMoveChoice.value = undefined;
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
    const opt = options.moves[choice.moveIndex];
    const active = self.active[choice.who];
    const move = opt.move;

    if (opt.targets.length > 1 && choice.target && !isSpreadMove(gen.moveList[move].range)) {
      const ally = playerId(choice.target) === myId ? " ally " : " ";
      return `${active!.name} will use ${gen.moveList[move].name} on${ally}${
        players.poke(choice.target)!.name
      }`;
    } else {
      return `${active!.name} will use ${gen.moveList[move].name}`;
    }
  }
};

const isValidSwitch = (options: Options, i: number) => {
  return (
    options.switches.includes(i) &&
    !choices.value.some(([, c]) => c.type === "switch" && c.pokeIndex === i)
  );
};
</script>
