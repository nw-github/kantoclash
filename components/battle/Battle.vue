<template>
  <div
    class="flex h-full flex-col sm:flex-row p-4 overflow-auto rounded-lg gap-4 dark:divide-gray-800 ring-1 ring-gray-200 dark:ring-gray-800 shadow"
  >
    <div class="flex flex-col w-full items-center">
      <div class="flex w-full relative justify-between">
        <div>
          <div
            class="rounded-md bg-gray-300 dark:bg-gray-700 flex justify-center py-0.5 px-1"
            :class="[!currentTurnNo && 'invisible']"
          >
            <span class="text-lg font-medium">Turn {{ currentTurnNo }}</span>
          </div>
        </div>

        <div v-if="opponent" class="absolute sm:static right-0 flex flex-col items-end gap-1">
          <span class="text-xs pr-0.5 pb-1 sm:order-1 font-semibold">
            {{ players[opponent].name }}
          </span>
          <TeamDisplay :player="players[opponent]" class="flex-col sm:flex-row" />
        </div>
      </div>

      <div class="flex">
        <ActivePokemon ref="frontPokemon" class="order-2" :poke="players[opponent]?.active" :gen />
        <ActivePokemon
          ref="backPokemon"
          class="pt-10 sm:pt-14 pb-2 sm:pb-0"
          :poke="players[perspective]?.active"
          :base="perspective === myId ? activeInTeam : undefined"
          :gen
          back
        />
      </div>

      <div class="relative w-full">
        <div class="absolute w-full flex flex-col bottom-1 gap-0.5 z-30">
          <TransitionGroup name="list">
            <div
              v-for="e in liveEvents"
              :key="e.time"
              class="w-full bg-gray-300/90 dark:bg-gray-700/95 rounded-lg px-2 pb-0.5"
            >
              <Event class="first:pt-0" :e :my-id :players :perspective :gen />
            </div>
          </TransitionGroup>
        </div>

        <div
          v-if="players[perspective]"
          class="absolute bottom-0 z-0 flex flex-row justify-between w-full p-0.5 items-end"
        >
          <TeamDisplay :player="players[perspective]" class="self-end flex-col sm:flex-row p-2" />

          <div class="flex flex-row">
            <UTooltip
              :text="timer === undefined ? 'Start Timer' : 'Timer is on'"
              :popper="{ placement: 'top' }"
            >
              <UButton
                :key="updateMarker"
                class="my-1"
                leading-icon="material-symbols:alarm-outline"
                variant="ghost"
                :color="options && timeLeft() <= 10 ? 'red' : 'gray'"
                :disabled="!players[myId] || players[myId].isSpectator || !!victor || !!timer"
                :label="timer && !options ? '--' : timer ? `${Math.max(timeLeft(), 0)}` : ''"
                @click="$emit('timer')"
              />
            </UTooltip>

            <UTooltip
              text="Open Chat"
              :popper="{ placement: 'top' }"
              class="min-[900px]:hidden px-2"
            >
              <UChip :show="unseen !== 0" :text="unseen" size="xl">
                <UButton
                  ref="menuButton"
                  icon="material-symbols:chat-outline"
                  variant="link"
                  color="gray"
                  @click="(slideoverOpen = true), (unseen = 0)"
                />
              </UChip>
            </UTooltip>
          </div>
        </div>
      </div>

      <UDivider class="pb-2" />

      <div class="w-full pb-2">
        <template v-if="options && !selectionText.length && !isRunningTurn">
          <div class="grid gap-2 sm:grid-cols-[1fr,1.5fr] h-min">
            <div class="flex flex-col gap-1 sm:gap-2">
              <template v-for="(option, i) in options.moves">
                <MoveButton
                  v-if="option.display"
                  :key="i"
                  :option
                  :gen
                  :poke="activeInTeam"
                  @click="selectMove(i)"
                />
              </template>
              <div v-if="!options.moves.length && activeIndex === -1">Choose your lead</div>
            </div>

            <div class="grid grid-cols-2 gap-1 sm:gap-2 items-center">
              <SwitchButton
                v-for="(poke, i) in team"
                :key="i"
                :poke
                :disabled="i === activeIndex || !options.canSwitch"
                :active="i === activeIndex"
                @click="selectSwitch(i)"
              />
            </div>
          </div>
        </template>
        <div v-else-if="options && !isRunningTurn">
          <div class="italic">{{ selectionText }}...</div>
          <TooltipButton icon="material-symbols:cancel" label="Cancel" @click="cancelMove" />
        </div>
        <div v-else-if="!isBattleOver && isBattler && !isRunningTurn" class="italic">
          Waiting for opponent...
        </div>
        <div v-else class="flex flex-wrap gap-0.5">
          <template v-if="!isBattler || isBattleOver">
            <TooltipButton
              icon="heroicons:home"
              variant="ghost"
              color="gray"
              text="Go Home"
              to="/"
            />
            <TooltipButton
              icon="mi:switch"
              variant="ghost"
              color="gray"
              text="Switch Sides"
              @click="perspective = opponent"
            />
            <!-- <TooltipButton
              icon="material-symbols:fast-rewind"
              text="First Turn"
              variant="ghost"
              color="gray"
              @click="skipTo(0)"
            />
            <TooltipButton
              icon="material-symbols:skip-previous"
              text="Previous Turn"
              variant="ghost"
              color="gray"
              @click="skipTo(turnNoToIndex(currentTurnNo - 1))"
            /> -->
            <TooltipButton
              v-if="isBattleOver"
              :icon="paused ? 'material-symbols:play-arrow' : 'material-symbols:pause'"
              :text="paused ? 'Play' : 'Pause'"
              variant="ghost"
              color="gray"
              @click="paused = !paused"
            />
          </template>
          <template v-if="isBattleOver || isRunningTurn">
            <TooltipButton
              icon="material-symbols:skip-next"
              text="Skip Turn"
              variant="ghost"
              color="gray"
              @click="skipTo(turnNoToIndex(currentTurnNo + 1))"
            />
            <TooltipButton
              icon="material-symbols:fast-forward"
              text="Skip All"
              variant="ghost"
              color="gray"
              @click="skipTo(turns.length)"
            />
          </template>
        </div>
      </div>
    </div>

    <div class="hidden min-[900px]:block h-full w-full">
      <Textbox
        :players
        :chats
        :victor
        :perspective
        :format
        :turns="htmlTurns"
        :smooth-scroll="smoothScroll"
        @chat="message => $emit('chat', message)"
        @forfeit="$emit('forfeit')"
      />
    </div>

    <USlideover v-model="slideoverOpen">
      <Textbox
        :players
        :chats
        :victor
        :perspective
        :format
        :turns="htmlTurns"
        :smooth-scroll="smoothScroll"
        closable
        @chat="message => $emit('chat', message)"
        @forfeit="$emit('forfeit')"
        @close="slideoverOpen = false"
      />
    </USlideover>
  </div>
