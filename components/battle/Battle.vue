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

      <Field ref="field" :players :perspective :is-singles :gen :weather />

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
                :color="currOptions && timeLeft() <= 10 ? 'red' : 'gray'"
                :disabled="
                  !players.get(myId) || players.get(myId).isSpectator || !!victor || !!timer
                "
                :label="timer && !currOptions ? '--' : timer ? `${Math.max(timeLeft(), 0)}` : ''"
                @click="$emit('timer')"
              />
            </UTooltip>

            <UTooltip
              v-if="textBoxHidden"
              text="Open Chat"
              :popper="{placement: 'top'}"
              class="px-2"
            >
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
        <div v-if="team && !playingEvents && isBattler && !isBattleOver">
          <OptionSelector
            :team
            :options="currOptions"
            :players
            :my-id
            :gen
            :opponent
            :weather
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
        :turns="htmlTurns"
        @chat="$emit('chat', $event)"
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
        :turns="htmlTurns"
        closable
        @chat="$emit('chat', $event)"
        @forfeit="$emit('choice', {type: 'forfeit'})"
        @close="slideoverOpen = false"
      />
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type {FormId, Pokemon} from "~/game/pokemon";
import type {BattleEvent, PokeId} from "~/game/events";
import type {SpeciesId} from "~/game/species";
import type {BattleTimer, Choice, InfoRecord} from "~/server/gameServer";
import criesSpritesheet from "~/public/effects/cries.json";
import {GENERATIONS} from "~/game/gen";
import {playerId, type Weather} from "~/game/utils";
import type {AnimationParams} from "./ActivePokemon.vue";
import {AnimatePresence, motion, type AnimationPlaybackControls} from "motion-v";
import type {Options} from "~/game/battle";

const weatherData = {
  rain: {icon: "material-symbols:rainy", tooltip: "Raining", class: "text-sky-400"},
  sun: {icon: "material-symbols:clear-day-rounded", tooltip: "Harsh Sun", class: "text-orange-500"},
  sand: {icon: "mingcute:sandstorm-fill", tooltip: "Sandstorm", class: "text-amber-700"},
  hail: {icon: "material-symbols:weather-hail", tooltip: "Hail", class: ""},
} satisfies Record<Weather, any>;

defineEmits<{
  (e: "chat", message: string): void;
  (e: "timer" | "cancel"): void;
  (e: "choice", choice: Choice): void;
}>();
const {team, options, players, events, chats, timer, finished, format, ready} = defineProps<{
  team?: Pokemon[];
  options: Partial<Record<number, Options[]>>;
  players: Players;
  events: BattleEvent[];
  chats: InfoRecord;
  timer?: BattleTimer;
  finished: bool;
  format: FormatId;
  ready: bool;
}>();
const myId = useMyId();
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

const nextEvent = ref(0);
const playToIndex = ref(0);
const paused = ref(false);
const playingEvents = ref(true);

const victor = ref<string>();
const isBattleOver = computed(() => finished || !!victor.value);
const isBattler = computed(() => players.get(myId.value) && !players.get(myId.value).isSpectator);
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

watchDeep(chats, () => {
  if (isMenuVisible.value && !slideoverOpen.value) {
    unseenChats.value++;
  }
});

const timeLeft = () => {
  return timer ? Math.floor((timer.startedAt + timer.duration - Date.now()) / 1000) : 1000;
};

const animations: AnimationPlaybackControls[] = [];

