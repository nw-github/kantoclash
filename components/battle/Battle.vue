<template>
  <div
    class="flex h-full flex-col sm:flex-row p-4 overflow-auto rounded-lg gap-4 dark:divide-gray-800 ring-1 ring-gray-200 dark:ring-gray-800 shadow"
  >
    <div class="flex flex-col w-full items-center">
      <div class="flex w-full relative justify-between items-start">
        <div class="flex gap-2 items-center">
          <div
            :class="[!currentTurnNo && 'invisible']"
            class="rounded-md bg-gray-300 dark:bg-gray-700 flex justify-center py-0.5 px-1"
          >
            <span class="text-lg font-medium">Turn {{ currentTurnNo }}</span>
          </div>
          <UTooltip v-if="weather" :text="weatherData[weather].tooltip">
            <UIcon
              class="size-6"
              :class="weatherData[weather].class"
              :name="weatherData[weather].icon"
            />
          </UTooltip>
        </div>

        <div v-if="opponent" class="absolute sm:static right-0 flex flex-col items-end gap-1">
          <span class="text-xs pr-0.5 pb-1 sm:order-1 font-semibold">
            {{ players[opponent].name }}
          </span>
          <TeamDisplay :player="players[opponent]" class="flex-col sm:flex-row" />
        </div>
      </div>

      <div class="flex">
        <template v-for="(player, id) in players" :key="id">
          <ActivePokemon
            v-if="!player.isSpectator"
            ref="activePokemon"
            :class="id === perspective ? 'pt-10 sm:pt-14 pb-2 sm:pb-0' : 'order-2'"
            :base="id === myId ? activeInTeam : undefined"
            :poke="player?.active"
            :side="sides[id]"
            :back="id === perspective"
            :gen
          />
        </template>
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
              :popper="{placement: 'top'}"
            >
              <UButton
                :key="updateMarker"
                class="my-1"
                leading-icon="material-symbols:alarm-outline"
                variant="ghost"
                :color="currentOptions && timeLeft() <= 10 ? 'red' : 'gray'"
                :disabled="!players[myId] || players[myId].isSpectator || !!victor || !!timer"
                :label="timer && !currentOptions ? '--' : timer ? `${Math.max(timeLeft(), 0)}` : ''"
                @click="$emit('timer')"
              />
            </UTooltip>

            <UTooltip text="Open Chat" :popper="{placement: 'top'}" class="min-[900px]:hidden px-2">
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
        <template v-if="currentOptions && !selectionText.length && !isRunningTurn">
          <div class="grid gap-2 sm:grid-cols-[1fr,1.5fr] h-min">
            <div class="flex flex-col gap-1 sm:gap-2">
              <template v-for="(option, i) in currentOptions.moves">
                <MoveButton
                  v-if="option.display"
                  :key="i"
                  :option
                  :gen
                  :poke="activeInTeam"
                  @click="selectMove(i)"
                />
              </template>
              <div v-if="!currentOptions.moves.length && activeIndex === -1">Choose your lead</div>
            </div>

            <div class="grid grid-cols-2 gap-1 sm:gap-2 items-center">
              <SwitchButton
                v-for="(poke, i) in team"
                :key="i"
                :poke
                :disabled="i === activeIndex || !currentOptions.canSwitch"
                :active="i === activeIndex"
                @click="selectSwitch(i)"
              />
            </div>
          </div>
        </template>
        <div v-else-if="currentOptions && !isRunningTurn">
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
            <TooltipButton
              icon="material-symbols:fast-rewind"
              text="First Turn"
              variant="ghost"
              color="gray"
              @click="skipToTurn(0)"
            />
            <TooltipButton
              icon="material-symbols:skip-previous"
              text="Previous Turn"
              variant="ghost"
              color="gray"
              @click="skipToTurn(Math.max(0, currentTurnNo - 1))"
            />
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
              @click="skipToTurn(currentTurnNo + 1)"
            />
            <TooltipButton
              icon="material-symbols:fast-forward"
              text="Skip All"
              variant="ghost"
              color="gray"
              @click="skipToTurn(-1)"
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
import type {Options} from "~/game/battle";
import type {Pokemon} from "~/game/pokemon";
import type {BattleEvent} from "~/game/events";
import type {SpeciesId} from "~/game/species";
import type {BattleTimer, InfoRecord} from "~/server/gameServer";
import type {ActivePokemon} from "#build/components";
import criesSpritesheet from "~/public/effects/cries.json";
import {GENERATIONS} from "~/game/gen";
import type {Weather, Screen} from "~/game/utils";
import type {AnimationParams} from "./ActivePokemon.vue";
import type {AnimationPlaybackControls} from "motion-v";

