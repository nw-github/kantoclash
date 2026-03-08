<template>
  <div
    class="flex h-full p-4 rounded-lg gap-4 dark:divide-gray-800 ring-1 ring-gray-200 dark:ring-gray-800 shadow"
  >
    <div class="flex flex-col w-full items-center overflow-x-hidden overflow-y-auto">
      <!-- Top Bar -->
      <div class="flex w-full relative justify-between items-start">
        <div class="flex gap-2 items-center">
          <div
            :class="[!currentTurnNo && 'invisible order-1']"
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
          <TeamDisplay :player="players.get(opponent)" />
          <span class="text-xs pr-0.5 pb-1 font-semibold">
            {{ players.get(opponent).name }}
          </span>
        </div>
      </div>

      <Field ref="field" :players :perspective :is-singles :weather />

      <div v-if="!ready" class="relative">
        <div class="flex gap-2 top-[50%] left-[50%]">
          <UIcon name="line-md:loading-loop" class="size-6" />
          <span class="text-xl">Loading...</span>
        </div>
      </div>

      <!-- Events & Bottom Bar -->
      <div class="relative w-full">
        <div class="absolute w-full flex flex-col bottom-1 gap-1 z-30 pointer-events-none">
          <AnimatePresence>
            <motion.div
              v-for="e in liveEvents"
              :key="e.time"
              class="w-full bg-gray-300/90 dark:bg-gray-700/95 rounded-lg px-2 pb-0.5"
              :initial="{opacity: 0, y: 20}"
              :animate="{opacity: 1, y: 0}"
              :exit="{opacity: 0, y: -10}"
              :transition="{duration: 0.5, ease: 'easeOut'}"
              layout
            >
              <Event class="first:pt-0" :e :my-id :players :perspective :gen />
            </motion.div>
          </AnimatePresence>
        </div>

        <div
          v-if="players.get(perspective)"
          class="absolute bottom-0 z-0 flex flex-row justify-between w-full p-0.5 items-end"
        >
          <TeamDisplay
            :player="players.get(perspective)"
            class="self-end p-2 invisible sm:visible"
          />

          <div class="flex flex-row my-1 gap-2 px-2">
            <div v-if="localMode" class="flex items-center gap-2">
              <NumericInput v-model="rewindToTurn" :min="0" class="w-12" />
              <TooltipButton
                text="Rewind to Turn"
                :popper="{placement: 'top'}"
                leading-icon="material-symbols:fast-rewind"
                variant="ghost"
                color="gray"
                @click="$emit('rewind', rewindToTurn)"
              />
            </div>

            <TooltipButton
              :key="updateMarker"
              :text="timer === undefined ? 'Start Timer' : 'Timer is on'"
              :popper="{placement: 'top'}"
              leading-icon="material-symbols:alarm-outline"
              variant="ghost"
              :color="currOptions && timeLeft() <= 10 ? 'red' : 'gray'"
              :disabled="!isBattler || isBattleOver || !!timer || localMode"
              :label="timer && !currOptions ? '--' : timer ? `${Math.max(timeLeft(), 0)}` : ''"
              @click="$emit('timer')"
            />

            <UTooltip v-if="textBoxHidden" text="Open Chat" :popper="{placement: 'top'}">
              <UChip :show="unseenChats !== 0" :text="unseenChats" size="xl" inset>
                <UButton
                  ref="menuButton"
                  icon="material-symbols:chat-outline"
                  variant="link"
                  color="gray"
                  @click="(slideoverOpen = true), (unseenChats = 0)"
                />
              </UChip>
            </UTooltip>
          </div>
        </div>
      </div>

      <UDivider class="pb-2" />

      <!-- Selectors & Buttons -->
      <div class="w-full pb-2">
        <div v-if="!playingEvents && isBattler && !isBattleOver">
          <OptionSelector
            :options="currOptions"
            :players
            :my-id
            :opponent
            :weather
            :local-mode
            @cancel="$emit('cancel')"
            @choice="$emit('choice', $event)"
          />
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
              icon="material-symbols:search"
              text="Go to Turn"
              variant="ghost"
              color="gray"
              @click="goToTurnModalOpen = !goToTurnModalOpen"
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
          <template v-if="isBattleOver || playingEvents">
            <TooltipButton
              icon="material-symbols:skip-next"
              text="Skip Turn"
              variant="ghost"
              color="gray"
              :disabled="nextEvent >= events.length && isBattleOver"
              @click="skipToTurn(currentTurnNo + 1)"
            />
            <TooltipButton
              icon="material-symbols:fast-forward"
              text="Skip All"
              variant="ghost"
              color="gray"
              :disabled="nextEvent >= events.length && isBattleOver"
              @click="skipToTurn(-1)"
            />
          </template>
        </div>
        <div v-if="(!isBattler || isBattleOver) && goToTurnModalOpen" class="p-1 flex gap-2 w-40">
          <div class="whitespace-nowrap">Go to turn</div>
          <NumericInput v-model="goToTurn" :min="0" class="w-full" @keydown="goToTurnEnter" />
        </div>
      </div>
    </div>

    <div v-if="!textBoxHidden" class="h-full w-3/5">
      <Textbox
        :players
        :chats
        :victor
        :perspective
        :format
        :smooth-scroll
        :my-id
        :turns="htmlTurns"
        @chat="$emit('chat', $event)"
        @report="$emit('report', $event)"
        @forfeit="$emit('choice', {type: 'forfeit'})"
      />
    </div>

    <USlideover v-model="slideoverOpen">
      <Textbox
        :players
        :chats
        :victor
        :perspective
        :format
        :smooth-scroll
        :my-id
        :turns="htmlTurns"
        closable
        @chat="$emit('chat', $event)"
        @report="$emit('report', $event)"
        @forfeit="$emit('choice', {type: 'forfeit'})"
        @close="slideoverOpen = false"
      />
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type {BattleEvent, PokeId} from "~~/game/events";
import type {BattleTimer, Choice, InfoRecord} from "~~/server/gameServer";
import criesSpritesheet from "~~/public/effects/cries.json";
import {GENERATIONS} from "~~/game/gen";
import {playerId, type Weather} from "~~/game/utils";
import {AnimatePresence, motion, type AnimationPlaybackControls} from "motion-v";
import type {Options} from "~~/game/battle";