const updatePerspective = () => {
  perspective.value = isBattler.value
    ? myId.value
    : randChoice(Object.keys(players.items).filter(id => !players.get(id).isSpectator)) ?? "";
};

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

  const playAnimation = async (id: PokeId, params: AnimationParams) => {
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
    }
  };

  const handleVolatiles = (e: BattleEvent) => {
    if (e.volatiles) {
      for (const {v, id} of e.volatiles) {
        const poke = players.poke(id);
        if (!poke) {
          continue;
        }

        poke.v = mergeVolatiles(v, poke.v) as ClientVolatiles;
        if (poke.base) {
          poke.base.status = poke.v.status;
        }
      }
    }
  };

  const pushEvent = (e: RawUIBattleEvent) => {
    const ev = {...e, time: Date.now()} as UIBattleEvent;
    if ("src" in ev) {
      ev[ev.src] = players.poke(ev.src as PokeId)!.name;
    }
    if ("target" in ev && ev.target) {
      ev[ev.target] = players.poke(ev.target as PokeId)!.name;
    }

    htmlTurns.value.at(-1)!.push(ev);
    if (isLive()) {
      liveEvents.value.push(ev);
    }
  };

  const preloadSprite = (
    species: string,
    female?: bool,
    shiny?: bool,
    back?: bool,
    form?: FormId,
  ) => {
    const img = new Image();
    img.src = getSpritePath(species, female, shiny, back, form);
    return img;
  };

  const handleEvent = async (e: BattleEvent) => {
    if (e.type === "switch") {
      const poke = players.poke(e.src);
      let _img;
      if (poke) {
        if (!poke.fainted && e.why !== "baton_pass") {
          if (e.why !== "phaze") {
            pushEvent({type: "retract", src: e.src, name: poke.name});
          }
          await playAnimation(e.src, {
            anim: e.why === "phaze" ? "phaze" : "retract",
            batonPass: false,
            name: poke.name,
          });
        }

        _img = preloadSprite(
          e.speciesId,
          e.gender === "F",
          e.shiny,
          playerId(e.src) === perspective.value,
          e.form,
        );
      } else {
        players.setPoke(e.src, {
          speciesId: e.speciesId,
          hidden: true,
          v: {stages: {}},
          fainted: true,
          name: "",
          hpPercent: 0,
          level: 100,
          indexInTeam: -1,
        });
      }

      pushEvent(e);

      await playAnimation(e.src, {
        anim: "sendin",
        name: e.name,
        batonPass: e.why === "baton_pass",
        cb() {
          const base = e.indexInTeam !== -1 ? team?.[e.indexInTeam] : undefined;
          players.setPoke(e.src, {...e, base, v: {stages: {}}, fainted: false});
          if (base) {
            base.hp = e.hp!;
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
        const target = players.poke(e.target)!;
        target.hpPercent = e.hpPercentAfter;

        const ev = e as UIDamageEvent | UIRecoverEvent;
        if (target.base) {
          target.base.hp = e.hpAfter!;
          ev.maxHp = target.base.stats.hp;
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
          target: e.target,
          cb() {
            update();
            playDmg(eff);
            playAnimation(e.target, {anim: "hurt", direct: true});
          },
        });
      } else {
        update();
        if (
          e.why === "confusion" ||
          e.why === "sand" ||
          e.why === "hail" ||
          e.why === "future_sight"
        ) {
          await Promise.allSettled([
            playDmg(e.eff ?? 1),
            playAnimation(e.src, {anim: "hurt", direct: true}),
          ]);
        }
      }

      if (e.why === "substitute") {
        pushEvent({type: "get_sub", src: e.target});
        await playAnimation(e.target, {anim: "get_sub", cb: () => handleVolatiles(e)});
      }
      return;
    } else if (e.type === "info") {
      if (e.why === "faint") {
        const poke = players.poke(e.src)!;
        playCry(poke.speciesId, true);
        pushEvent(e);
        await playAnimation(e.src, {anim: "faint"});
        if (isLive()) {
          await delay(400);
        }

        poke.fainted = true;
        poke.hidden = true;
        players.byPokeId(e.src).nFainted++;
        handleVolatiles(e);
        return;
      } else if (e.why === "heal_bell") {
        if (playerId(e.src) === myId.value && team) {
          team.forEach(poke => (poke.status = undefined));
        }
      }
    } else if (e.type === "transform") {
      const _img = preloadSprite(
        e.speciesId,
        e.gender === "F",
        e.shiny,
        playerId(e.src) === perspective.value,
        e.form,
      );

      pushEvent(e);

      const src = players.poke(e.src)!;
      await playAnimation(e.src, {
        anim: "transform",
        cb() {
          handleVolatiles(e);
          if (e.target) {
            const target = players.poke(e.target)!;
            src.transformed = target.transformed ?? target.speciesId;
          } else {
            src.speciesId = e.speciesId;
          }
          src.form = e.form;
          src.gender = e.gender;
          src.shiny = e.shiny;
        },
      });
      return;
    } else if (e.type === "hit_sub") {
      if (e.confusion) {
        await Promise.allSettled([
          playDmg(e.eff ?? 1),
          playAnimation(e.src, {anim: "hurt", direct: false}),
        ]);
      } else {
        await playAnimation(e.src, {
          anim: "attack",
          target: e.target,
          cb() {
            pushEvent(e);
            playDmg(e.eff ?? 1);
            playAnimation(e.target, {anim: "hurt", direct: false});
          },
        });
      }
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
      const src = players.poke(e.src)?.base;
      if (src) {
        src.item = undefined;
      }
    } else if (e.type === "screen") {
      players.get(e.user).screens ??= {};
      players.get(e.user).screens![e.screen] = e.kind === "start";
    } else if (e.type === "thief") {
      const src = players.poke(e.src)?.base;
      const target = players.poke(e.target)?.base;
      if (src) {
        src.item = e.item;
      }
      if (target) {
        target.item = undefined;
      }
    } else if (e.type === "trick") {
      const src = players.poke(e.src)?.base;
      const target = players.poke(e.target)?.base;
      if (src) {
        src.item = e.srcItem;
      }
      if (target) {
        target.item = e.targetItem;
      }
    } else if (e.type === "knockoff") {
      const target = players.poke(e.target)?.base;
      if (target) {
        target.itemUnusable = true;
      }
    } else if (e.type === "recycle") {
      const src = players.poke(e.src)?.base;
      if (src) {
        src.item = e.item;
        src.itemUnusable = false;
      }
    } else if (e.type === "baton_pass") {
      handleVolatiles(e);
      await playAnimation(e.src, {
        anim: "retract",
        name: players.poke(e.src)!.name,
        batonPass: true,
      });
      return;
    } else if (e.type === "sketch") {
      const src = players.poke(e.src)?.base;
      if (src) {
        src.moves[src.moves.indexOf("sketch")] = e.move;
      }
    } else if (e.type === "spikes") {
      const player = players.get(e.player);
      if (e.spin) {
        player.spikes = 0;
      } else {
        await playAnimation(e.src, {
          anim: "spikes",
          cb() {
            player.spikes = (player.spikes || 0) + 1;
          },
        });
      }
    } else if (e.type === "skill_swap") {
      const src = players.poke(e.src);
      const target = players.poke(e.target);
      if (src) {
        src.abilityUnknown = true;
      }
      if (target) {
        target.abilityUnknown = true;
      }
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
    if (isLive() && isBattleOver.value) {
      await delay(450);
    }
    return;
  }

  smoothScroll.value = isLive();

  await handleEvent(e);
  if (isLive() && e.type !== "sv" && e.type !== "beatup") {
    await delay(e.type === "weather" && e.kind === "continue" ? 450 : 250);
  }

  if ((e.type === "end" || e.type === "forfeit") && useAutoMuteMusic().value) {
    fadeOut();
  }
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
  skipToEvent.value = index + 1;
  if (paused.value) {
    playToIndex.value = index;
  }

  animations.forEach(anim => anim.complete());
  animations.length = 0;
};

watchImmediate([isBattler, () => players.items, myId], updatePerspective);

watchImmediate([paused, () => events.length], ([paused, nEvents]) => {
  if (!paused) {
    playToIndex.value = nEvents;
  } else {
    playToIndex.value = nextEvent.value;
  }
});

onMounted(async () => {
  await until(() => ready).toBe(true);

  updatePerspective();

  while (isMounted.value) {
    if (nextEvent.value === 0) {
      htmlTurns.value = [[]];
      currentTurnNo.value = 0;
      weather.value = undefined;

      for (const k in players.items) {
        players.items[k].nFainted = 0;
        players.items[k].active = Array(players.items[k].active.length);
        players.items[k].screens = undefined;
        players.items[k].spikes = undefined;
      }
    }

    while (nextEvent.value < playToIndex.value && nextEvent.value < events.length) {
      if (!isMounted.value) {
        return;
      }

      playingEvents.value = true;
      const event = events[nextEvent.value];
      const idx = ++nextEvent.value;
      await runEvent(event);

      for (const opt of options[idx] ?? []) {
        for (const {pp, indexInMoves} of opt.moves) {
          if (indexInMoves !== undefined && pp !== undefined) {
            const poke = players.poke(opt.id)?.base;
            if (poke) {
              poke.pp[indexInMoves] = pp;
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