</template>

<style scoped>
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.list-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.list-leave-active {
  position: relative;
}
</style>

<script setup lang="ts">
import type { Options, Turn } from "~/game/battle";
import type { Pokemon } from "~/game/pokemon";
import type { BattleEvent, InfoReason } from "~/game/events";
import type { SpeciesId } from "~/game/species";
import { clamp } from "~/game/utils";
import type { BattleTimer, InfoRecord } from "~/server/gameServer";
import type { ActivePokemon } from "#build/components";
import type { AnimationType } from "./ActivePokemon.vue";
import criesSpritesheet from "~/public/effects/cries.json";
import { GENERATIONS } from "~/game/gen";

const emit = defineEmits<{
  (e: "chat", message: string): void;
  (e: "forfeit" | "timer" | "cancel"): void;
  (e: "move" | "switch", index: number): void;
}>();
const { team, options, players, turns, chats, battlers, timer, finished, format } = defineProps<{
  team?: Pokemon[];
  options?: Options;
  players: Record<string, ClientPlayer>;
  turns: Turn[];
  chats: InfoRecord;
  battlers: string[];
  timer?: BattleTimer;
  finished: boolean;
  format: FormatId;
}>();
const myId = useMyId();
const sfxVol = useSfxVolume();
const { fadeOut } = useBGMusic();
const isMounted = useMounted();
const gen = computed(() => GENERATIONS[formatInfo[format].generation]!);
const selectionText = ref("");
const menuButton = ref<HTMLElement>();
const isMenuVisible = useElementVisibility(menuButton);
const unseen = ref(0);
const slideoverOpen = ref(false);
const isRunningTurn = ref(false);
const smoothScroll = ref(true);
const skippingToTurn = ref(0);
const updateMarker = ref(0);
const currentTurnNo = ref(0);

const backPokemon = ref<InstanceType<typeof ActivePokemon>>();
const frontPokemon = ref<InstanceType<typeof ActivePokemon>>();

const activeIndex = ref(-1);
const activeInTeam = computed(() => (isBattler.value ? team?.[activeIndex.value] : undefined));