const weatherData = {
  rain: {icon: "material-symbols:rainy", tooltip: "Raining", class: "text-sky-400"},
  sun: {icon: "material-symbols:clear-day-rounded", tooltip: "Harsh Sun", class: "text-orange-500"},
  sand: {icon: "mingcute:sandstorm-fill", tooltip: "Sandstorm", class: "text-amber-700"},
  hail: {icon: "material-symbols:weather-hail", tooltip: "Hail", class: ""},
} satisfies Record<Weather, any>;

defineEmits<{
  (e: "chat" | "report", message: string): void;
  (e: "timer" | "cancel"): void;
  (e: "choice", choice: Choice): void;
  (e: "rewind", turn: number): void;
}>();
const {options, players, events, chats, timer, finished, format, ready, myId} = defineProps<{
  options: Partial<Record<number, Options[]>>;
  players: Players;
  events: BattleEvent[];
  chats: InfoRecord;
  timer?: BattleTimer;
  finished: bool;
  format: FormatId;
  ready: bool;
  myId: string;
  localMode?: bool;
}>();
const sfxVol = useSfxVolume();
const {fadeOut} = useBGMusic();
const isMounted = useMounted();
const gen = computed(() => GENERATIONS[formatInfo[format].generation]!);
const menuButton = ref<HTMLElement>();
const isMenuVisible = useElementVisibility(menuButton);
const unseenChats = ref(0);
const slideoverOpen = ref(false);
const smoothScroll = ref(true);
const skipToEvent = ref(0);
const updateMarker = ref(0);
const currentTurnNo = ref(0);
const weather = ref<Weather>();
const field = useTemplateRef("field");

const goToTurnModalOpen = ref(false);
const goToTurn = ref(0);
const rewindToTurn = ref(0);

const nextEvent = ref(0);
const playToIndex = ref(0);
const paused = ref(false);
const playingEvents = ref(true);

const victor = ref<string>();
const isBattleOver = computed(() => finished || !!victor.value);
const isBattler = computed(() => players.get(myId) && !players.get(myId).isSpectator);
const perspective = ref("");
const isSingles = computed(() => players.get(perspective.value)?.active?.length === 1);

const mediaQuery = computed(() => (isSingles.value ? "(max-width: 900px)" : "(max-width: 1100px)"));
const textBoxHidden = useMediaQuery(mediaQuery);

const opponent = computed(() => {
  for (const id in players.items) {
    if (!players.get(id).isSpectator && id !== perspective.value) {
      return id;
    }
  }
  return "";
});
const htmlTurns = ref<UIBattleEvent[][]>([[]]);
const liveEvents = ref<UIBattleEvent[]>([]);

const currOptions = computed(() =>
  !playingEvents.value && !isBattleOver.value ? options[events.length] : undefined,
);

const sound = useAudio({
  cries: {src: "/effects/cries.mp3", sprites: criesSpritesheet},
  supereffective: {src: "/effects/supereffective.mp3"},
  ineffective: {src: "/effects/ineffective.mp3"},
  neutral: {src: "/effects/neutral.mp3"},
  shiny: {src: "/effects/shiny.mp3"},
});

useIntervalFn(() => {
  liveEvents.value = liveEvents.value.filter(e => Date.now() - e.time < 1400);
}, 400);
useIntervalFn(() => updateMarker.value++, 1000);

watchDeep(chats, () => {
  if (isMenuVisible.value && !slideoverOpen.value) {
    unseenChats.value++;
  }
});

const isLive = () => skipToEvent.value < nextEvent.value && isMounted.value;