const weatherData = {
  rain: {icon: "material-symbols:rainy", tooltip: "Raining", class: "text-sky-400"},
  sun: {icon: "material-symbols:clear-day-rounded", tooltip: "Harsh Sun", class: "text-orange-500"},
  sand: {icon: "mingcute:sandstorm-fill", tooltip: "Sandstorm", class: "text-amber-700"},
  // material-symbols:weather-hail
} satisfies Record<Weather, any>;

export type Side = {
  spikes?: boolean;
  screens?: Partial<Record<Screen, boolean>>;
};

const emit = defineEmits<{
  (e: "chat", message: string): void;
  (e: "forfeit" | "timer" | "cancel"): void;
  (e: "move" | "switch", index: number): void;
}>();
const {team, options, players, events, chats, battlers, timer, finished, format} = defineProps<{
  team?: Pokemon[];
  options: Partial<Record<number, Options>>;
  players: Record<string, ClientPlayer>;
  events: BattleEvent[];
  chats: InfoRecord;
  battlers: string[];
  timer?: BattleTimer;
  finished: boolean;
  format: FormatId;
}>();
const myId = useMyId();
const sfxVol = useSfxVolume();
const {fadeOut} = useBGMusic();
const isMounted = useMounted();
const gen = computed(() => GENERATIONS[formatInfo[format].generation]!);
const selectionText = ref("");
const menuButton = ref<HTMLElement>();
const isMenuVisible = useElementVisibility(menuButton);
const unseen = ref(0);
const slideoverOpen = ref(false);
const isRunningTurn = ref(false);
const smoothScroll = ref(true);
const skipToEvent = ref(0);
const updateMarker = ref(0);
const currentTurnNo = ref(0);
const weather = ref<Weather>();
const sides = reactive<Record<string, Side>>({});
const currentOptions = computed(() => (!isRunningTurn.value ? options[events.length] : undefined));

const activePokemon = useTemplateRef<InstanceType<typeof ActivePokemon>[]>("activePokemon");

const activeIndex = ref(-1);
const activeInTeam = computed(() => (isBattler.value ? team?.[activeIndex.value] : undefined));

const victor = ref<string>();
const isBattleOver = computed(() => finished || !!victor.value);
const isBattler = computed(() => battlers.includes(myId.value));
const perspective = ref("");
const opponent = computed(() => battlers.find(v => v != perspective.value) ?? "");
const htmlTurns = ref<UIBattleEvent[][]>([[]]);
const liveEvents = ref<UIBattleEvent[]>([]);
const paused = ref(isBattleOver.value);

const sound = useAudio({
  cries: {src: "/effects/cries.wav", sprites: criesSpritesheet},
  supereffective: {src: "/effects/supereffective.mp3"},
  ineffective: {src: "/effects/ineffective.mp3"},
  neutral: {src: "/effects/neutral.mp3"},
  shiny: {src: "/effects/shiny.mp3"},
});

useIntervalFn(() => {
  liveEvents.value = liveEvents.value.filter(e => Date.now() - e.time < 1400);
}, 400);
useIntervalFn(() => updateMarker.value++, 1000);

watch(
  () => chats,
  () => {
    if (isMenuVisible.value && !slideoverOpen.value) {
      unseen.value++;
    }
  },
);

watchImmediate([battlers, myId], () => {
  if (battlers.includes(myId.value)) {
    perspective.value = myId.value;
  } else {
    perspective.value = randChoice(battlers) ?? "";
  }
});