const victor = ref<string>();
const isBattleOver = computed(() => finished || !!victor.value);
const isBattler = computed(() => battlers.includes(myId.value));
const perspective = ref("");
const opponent = computed(() => battlers.find(v => v != perspective.value) ?? "");
const htmlTurns = ref<[UIBattleEvent[], boolean, number][]>([]);
const liveEvents = ref<UIBattleEvent[]>([]);
const paused = ref(isBattleOver.value);

const sound = useAudio({
  cries: { src: "/effects/cries.wav", sprites: criesSpritesheet },
  supereffective: { src: "/effects/supereffective.mp3" },
  ineffective: { src: "/effects/ineffective.mp3" },
  neutral: { src: "/effects/neutral.mp3" },
});

useIntervalFn(() => {
  liveEvents.value = liveEvents.value.filter(e => Date.now() - e.time < 1400);
}, 400);
useIntervalFn(() => updateMarker.value++, 1000);

watch(
  () => options,
  options => {
    if (options && activeInTeam.value) {
      for (const { pp, indexInMoves } of options.moves) {
        if (indexInMoves !== undefined && pp !== undefined) {
          activeInTeam.value.pp[indexInMoves] = pp;
        }
      }
    }
  },
);

watch(
  () => chats,
  () => {
    if (isMenuVisible.value && !slideoverOpen.value) {
      unseen.value++;
    }
  },
);

watch(paused, paused => !paused && onTurnsReceived(Math.max(turns.length - currentTurn, 0)));

watchImmediate([battlers, myId], () => {
  if (battlers.includes(myId.value)) {
    perspective.value = myId.value;
  } else {
    perspective.value = randChoice(battlers) ?? "";
  }
});

watch(perspective, () => {
  const back = players[perspective.value]?.active;
  if (backPokemon.value && back) {
    backPokemon.value.reset(back.hpPercent !== 0);
  }

  const front = players[opponent.value]?.active;
  if (frontPokemon.value && front) {
    frontPokemon.value.reset(front.hpPercent !== 0);
  }
});

const selectMove = (index: number) => {
  selectionText.value = `${players[myId.value].active!.name} will use ${
    gen.value.moveList[options!.moves[index].move].name
  }`;

  emit("move", index);
};

const selectSwitch = (index: number) => {
  if (players[myId.value].active) {
    selectionText.value = `${players[myId.value].active!.name} will be replaced by ${
      team![index].name
    }`;
  } else {
    selectionText.value = `${team![index].name} will be sent out first`;
  }

  emit("switch", index);
};

const cancelMove = () => {
  selectionText.value = "";

  emit("cancel");
};

const timeLeft = () => {
  return timer ? Math.floor((timer.startedAt + timer.duration - Date.now()) / 1000) : 1000;
};