const clientMgr = new ClientManager({
  playCry(speciesId, pitchDown) {
    if (isLive()) {
      let sprite = gen.value.speciesList[speciesId].dexId.toString();
      if (speciesId === "shayminsky") {
        sprite += "-sky";
      }
      return sound.play("cries", {sprite, volume: sfxVol.value, detune: pitchDown ? -350 : 0});
    }
  },
  playShiny: _id => sound.play("shiny", {volume: sfxVol.value}),
  playDmg(eff) {
    if (isLive()) {
      const name = eff > 1 ? "supereffective" : eff < 1 ? "ineffective" : "neutral";
      return sound.play(name, {volume: sfxVol.value});
    }
  },
  async playAnimation(id, params) {
    if (!isLive()) {
      params.cb?.();
      params.cb = undefined;
      if (params.anim !== "attack" && params.anim !== "spikes" && params.anim !== "transform") {
        field.value?.playAnimation(id, params)?.complete();
      }
    } else {
      const animation = field.value?.playAnimation(id, params);
      if (!animation) {
        params.cb?.();
        console.log("wtf");
        return;
      }

      animations.push(animation);
      await animation;
      const idx = animations.indexOf(animation);
      if (idx !== -1) {
        animations.splice(idx, 1);
      }

      if (isLive() && params.anim === "faint") {
        await delay(400);
      }
    }
  },
  displayEvent(e) {
    const ev = {...e, time: Date.now()} as UIBattleEvent;
    if ("src" in ev) {
      ev[ev.src] = players.poke(ev.src as PokeId)!.base.name;
    }
    if ("target" in ev && ev.target) {
      ev[ev.target] = players.poke(ev.target as PokeId)!.base.name;
    }

    htmlTurns.value.at(-1)!.push(ev);
    if (isLive()) {
      liveEvents.value.push(ev);
    }
  },
  preloadSprite(poke, speciesId, female, shiny, form) {
    const back = playerId(poke) === perspective.value;
    const img = new Image();
    img.src = getSpritePath(speciesId, female, shiny, back, form);
    return img;
  },
});

const goToTurnEnter = (e: KeyboardEvent) => {
  // TODO: Don't do this
  if (e.code === "Enter") {
    skipToTurn(goToTurn.value);
    goToTurnModalOpen.value = false;
    paused.value = true;
  }
};

const timeLeft = () => {
  return timer ? Math.floor((timer.startedAt + timer.duration - Date.now()) / 1000) : 1000;
};

const animations: AnimationPlaybackControls[] = [];

const updatePerspective = () => {
  perspective.value = isBattler.value
    ? myId
    : randChoice(Object.keys(players.items).filter(id => !players.get(id).isSpectator)) ?? "";
};

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
    nextEvent.value = 0;
  }

  liveEvents.value.length = 0;
  skipToEvent.value = index;
  if (paused.value) {
    playToIndex.value = index;
  }

  animations.forEach(anim => anim.complete());
  animations.length = 0;
};

watchImmediate([isBattler, () => players.items, () => myId], updatePerspective);

watchImmediate([paused, () => events.length], ([paused, nEvents]) => {
  if (!paused) {
    playToIndex.value = nEvents;
  } else {
    playToIndex.value = nextEvent.value;
  }
});

onMounted(async () => {
  const runEvent = async (e: BattleEvent) => {
    if (e.type === "next_turn") {
      currentTurnNo.value = e.turn;
      htmlTurns.value.push([]);
      liveEvents.value.length = 0;
      if (isLive() && isBattleOver.value) {
        await delay(450);
      }
      return;
    }

    smoothScroll.value = isLive();

    await clientMgr.handleEvent(e, players, gen.value);

    if (victor.value !== clientMgr.victor) {
      victor.value = clientMgr.victor;
    }

    if (weather.value !== clientMgr.weather) {
      weather.value = clientMgr.weather;
    }

    if (
      isLive() &&
      e.type !== "sv" &&
      e.type !== "beatup" &&
      !(e.type === "info" && e.why === "uturn")
    ) {
      await delay(e.type === "weather" && e.kind === "continue" ? 450 : 250);
    }

    if ((e.type === "end" || e.type === "forfeit") && useAutoMuteMusic().value) {
      fadeOut();
    }
  };

  const reset = () => {
    htmlTurns.value = [[]];
    currentTurnNo.value = 0;
    weather.value = undefined;
    clientMgr.reset(players, gen.value);
  };

  await until(() => ready).toBe(true);

  reset();
  updatePerspective();

  while (isMounted.value) {
    while (
      (nextEvent.value < playToIndex.value || (nextEvent.value === 0 && playToIndex.value === 0)) &&
      nextEvent.value < events.length
    ) {
      if (!isMounted.value) {
        return;
      }

      if (nextEvent.value === 0) {
        reset();
      }

      playingEvents.value = true;
      const event = events[nextEvent.value];
      const idx = ++nextEvent.value;
      await runEvent(event);

      for (const opt of options[idx] ?? []) {
        for (const {pp, indexInMoves} of opt.moves) {
          if (indexInMoves !== undefined && pp !== undefined) {
            const poke = players.poke(opt.id);
            if (poke?.owned) {
              poke.base.pp[indexInMoves] = pp;
            }
          }
        }
      }
    }
    playingEvents.value = false;

    await until([playToIndex, nextEvent, isMounted]).changed();
  }
});

defineExpose({skipToTurn});
</script>