const selectMove = (index: number) => {
  selectionText.value = `${players[myId.value].active!.name} will use ${
    gen.value.moveList[currentOptions.value!.moves[index].move].name
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

const handleVolatiles = (e: BattleEvent) => {
  if (e.volatiles) {
    for (const {v, id} of e.volatiles) {
      players[id].active!.v = mergeVolatiles(v, players[id].active!.v) as ClientVolatiles;
      if (id === myId.value) {
        activeInTeam.value!.status = players[id].active!.v.status;
      }
    }
  }
};

const animations: AnimationPlaybackControls[] = [];

const runEvent = async (e: BattleEvent) => {
  const isLive = () => skipToEvent.value <= nextEvent.value && isMounted.value;

  const playCry = (speciesId: SpeciesId, pitchDown = false) => {
    if (isLive()) {
      const sprite = gen.value.speciesList[speciesId].dexId.toString().padStart(3, "0");
      return sound.play("cries", {sprite, volume: sfxVol.value, detune: pitchDown ? -350 : 0});
    }
  };

  const playDmg = (eff: number) => {
    if (isLive()) {
      const name = eff > 1 ? "supereffective" : eff < 1 ? "ineffective" : "neutral";
      return sound.play(name, {volume: sfxVol.value});
    }
  };

  const playAnimation = async (id: string, params: AnimationParams) => {
    const isMe = id === perspective.value;
    const component = activePokemon.value!.find(a => a.isBack() === isMe);

    if (!isLive()) {
      params.cb?.();
      params.cb = undefined;
      component?.playAnimation(params)?.complete();
    } else {
      const animation = component!.playAnimation(params);
      animations.push(animation);
      await animation;
      const idx = animations.indexOf(animation);
      if (idx !== -1) {
        animations.splice(idx, 1);
      }
    }
  };

  const pushEvent = (e: RawUIBattleEvent) => {
    const ev = {...e, time: Date.now()} as UIBattleEvent;
    if ("src" in ev) {
      ev[ev.src] = players[ev.src].active!.name;
    }
    if ("target" in ev && ev.target) {
      ev[ev.target] = players[ev.target].active!.name;
    }

    htmlTurns.value.at(-1)!.push(ev);
    if (isLive()) {
      liveEvents.value.push(ev);
    }
  };

  const handleEvent = async (e: BattleEvent) => {
    if (e.type === "switch") {
      const player = players[e.src];
      if (player.active) {
        if (!player.active.fainted && e.why !== "baton_pass") {
          if (e.why !== "phaze") {
            pushEvent({type: "retract", src: e.src, name: player.active.name});
          }
          await playAnimation(e.src, {
            anim: e.why === "phaze" ? "phaze" : "retract",
            batonPass: false,
            name: player.active.name,
          });
        }

        // preload the image
        player.active!.speciesId = e.speciesId;
        player.active!.shiny = e.shiny;
      } else {
        player.active = {
          speciesId: e.speciesId,
          hidden: true,
          v: {stages: {}},
          fainted: true,
          name: "",
          hpPercent: 0,
          level: 100,
        };
      }

      pushEvent(e);

      await playAnimation(e.src, {
        anim: "sendin",
        name: e.name,
        batonPass: e.why === "baton_pass",
        cb() {
          player.active = {...e, v: {stages: {}}, fainted: false};
          if (e.src === myId.value) {
            activeIndex.value = e.indexInTeam;
            activeInTeam.value!.hp = e.hp!;
          }
          handleVolatiles(e);
          playCry(e.speciesId)?.then(() => {
            if (e.shiny) {
              return sound.play("shiny", {volume: sfxVol.value});
            }
          });
        },
      });
      return;
    } else if (e.type === "damage" || e.type === "recover") {
      const update = () => {
        players[e.target].active!.hpPercent = e.hpPercentAfter;

        const ev = e as UIDamageEvent | UIRecoverEvent;
        if (e.target === myId.value) {
          activeInTeam.value!.hp = e.hpAfter!;
          ev.maxHp = activeInTeam.value!.stats.hp;
        }

        if (e.why !== "substitute") {
          handleVolatiles(ev);
        }
        if (e.why !== "explosion" || (e.eff ?? 1) !== 1) {
          pushEvent(ev);
        }
      };

      if (e.type === "damage" && (e.why === "attacked" || e.why === "ohko" || e.why === "trap")) {
        const eff = e.why === "ohko" || !e.eff ? 1 : e.eff;
        await playAnimation(e.src, {
          anim: "attack",
          cb() {
            update();
            playDmg(eff);
          },
        });
      } else {
        update();
        if (e.why === "confusion" || e.why === "sandstorm" || e.why === "future_sight") {
          await playDmg(e.eff ?? 1);
        }
      }

      if (e.why === "substitute") {
        pushEvent({type: "get_sub", src: e.target});
        await playAnimation(e.target, {anim: "get_sub", cb: () => handleVolatiles(e)});
      }
      return;
    } else if (e.type === "info") {
      if (e.why === "faint") {
        playCry(players[e.src].active!.speciesId, true);
        pushEvent(e);
        await playAnimation(e.src, {anim: "faint"});
        if (isLive()) {
          await delay(400);
        }

        players[e.src].active!.fainted = true;
        players[e.src].nFainted++;
        return;
      } else if (e.why === "heal_bell") {
        if (e.src === myId.value && team) {
          team.forEach(poke => (poke.status = undefined));
        }
      } else if (e.why === "spikes") {
        const opp = Object.keys(players).filter(id => id !== e.src && !players[id].isSpectator)[0];
        await playAnimation(opp, {
          anim: "spikes",
          cb: () => {
            sides[e.src] ??= {};
            sides[e.src].spikes = true;
          },
        });
      } else if (e.why === "spin_spikes") {
        sides[e.src] ??= {};
        sides[e.src].spikes = false;
      }
    } else if (e.type === "transform") {
      const target = players[e.target].active!;
      const src = players[e.src].active!;
      src.transformed = target.transformed ?? target.speciesId;
    } else if (e.type === "hit_sub") {
      await playAnimation(e.src, {
        anim: "attack",
        cb() {
          pushEvent(e);
          playDmg(e.eff ?? 1);
        },
      });
      if (e.broken) {
        pushEvent({type: "sub_break", target: e.target});
        await playAnimation(e.target, {anim: "lose_sub", cb: () => handleVolatiles(e)});
      }
      return;
    } else if (e.type === "end") {
      victor.value = e.victor ?? "draw";
    } else if (e.type === "weather") {
      if (e.kind === "start") {
        weather.value = e.weather;
      } else if (e.kind === "end") {
        weather.value = undefined;
      }
    } else if (e.type === "item") {
      if (e.src === myId.value) {
        activeInTeam.value!.item = undefined;
      }
    } else if (e.type === "screen") {
      sides[e.src] ??= {};
      sides[e.src].screens ??= {};
      sides[e.src].screens![e.screen] = e.kind === "start";
    } else if (e.type === "thief") {
      if (e.src === myId.value) {
        activeInTeam.value!.item = e.item;
      }
      if (e.target === myId.value) {
        activeInTeam.value!.item = undefined;
      }
    } else if (e.type === "baton_pass") {
      handleVolatiles(e);
      await playAnimation(e.src, {
        anim: "retract",
        name: players[e.src].active!.name,
        batonPass: true,
      });
      return;
    }

    handleVolatiles(e);
    if (e.type !== "sv") {
      pushEvent(e);
    }
  };

  if (e.type === "next_turn") {
    currentTurnNo.value = e.turn;
    htmlTurns.value.push([]);
    liveEvents.value.length = 0;
    return;
  }

  selectionText.value = "";
  smoothScroll.value = isLive();

  await handleEvent(e);
  if (isLive() && e.type !== "sv") {
    await delay(e.type === "weather" && e.kind === "continue" ? 450 : 250);
  }

  if ((e.type === "end" || e.type === "forfeit") && useAutoMuteMusic().value) {
    fadeOut();
  }
};

const nextEvent = ref(0);
const reset = ref(false);
const shouldUpdate = ref(false);

watch([nextEvent, paused, () => events.length], () => {
  if (!isMounted.value || (!paused.value && nextEvent.value < events.length)) {
    shouldUpdate.value = true;
  }
});

onMounted(async () => {
  while (true) {
    await until(shouldUpdate).toBe(true);
    if (!isMounted.value) {
      return;
    }

    shouldUpdate.value = false;
    if (reset.value) {
      reset.value = false;

      htmlTurns.value = [[]];
      currentTurnNo.value = 0;

      for (const k in players) {
        players[k].nFainted = 0;
        players[k].active = undefined;
      }
    }

    // console.log("playing event ", nextEvent.value);
    const event = events[nextEvent.value];
    const idx = ++nextEvent.value;
    isRunningTurn.value = true;
    await runEvent(event);
    if (idx === events.length) {
      isRunningTurn.value = false;
    }

    const opts = options[idx];
    if (opts && activeInTeam.value) {
      for (const {pp, indexInMoves} of opts.moves) {
        if (indexInMoves !== undefined && pp !== undefined) {
          activeInTeam.value.pp[indexInMoves] = pp;
        }
      }
    }
  }
});

const skipToTurn = (turn: number) => {
  // console.log(`skipTo() | index: ${index} currentTurn: ${currentTurn}`);

  let index = 0;
  if (turn < 0) {
    index = events.length + 1;
  } else if (turn !== 0) {
    index = events.findIndex(event => event.type === "next_turn" && event.turn === turn);
    if (index === -1) {
      index = events.length + 1;
    } else {
      index++;
    }
  }

  // TODO: mute current sounds
  if (index < nextEvent.value) {
    reset.value = true;
    nextEvent.value = 0;
    skipToEvent.value = index;
  } else {
    skipToEvent.value = index;
    liveEvents.value.length = 0;
  }
  animations.forEach(anim => anim.complete());
  animations.length = 0;
};

defineExpose({skipToTurn});
</script>