const runTurn = async (live: boolean, turnIdx: number) => {
  const isLive = () => live && skippingToTurn.value <= turnIdx && isMounted.value;

  const playCry = (speciesId: SpeciesId, pitchDown = false) => {
    if (isLive()) {
      const sprite = gen.value.speciesList[speciesId].dexId.toString().padStart(3, "0");
      return sound.play("cries", { sprite, volume: sfxVol.value, detune: pitchDown ? -350 : 0 });
    }
  };

  const playDmg = (eff: number) => {
    if (isLive()) {
      const name = eff > 1 ? "supereffective" : eff < 1 ? "ineffective" : "neutral";
      return sound.play(name, { volume: sfxVol.value });
    }
  };

  const playAnimation = async (id: string, anim: AnimationType, name?: string, cb?: () => void) => {
    const component = id === perspective.value ? backPokemon.value : frontPokemon.value;
    if (!isLive()) {
      if (cb) {
        cb();
      }

      if (anim === "faint" && component) {
        component.reset(false);
      } else if (anim === "sendin" && component) {
        component.reset(true);
      }
    } else if (component) {
      await component.playAnimation(anim, name, cb);
    }
  };

  const pushEvent = (e: RawUIBattleEvent) => {
    const ev = { ...e, time: Date.now() } as UIBattleEvent;
    if ("src" in ev) {
      ev[ev.src] = players[ev.src].active!.name;
    }
    if ("target" in ev) {
      ev[ev.target] = players[ev.target].active!.name;
    }

    htmlTurns.value.at(-1)![0].push(ev);
    if (isLive()) {
      liveEvents.value.push(ev);
    }
  };

  const handleEvent = async (e: BattleEvent) => {
    if (e.type === "switch") {
      const player = players[e.src];
      if (player.active) {
        if (!player.active.fainted) {
          pushEvent({ type: "retract", src: e.src, name: player.active.name });
          await playAnimation(e.src, "retract", player.active.name);
        }

        // preload the image
        player.active!.speciesId = e.speciesId;
      } else {
        player.active = {
          speciesId: e.speciesId,
          hidden: true,
          stages: {},
          flags: {},
          fainted: true,
          name: "",
          hpPercent: 0,
          level: 100,
        };
      }

      pushEvent(e);
      await playAnimation(e.src, "sendin", e.name, () => {
        player.active = { ...e, stages: {}, flags: {}, fainted: false };
        if (e.src === myId.value) {
          if (activeInTeam.value?.status === "tox") {
            activeInTeam.value.status = "psn";
          }

          activeIndex.value = e.indexInTeam;
          activeInTeam.value!.hp = e.hp!;
          player.active.stats = undefined;
        }
        playCry(e.speciesId);
      });
      return;
    } else if (e.type === "damage" || e.type === "recover") {
      const update = () => {
        players[e.target].active!.hpPercent = e.hpPercentAfter;
        players[e.target].active!.fainted = e.dead;

        const ev = e as UIDamageEvent | UIRecoverEvent;
        if (e.target === myId.value) {
          activeInTeam.value!.hp = e.hpAfter!;
          ev.maxHp = activeInTeam.value!.stats.hp;
        }

        if (e.why !== "explosion" || (e.eff ?? 1) !== 1) {
          pushEvent(ev);
        }
      };

      if (e.type === "damage" && (e.why === "attacked" || e.why === "ohko" || e.why === "trap")) {
        const eff = e.why === "ohko" || !e.eff ? 1 : e.eff;
        await playAnimation(e.src, "bodyslam", undefined, () => {
          update();
          playDmg(eff);
        });
      } else {
        update();
        if (e.why === "confusion") {
          await playDmg(e.eff ?? 1);
        }
      }

      if (e.why === "substitute") {
        pushEvent({ type: "get_sub", src: e.target });
        await playAnimation(e.target, "get_sub", undefined, () => {
          players[e.target].active!.flags.substitute = true;
        });
      }

      if (e.dead) {
        if (isLive()) {
          await delay(250);
        }

        playCry(players[e.target].active!.speciesId, true);
        pushEvent({ type: "faint", src: e.target });
        await playAnimation(e.target, "faint");
        if (isLive()) {
          await delay(400);
        }
        players[e.target].nFainted++;
      }

      if (e.why === "rest") {
        players[e.target].active!.status = "slp";
        if (e.target === myId.value) {
          activeInTeam.value!.status = "slp";
        }
      }
      return;
    } else if (e.type === "status") {
      players[e.src].active!.status = e.status;
      if (e.src === myId.value) {
        players[e.src].active!.stats = e.stats;
        activeInTeam.value!.status = e.status;
      }
    } else if (e.type === "stages") {
      if (isBattler.value) {
        players[myId.value].active!.stats = e.stats;
      }

      const active = players[e.src].active!;
      for (const [stat, val] of e.stages) {
        active.stages[stat] = clamp((active.stages[stat] ?? 0) + val, -6, 6);
      }
    } else if (e.type === "transform") {
      const target = players[e.target].active!;
      const src = players[e.src].active!;
      src.transformed = target.transformed ?? target.speciesId;
      src.stages = { ...target.stages };
    } else if (e.type === "info") {
      const enableFlag: Partial<Record<InfoReason, ClientVolatileFlag>> = {
        became_confused: "confused",
        confused: "confused", // thrash, petal dance
        light_screen: "light_screen",
        reflect: "reflect",
        seeded: "seeded",
        focus: "focus",
        mist: "mist",
      };

      if (e.why === "haze") {
        for (const player in players) {
          const active = players[player].active;
          if (!active) {
            continue;
          }

          if (player === e.src && active.status === "tox") {
            active.status = "psn";
            if (player === myId.value) {
              activeInTeam.value!.status = "psn";
            }
          } else if (player !== e.src) {
            active.status = undefined;
            if (player === myId.value) {
              activeInTeam.value!.status = undefined;
            }
          }

          active.stages = {};
          active.flags.confused = false;
          active.flags.reflect = false;
          active.flags.light_screen = false;
          active.flags.focus = false;
          active.flags.mist = false;
          active.flags.seeded = false;
          active.flags.disabled = false;
        }

        if (isBattler.value) {
          players[myId.value].active!.stats = undefined;
        }
      } else if (e.why === "wake" || e.why === "thaw") {
        players[e.src].active!.status = undefined;
        if (e.src === myId.value) {
          activeInTeam.value!.status = undefined;
        }
      } else if (e.why === "disable_end") {
        players[e.src].active!.flags.disabled = false;
      } else if (e.why === "confused_end") {
        players[e.src].active!.flags.confused = false;
      } else if (enableFlag[e.why]) {
        players[e.src].active!.flags[enableFlag[e.why]!] = true;
      } else if (e.why === "paralyze") {
        players[e.src].active!.charging = undefined;
      }
    } else if (e.type === "conversion") {
      players[e.user].active!.conversion = e.types;
    } else if (e.type === "end") {
      victor.value = e.victor ?? "draw";
    } else if (e.type === "hit_sub") {
      await playAnimation(e.src, "bodyslam", undefined, () => {
        pushEvent(e);
        playDmg(e.eff ?? 1);
      });
      if (e.broken) {
        pushEvent({ type: "sub_break", target: e.target });
        await playAnimation(e.target, "lose_sub", undefined, () => {
          players[e.target].active!.flags.substitute = false;
        });
      }
      return;
    } else if (e.type === "disable") {
      players[e.src].active!.flags.disabled = true;
    } else if (e.type === "charge") {
      players[e.src].active!.charging = e.move;
    } else if (e.type === "move") {
      players[e.src].active!.charging = undefined;
    }
    pushEvent(e);
  };

  liveEvents.value.length = 0;
  selectionText.value = "";
  smoothScroll.value = isLive();

  const turn = turns[turnIdx];
  if (!turn.switchTurn) {
    currentTurnNo.value++;
  }

  htmlTurns.value.push([[], turn.switchTurn, currentTurnNo.value]);
  for (const e of turn.events) {
    await handleEvent(e);
    if (isLive()) {
      await delay(250);
    }
  }

  if (isBattleOver.value && turnIdx === turns.length - 1 && useAutoMuteMusic().value) {
    fadeOut();
  }
};

