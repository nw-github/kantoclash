<template>
  <Battle
    v-if="loaded"
    ref="battle"
    :options
    :my-id
    :players
    :events
    :chats
    :finished
    :format
    :ready
    :local-mode="true"
    @choice="chosen"
    @rewind="init"
  />
</template>

<script setup lang="ts">
import {Battle as BattleEngine, type Options} from "~~/game/battle";
import type {BattleEvent} from "~~/game/events";
import {GENERATIONS} from "~~/game/gen";
import type {BattleRecipe, Choice, InfoRecord} from "~~/server/gameServer";
import type {Battle} from "#components";

const {recipe: battleParams} = defineProps<{recipe: BattleRecipe}>();

const players = ref(new Players());
const events = ref<BattleEvent[]>([]);
const options = reactive<Partial<Record<number, Options[]>>>({});
const chats = reactive<InfoRecord>({});
const finished = ref(false);
const format = ref(battleParams.format);
const ready = ref(false);
const myId = ref("");
const {track: currentTrack} = useBGMusic();
const battle = ref<InstanceType<typeof Battle>>();
const loaded = ref(true);

let engine: BattleEngine;

onMounted(() => {
  const loadNames = async () => {
    for (const player in players.value.items) {
      try {
        const {name} = await $fetch(`/api/users/${player}`);
        players.value.get(player).name = name;
      } catch {
        continue;
      }
    }
  };

  if (allMusicTracks.length && !currentTrack.value) {
    currentTrack.value = randChoice(allMusicTracks);
  }

  for (const player of [battleParams.player1, battleParams.player2]) {
    players.value.add(player.id, {
      name: `#ID${player.id}`,
      isSpectator: false,
      nPokemon: player.team.length,
      nFainted: 0,
      connected: false,
      active: Array(formatInfo[battleParams.format].doubles ? 2 : 1).fill(undefined),
      teamDesc: player.team,
      team: [],
      admin: false,
    });
  }

  loadNames();

  init(-1);
});

const makeChoice = (playerId: string, choice: Choice) => {
  try {
    const player = engine.findPlayer(playerId)!;
    switch (choice.type) {
      case "forfeit":
        events.value.push(...engine.forfeit(player, false));
        return false;
      case "move":
        if (!player.chooseMove(choice.who, engine, choice.moveIndex, choice.target)) {
          console.log(`Player ${player}: Choice failed: `, choice);
        }
        break;
      case "switch":
        if (!player.chooseSwitch(choice.who, engine, choice.pokeIndex)) {
          console.log(`Player ${player}: Choice failed: `, choice);
        }
        break;
    }
  } catch (ex) {
    console.error("Failure making choice", choice, ":", ex);
  }

  return true;
};

const updateOptions = () => {
  if (!engine.finished) {
    const players = engine.players.filter(pl => !pl.hasChosen());
    // Avoid switching the view if possible
    const next = players.find(pl => pl.id === myId.value) || players[0];
    if (next) {
      myId.value = next.id;
      options[events.value.length] = next.active.map(poke => poke.options).filter(p => !!p);
    }
  }
};

const chosen = (choice: Choice) => {
  if (!makeChoice(myId.value, choice)) {
    return;
  }

  const player = engine.findPlayer(myId.value)!;
  if (player.hasChosen()) {
    if (engine.players.every(p => p.hasChosen())) {
      nextTurn();
    }

    finished.value = engine.finished;
    updateOptions();
  }
};

const nextTurn = () => {
  try {
    const turn = engine.nextTurn();
    if (turn) {
      events.value.push(...turn);
    }
  } catch (ex) {
    console.error("Error on nextTurn():", ex);
  }
};

const init = (turnNo: number) => {
  const fmt = formatInfo[battleParams.format];
  [engine, events.value] = BattleEngine.start({
    gen: GENERATIONS[fmt.generation]!,
    player1: battleParams.player1,
    player2: battleParams.player2,
    doubles: fmt.doubles,
    chooseLead: fmt.chooseLead,
    mods: fmt.mods,
    seed: battleParams.seed,
  });

  choices: for (const seq in battleParams.choices) {
    if (turnNo === 0 || events.value.find(ev => ev.type === "next_turn" && ev.turn === turnNo)) {
      break;
    }

    const choices = battleParams.choices[seq];
    if (+seq !== events.value.length) {
      console.warn(`Got sequence #${seq}, expected ${events.value.length}`);
    }

    for (const [player, choice] of choices) {
      if (!makeChoice(player, choice)) {
        break choices;
      }
    }

    nextTurn();
  }

  if (turnNo === -1 && battleParams.terminated) {
    const loser = battleParams.terminated.timer && engine.findPlayer(battleParams.terminated.timer);
    events.value.push(...(loser ? engine.forfeit(loser, true) : engine.forceEnd("timer")));
  }

  finished.value = engine.finished;
  updateOptions();
  engine.players.forEach(pl => pl.cancel());

  // FIXME: this is a hack but Battle doesn't really take too kindly to certain props being changed
  // after initialization right now.
  loaded.value = false;
  ready.value = false;
  nextTick().then(() => {
    ready.value = loaded.value = true;
    if (turnNo !== -1) {
      nextTick().then(() => {
        battle.value!.skipToTurn(-1);
      });
    }
  });
};
</script>
