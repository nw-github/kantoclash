<template>
  <Battle ref="battle" :options :my-id :players :events :chats :finished :format :ready />
</template>

<script setup lang="ts">
import {Battle as BattleEngine, type Options} from "~~/game/battle";
import type {BattleEvent} from "~~/game/events";
import {GENERATIONS} from "~~/game/gen";
import type {BattleRecipe, InfoRecord} from "~~/server/gameServer";

const {battle: battleParams} = defineProps<{battle: BattleRecipe}>();

const players = ref(new Players());
const events = ref<BattleEvent[]>([]);
const options = reactive<Partial<Record<number, Options[]>>>({});
const chats = reactive<InfoRecord>({});
const finished = ref(true);
const format = ref(battleParams.format);
const ready = ref(false);
const myId = "";
const {track: currentTrack} = useBGMusic();

onMounted(() => {
  if (allMusicTracks.length && !currentTrack.value) {
    currentTrack.value = randChoice(allMusicTracks);
  }

  const fmt = formatInfo[battleParams.format];
  const [battle, turn0] = BattleEngine.start({
    gen: GENERATIONS[fmt.generation]!,
    player1: battleParams.player1,
    player2: battleParams.player2,
    doubles: fmt.doubles,
    chooseLead: fmt.chooseLead,
    mods: fmt.mods,
    seed: battleParams.seed,
  });

  events.value = turn0;

  for (const player of [battleParams.player1, battleParams.player2]) {
    players.value.add(player.id, {
      name: `#ID${player.id}`,
      isSpectator: false,
      nPokemon: player.team.length,
      nFainted: 0,
      connected: false,
      active: Array(fmt.doubles ? 2 : 1).fill(undefined),
      teamDesc: player.team,
      team: [],
    });
  }

  choices: for (const seq in battleParams.choices) {
    const choices = battleParams.choices[seq];
    if (+seq !== events.value.length) {
      console.warn(`Got sequence #${seq}, expected ${events.value.length}`);
    }

    for (const [player, choice] of choices) {
      switch (choice.type) {
        case "forfeit":
          events.value.push(...battle.forfeit(battle.findPlayer(player)!, false));
          break choices;
        case "move":
          battle
            .findPlayer(player)!
            .chooseMove(choice.who, battle, choice.moveIndex, choice.target);
          break;
        case "switch":
          battle.findPlayer(player)!.chooseSwitch(choice.who, battle, choice.pokeIndex);
          break;
      }
    }

    const turn = battle.nextTurn();
    if (!turn) {
      console.log("No next turn after choices: ", choices);
    } else {
      events.value.push(...turn);
    }
  }

  if (battleParams.terminated) {
    const loser = battleParams.terminated.timer && battle.findPlayer(battleParams.terminated.timer);
    events.value.push(...(loser ? battle.forfeit(loser, true) : battle.draw("timer")));
  }

  ready.value = true;
});
</script>
