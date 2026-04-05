<template>
  <div>
    <div v-if="players.get2(myId).active.every(a => !a.initialized)" class="pb-2">
      Choose your lead
    </div>
    <div v-else-if="currOptionPoke" class="pb-2 flex gap-1 items-center w-[90%]">
      <BoxSprite :species-id="currOptionPoke.base.speciesId" :form="currOptionPoke.base.form" />

      <span v-if="currOptionPoke.v.fainted">
        Choose a Pokémon to replace
        <span v-if="localMode">
          <b>{{ players.get(myId).name }}</b
          >'s
        </span>
        {{ currOptionPoke.base.name }}
      </span>
      <span v-else>
        What will
        <span v-if="localMode">
          <b>{{ players.get(myId).name }}</b
          >'s
        </span>
        {{ currOptionPoke.base.name }} do?
      </span>
    </div>

    <div v-if="!options || !options.length" class="italic">Waiting for opponent...</div>
    <div v-else-if="choices.length" class="flex flex-col gap-1 pb-2">
      <div
        v-for="([opts, choice], i) in choices"
        :key="i"
        class="italic flex gap-1"
        :class="choices.length === options.length ? 'flex-col' : 'items-center'"
      >
        <span class="italic text-xs sm:text-sm">{{ choiceMessage(i, choice, opts) }}...</span>
        <div>
          <TooltipButton
            v-if="i === choices.length - 1"
            icon="material-symbols:cancel"
            label="Cancel"
            @click="cancelMove"
          />
        </div>
      </div>
    </div>

    <div v-if="currTargets">
      <div class="flex gap-1 pb-2 items-center">
        <span>Target whom?</span>
        <TooltipButton
          icon="material-symbols:arrow-back-rounded"
          label="Back"
          @click="cancelTarget"
        />
      </div>

      <div class="grid gap-1 sm:gap-2 grid-cols-2 h-min sm:w-1/2">
        <template v-for="(poke, i) in players.get2(opponent).active.toReversed()" :key="i">
          <SwitchButton
            v-if="poke"
            :popover-disabled="true"
            :poke="poke.base"
            :button-disabled="
              poke.v.fainted ||
              !currTargets.includes(`${opponent}:${players.get2(opponent).active.length - i - 1}`)
            "
            @click="selectTarget(`${opponent}:${players.get2(opponent).active.length - i - 1}`)"
          />
          <div v-else></div>
        </template>
        <template v-for="(poke, i) in players.get2(myId).active" :key="i">
          <SwitchButton
            v-if="poke"
            :popover-disabled="true"
            :active="true"
            :poke="poke.base"
            :button-disabled="poke.v.fainted || !currTargets.includes(`${myId}:${i}`)"
            @click="selectTarget(`${myId}:${i}`)"
          />
          <div v-else></div>
        </template>
      </div>
    </div>
    <div v-else-if="currOption" class="grid gap-2 sm:grid-cols-[1fr_1.5fr] h-min">
      <div class="sm:flex flex-col gap-1 sm:gap-2 grid grid-cols-2">
        <template v-for="(option, i) in currOption.moves">
          <MoveButton
            v-if="option.display && currOptionPoke?.owned"
            :key="i"
            ui="only:col-span-2"
            :option
            :weather
            :user="currOptionPoke"
            :opponent="players.get2(opponent)!"
            @click="selectMove(currOption, i)"
          />
        </template>
      </div>

      <div class="grid grid-cols-2 gap-1 sm:gap-2 h-fit">
        <SwitchButton
          v-for="(poke, i) in team"
          :key="i"
          :poke
          :weather
          :button-disabled="!isValidSwitch(currOption, i)"
          :active="players.get2(myId).active.some(p => p.base === poke && p.initialized)"
          @click="selectSwitch(currOption, i)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {Options} from "~~/game/battle";
import type {Choice, MoveChoice} from "~~/server/gameServer";
import type {PokeId} from "~~/game/events";
import {isSpreadMove, playerId, type Weather} from "~~/game/utils";

const emit = defineEmits<{choice: [Choice]; cancel: []}>();
const {players, myId, options, opponent} = defineProps<{
  players: Players;
  myId: string;
  opponent: string;
  options?: Options[];
  weather?: Weather;
  localMode?: bool;
}>();

const choices = ref<[Options, Choice][]>([]);
const currOptionIdx = ref(0);
const currOption = computed(() => options?.[currOptionIdx.value]);
const currMoveChoice = ref<MoveChoice>();
const currTargets = computed(
  () => currOption.value?.moves[currMoveChoice.value?.moveIndex ?? -1]?.targets,
);
const currOptionPoke = computed(() => currOption.value?.id && players.poke(currOption.value.id));
const team = computed(() => players.get(myId).bp!.team);

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
  const self = players.get2(myId);
  if (choice.type === "switch") {
    const active = self.active[choice.who];
    if (active.initialized) {
      return `${active.base.name} will be replaced by ${team.value[choice.pokeIndex].name}`;
    } else {
      return `${team.value[choice.pokeIndex].name} will be sent out ${
        i === 0 ? "first" : "second"
      }`;
    }
  } else if (choice.type === "move") {
    const opt = options.moves[choice.moveIndex];
    const active = self.active[choice.who]!;
    const move = opt.move;
    const gen = active.base.gen;

    if (opt.targets.length > 1 && choice.target && !isSpreadMove(gen.moveList[move].range)) {
      const ally = playerId(choice.target) === myId ? " ally " : " ";
      return `${active.base.name} will use ${gen.moveList[move].name} on${ally}${
        players.poke(choice.target)!.base.name
      }`;
    } else {
      return `${active.base.name} will use ${gen.moveList[move].name}`;
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