let reconnecting = false;
let currentTurn = 0;
let turnQueue = 0;

const turnNoToIndex = (turn: number) => {
  let index = 0;
  for (let turnNo = -(turn === 1); index < turns.length; index++) {
    if (!turns[index].switchTurn && ++turnNo >= turn) {
      break;
    }
  }
  // console.log(`turnNoToIndex() | Turn NO: ${turn} -> Turn IDX: ${index}`);
  return index;
};

const skipTo = (index: number) => {
  // console.log(`skipTo() | index: ${index} currentTurn: ${currentTurn}`);

  frontPokemon.value!.skipAnimation();
  backPokemon.value!.skipAnimation();
  // TODO: mute current sounds

  if (index < currentTurn) {
    skippingToTurn.value = currentTurn + 1;
    onConnect(index);
  } else {
    skippingToTurn.value = index;
    liveEvents.value.length = 0;
    smoothScroll.value = false;
  }
};

const onTurnsReceived = async (count: number) => {
  // console.log("onTurnsReceived() | count:" + count);
  if (reconnecting) {
    return;
  }

  // hack to make sure turns.value is updated
  await nextTick();

  if (turnQueue) {
    turnQueue += count;
    return;
  }

  turnQueue += count;
  isRunningTurn.value = true;
  while (turnQueue) {
    if (currentTurn >= turns.length || !isMounted.value) {
      turnQueue = 0;
      break;
    }

    await runTurn(true, currentTurn++);
    turnQueue--;

    if (paused.value) {
      turnQueue = 0;
      break;
    }

    if (turnQueue && skippingToTurn.value <= currentTurn - 1 && isBattleOver.value) {
      await delay(200);
    }
  }
  isRunningTurn.value = false;
  smoothScroll.value = true;
};

const onConnect = async (startAt?: number) => {
  // console.log(`onConnect() | startAt=${startAt} currentTurn=${currentTurn}`);
  currentTurn = startAt ?? currentTurn;
  if (reconnecting) {
    return;
  }

  reconnecting = true;
  turnQueue = 0;
  if (isRunningTurn.value) {
    await new Promise(resolve => watchOnce(isRunningTurn, resolve));
  }

  // hack to make sure turns.value is updated
  await nextTick();

  htmlTurns.value.length = 0;
  currentTurnNo.value = 0;
  skippingToTurn.value = 0;
  for (const k in players) {
    players[k].nFainted = 0;
    players[k].active = undefined;
  }

  for (let i = 0; i < currentTurn; i++) {
    await runTurn(false, i);
  }

  reconnecting = false;
  onTurnsReceived(turns.length - currentTurn);
};

defineExpose({ onTurnsReceived, onConnect });
</script>
