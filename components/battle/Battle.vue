<template>
  <div
    class="flex h-full flex-col sm:flex-row p-4 overflow-auto rounded-lg dark:divide-gray-800 ring-1 ring-gray-200 dark:ring-gray-800 shadow space-x-4"
  >
    <div class="flex flex-col w-full items-center">
      <div class="flex w-full relative">
        <div
          class="rounded-md bg-gray-300 dark:bg-gray-700 flex justify-center py-0.5 px-1"
          :class="[!currentTurnNo && 'invisible']"
        >
          <span class="text-lg font-medium">Turn {{ currentTurnNo }}</span>
        </div>

        <TeamDisplay
          v-if="opponent"
          :player="players[opponent]"
          class="absolute right-0 flex-col sm:flex-row"
        />
      </div>

      <div class="flex">
        <div class="order-2">
          <ActivePokemon ref="frontPokemon" :poke="players[opponent]?.active" />
        </div>

        <div class="pb-2 sm:pb-0">
          <div class="h-10 sm:h-14" />
          <ActivePokemon
            ref="backPokemon"
            :poke="players[perspective]?.active"
            :base="perspective === myId ? activeInTeam : undefined"
            back
          />
        </div>
      </div>

      <div class="relative w-full z-30">
        <div class="events absolute w-full flex flex-col bottom-1 space-y-0.5">
          <TransitionGroup name="list">
            <div
              v-for="[events, time] in liveEvents"
              :key="time"
              class="events w-full bg-gray-300/90 dark:bg-gray-700/95 rounded-lg"
            >
              <component :is="() => events" />
            </div>
          </TransitionGroup>
        </div>
      </div>

      <div v-if="players[perspective]" class="w-full relative">
        <div class="absolute bottom-0 z-0 flex flex-row justify-between w-full p-0.5 items-end">
          <TeamDisplay :player="players[perspective]" class="self-end flex-col sm:flex-row" />

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
                :color="timeLeft() <= 10 ? 'red' : 'gray'"
                :disabled="!players[myId] || players[myId].isSpectator || !!victor || !!timer"
                :label="timer && !options ? '--' : timer ? `${Math.max(timeLeft(), 0)}` : ''"
                @click="$emit('timer')"
              />
            </UTooltip>

            <div ref="menuDiv" class="min-[900px]:hidden p-2 flex justify-end items-start">
              <UTooltip text="Open Chat" :popper="{ placement: 'top' }">
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
                  :option="option"
                  @click="selectMove(i)"
                />
              </template>
              <div v-if="!options.moves.length && activeIndex === -1">Choose your lead</div>
            </div>

            <div class="grid grid-cols-2 gap-1 sm:gap-2 items-center">
              <SwitchButton
                v-for="(poke, i) in team"
                :key="i"
                :poke="poke"
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
              @click="chosenPerspective = opponent"
            />
            <TooltipButton
              icon="material-symbols:fast-rewind-outline"
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

<style>
@import "@/assets/colors.css";

.events {
  @apply text-sm sm:text-base;

  .red {
    color: var(--stat-down);
    @apply text-xs sm:text-[0.8rem];
  }

  .green {
    color: green;
    @apply text-xs sm:text-[0.8rem];
  }

  > :first-child {
    padding-top: 0;
  }
}
</style>

<script setup lang="ts">
import type { Options, Turn } from "@/game/battle";
import type { Pokemon, Status } from "@/game/pokemon";
import type { BattleEvent, InfoReason } from "@/game/events";
import { speciesList, type SpeciesId } from "@/game/species";
import { clamp, hpPercentExact } from "@/game/utils";
import { moveList, type MoveId } from "@/game/moveList";
import { stageTable, type VNode } from "#imports";
import type { ClientVolatileFlag } from "~/utils";
import type { BattleTimer, InfoRecord } from "~/server/gameServer";
import type { ActivePokemon } from "#build/components";
import type { AnimationType } from "./ActivePokemon.vue";

const emit = defineEmits<{
  (e: "chat", message: string): void;
  (e: "forfeit" | "timer" | "cancel"): void;
  (e: "move" | "switch", index: number): void;
}>();
const { team, options, players, turns, chats, battlers, timer, finished } = defineProps<{
  team?: Pokemon[];
  options?: Options;
  players: Record<string, ClientPlayer>;
  turns: Turn[];
  chats: InfoRecord;
  battlers: string[];
  timer?: BattleTimer;
  finished: boolean;
}>();
const myId = useMyId();
const sfxVol = useSfxVolume();
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
const paused = ref(false);

const backPokemon = ref<InstanceType<typeof ActivePokemon>>();
const frontPokemon = ref<InstanceType<typeof ActivePokemon>>();

const activeIndex = ref(-1);
const activeInTeam = computed(() => (isBattler.value ? team?.[activeIndex.value] : undefined));

const isBattleOver = computed(() => finished || !!victor.value);
const isBattler = computed(() => battlers.includes(myId.value));
const chosenPerspective = ref("");
const perspective = computed(() => (isBattler.value ? myId.value : chosenPerspective.value));
const opponent = computed(() => battlers.find(v => v != perspective.value) ?? "");
const victor = ref<string>();
const htmlTurns = ref<[VNode[], boolean, number][]>([]);
const liveEvents = ref<[VNode[], number][]>([]);

const savedAudio: Record<string, AudioBuffer> = {};
let audioContext: AudioContext | undefined;

onMounted(() => (audioContext = new AudioContext()));
onUnmounted(() => audioContext && audioContext.close(), (audioContext = undefined));

useIntervalFn(() => {
  liveEvents.value = liveEvents.value.filter(ev => Date.now() - ev[1] < 1400);
}, 400);
useIntervalFn(() => updateMarker.value++, 1000);

watch(
  () => options,
  options => {
    if (options && players[myId.value]?.active && !players[myId.value].active?.transformed) {
      for (const { pp, indexInMoves } of options.moves) {
        if (indexInMoves !== undefined && pp !== undefined) {
          activeInTeam.value!.pp[indexInMoves] = pp;
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

watch(perspective, () => {
  liveEvents.value.length = 0;
  onConnect();
});

watch(paused, paused => !paused && onTurnsReceived(Math.max(turns.length - currentTurn, 0)));

watchImmediate(battlers, () => (chosenPerspective.value = randChoice(battlers)));

const selectMove = (index: number) => {
  selectionText.value = `${players[myId.value].active!.name} will use ${
    moveList[options!.moves[index].move].name
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

const runTurn = async (live: boolean, turnNo: number) => {
  const isLive = () => live && skippingToTurn.value <= turnNo;

  const playSound = async (path: string, pitchDown = false) => {
    if (!isLive() || !audioContext) {
      return;
    }

    if (!savedAudio[path]) {
      const sound = await $fetch<Blob>(path, { method: "GET" });
      savedAudio[path] = await audioContext.decodeAudioData(await sound.arrayBuffer());
    }
    const source = audioContext.createBufferSource();
    source.buffer = savedAudio[path];

    const gain = audioContext.createGain();
    gain.gain.value = sfxVol.value;
    gain.connect(audioContext.destination);

    source.connect(gain);
    source.detune.value = pitchDown ? -350 : 0;
    return new Promise(resolve => {
      source.onended = resolve;
      source.start();
    });
  };

  const playCry = (speciesId: SpeciesId, pitchDown = false) => {
    const track = speciesList[speciesId].dexId.toString().padStart(3, "0");
    return playSound(`/effects/cries/${track}.wav`, pitchDown);
  };

  const playDmg = (eff: number) => {
    const track = eff > 1 ? "supereffective" : eff < 1 ? "ineffective" : "neutral";
    return playSound(`/effects/${track}.mp3`);
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
      return;
    }

    if (component) {
      await component.playAnimation(anim, name, cb);
    }
  };

  const pushHtml = (src: VNode[], count?: number) => {
    const html = src.splice(0, count ?? src.length);
    if (html.length) {
      htmlTurns.value.at(-1)![0].push(...html);
      if (isLive()) {
        liveEvents.value.push([html, Date.now()]);
      }
    }
  };

  const handleEvent = async (e: BattleEvent) => {
    const html = htmlForEvent(e);

    if (e.type === "switch") {
      const player = players[e.src];
      if (player.active) {
        if (!player.active.fainted) {
          pushHtml(html, 1);
          await playAnimation(e.src, "retract", player.active.name);
        }

        // preload the image
        player.active!.speciesId = e.speciesId;
      }

      pushHtml(html);
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
    } else if (e.type === "damage" || e.type === "recover") {
      const update = () => {
        players[e.target].active!.hpPercent = e.hpPercentAfter;
        players[e.target].active!.fainted = e.dead;
        if (e.target === myId.value) {
          activeInTeam.value!.hp = e.hpAfter!;
        }
        pushHtml(html, e.dead ? html.length - 1 : html.length);
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
        await playAnimation(e.target, "get_sub", undefined, () => {
          players[e.target].active!.flags.substitute = true;
        });
      }

      if (e.dead) {
        if (isLive()) {
          await delay(250);

          playCry(players[e.target].active!.speciesId, true);
          pushHtml(html);
          await playAnimation(e.target, "faint");
          if (isLive()) {
            await delay(400);
          }
        }
        players[e.target].nFainted++;
      }

      if (e.why === "rest") {
        players[e.target].active!.status = "slp";
        if (e.target === myId.value) {
          activeInTeam.value!.status = "slp";
        }
      }
    } else if (e.type === "status") {
      players[e.id].active!.status = e.status;
      if (e.id === myId.value) {
        players[e.id].active!.stats = e.stats;
        activeInTeam.value!.status = e.status;
      }
    } else if (e.type === "stages") {
      if (isBattler.value) {
        players[myId.value].active!.stats = e.stats;
      }

      const active = players[e.id].active!;
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

          if (player === e.id && active.status === "tox") {
            active.status = "psn";
            if (player === myId.value) {
              activeInTeam.value!.status = "psn";
            }
          } else if (player !== e.id) {
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
        players[e.id].active!.status = undefined;
      } else if (e.why === "disable_end") {
        players[e.id].active!.flags.disabled = false;
      } else if (e.why === "confused_end") {
        players[e.id].active!.flags.confused = false;
      } else if (enableFlag[e.why]) {
        players[e.id].active!.flags[enableFlag[e.why]!] = true;
      } else if (e.why === "paralyze") {
        players[e.id].active!.charging = undefined;
      }
    } else if (e.type === "conversion") {
      players[e.user].active!.conversion = e.types;
    } else if (e.type === "victory") {
      victor.value = e.id;
    } else if (e.type === "hit_sub") {
      await playAnimation(e.src, "bodyslam", undefined, () => {
        pushHtml(html, 1);
        playDmg(e.eff ?? 1);
      });
      if (e.broken) {
        pushHtml(html);
        await playAnimation(e.target, "lose_sub", undefined, () => {
          players[e.target].active!.flags.substitute = false;
        });
      }
    } else if (e.type === "disable") {
      players[e.id].active!.flags.disabled = true;
    } else if (e.type === "charge") {
      players[e.id].active!.charging = e.move;
    } else if (e.type === "move") {
      players[e.src].active!.charging = undefined;
    }

    pushHtml(html);
    if (isLive()) {
      await delay(250);
    }
  };

  liveEvents.value.length = 0;
  selectionText.value = "";
  smoothScroll.value = isLive();

  const turn = turns[turnNo];
  if (!turn.switchTurn) {
    currentTurnNo.value++;
  }

  htmlTurns.value.push([[], turn.switchTurn, currentTurnNo.value]);
  for (const e of turn.events) {
    await handleEvent(e);
  }
};

const htmlForEvent = (e: BattleEvent) => {
  const text = (s: any, clazz: string = "") => h("p", { class: clazz }, s);
  const bold = (s: any) => h("b", s);
  const italic = (s: any) => h("i", s);
  const pname = (id: string, title = true) => {
    if (id === perspective.value) {
      return players[id].active!.name;
    } else if (title) {
      return `The opposing ${players[id].active!.name}`;
    } else {
      return `the opposing ${players[id].active!.name}`;
    }
  };

  const res: Array<VNode> = [];
  if (e.type === "switch") {
    const player = players[e.src];
    if (player.active && !player.active.fainted) {
      if (e.src === perspective.value) {
        res.push(text(`Come back! ${player.active.name}!`, "switch"));
      } else {
        res.push(text(`${player.name} withdrew ${player.active.name}!`, "switch"));
      }
    }

    if (e.src === perspective.value) {
      res.push(text(["Go! ", bold(`${e.name}`), "!"], "switch"));
    } else {
      res.push(text([`${player.name} sent in `, bold(`${e.name}`), "!"], "switch"));
    }
  } else if (e.type === "damage" || e.type === "recover") {
    const src = pname(e.src);
    const target = pname(e.target);

    let pv = Math.abs(e.hpPercentBefore - e.hpPercentAfter);
    if (e.target === myId.value) {
      const maxHp = activeInTeam.value!.stats.hp;
      pv = roundTo(Math.abs(hpPercentExact(e.hpBefore! - e.hpAfter!, maxHp)), 1);
    }
    const percent = pv === 0 ? "<1%" : `${pv}%`;

    if (e.type === "damage") {
      const effMsg = `It's ${(e.eff ?? 1) > 1 ? "super effective!" : "not very effective..."}`;
      if (e.why === "recoil") {
        res.push(text(`${src} was hurt by recoil!`));
      } else if (e.why === "crash") {
        res.push(text(`${src} kept going and crashed!`));
      } else if (e.why === "seeded") {
        res.push(text(`${src}'s health was sapped by Leech Seed!`));
      } else if (e.why === "psn") {
        res.push(text(`${src} is hurt by poison!`));
      } else if (e.why === "brn") {
        res.push(text(`${src} is hurt by its burn!`));
      } else if (e.why === "attacked" && e.isCrit) {
        res.push(text("A critical hit!"));
      } else if (e.why === "confusion") {
        res.push(text("It hurt itself in its confusion!"));
      } else if (e.why === "ohko") {
        res.push(text("It's a one-hit KO!"));
      } else if (e.why === "trap") {
        res.push(text(`${src}'s attack continues!`));
      }

      if (e.why === "attacked" && e.hitCount === undefined && (e.eff ?? 1) !== 1) {
        res.push(italic(effMsg));
      }

      if (e.why !== "explosion") {
        res.push(text([`${target} lost `, bold(percent), " of its health."], "red"));
      }

      if (e.why === "substitute") {
        res.push(text(`${src} put in a substitute!`));
      }

      if ((e.hitCount ?? 0) > 0) {
        if (e.eff !== 1) {
          res.push(italic(effMsg));
        }
        res.push(text(`Hit ${e.hitCount} time(s)!`));
      }

      if (e.dead) {
        res.push(text(`${target} fainted!`));
      }
    } else {
      if (e.why === "drain") {
        res.push(text(`${src} had its energy drained!`));
      } else if (e.why === "recover") {
        res.push(text(`${src} regained health!`));
      } else if (e.why === "rest") {
        res.push(text(`${src} started sleeping!`));
      }

      res.push(text([`${target} gained `, bold(percent), " of its health."], "green"));
    }
  } else if (e.type === "move") {
    if (e.thrashing && e.move !== "rage") {
      res.push(text(`${pname(e.src)}'s thrashing about!`, "move"));
    } else if (e.disabled) {
      res.push(text(`${pname(e.src)}'s ${moveList[e.move].name} is disabled!`, "move"));
    } else {
      res.push(text([`${pname(e.src)} used `, bold(moveList[e.move].name), "!"], "move"));
    }
  } else if (e.type === "victory") {
    if (e.id === myId.value) {
      res.push(text("You win!"));
    } else {
      res.push(text(`${players[e.id].name} wins!`));
    }
  } else if (e.type === "hit_sub") {
    if (e.confusion) {
      res.push(text("It hurt itself in its confusion!"));
    }

    const eff = e.eff ?? 1;
    if (eff !== 1) {
      res.push(italic(`It's ${(e.eff ?? 1) > 1 ? "super effective!" : "not very effective..."}`));
    }

    const target = pname(e.target);
    res.push(text(`${target}'s substitute took the hit!`));
    if (e.broken) {
      res.push(text(`${target}'s substitute broke!`));
    }
  } else if (e.type === "status") {
    const table: Record<Status, string> = {
      psn: "was poisoned",
      par: "was paralyzed",
      slp: "fell asleep",
      frz: "was frozen solid",
      tox: "was badly poisoned",
      brn: "was burned",
    };

    res.push(text(`${pname(e.id)} ${table[e.status]}!`));
  } else if (e.type === "stages") {
    const name = pname(e.id);
    for (const [stage, amount] of e.stages) {
      res.push(
        text(
          `${name}'s ${stageTable[stage]} ${amount > 0 ? "rose" : "fell"}${
            Math.abs(amount) > 1 ? " sharply" : ""
          }!`,
        ),
      );
    }
  } else if (e.type === "info") {
    const messages: Record<InfoReason, string> = {
      immune: "It doesn't affect {l}...",
      miss: "{} missed!",
      cant_substitute: "{} doesn't have enough HP to create a substitute!",
      has_substitute: "{} already has a substitute!",
      fail_generic: "But it failed!",
      whirlwind: "But it failed!",
      flinch: "{} flinched!",
      splash: "No effect!",
      seeded: "{} was seeded!",
      mist_protect: "{} is protected by the mist!",
      mist: "{}'s shrouded in mist!",
      light_screen: "{}'s protected against special attacks!",
      reflect: "{} is gained armor!",
      focus: "{} is getting pumped!",
      payday: "Coins scattered everywhere!",
      became_confused: "{} became confused!",
      confused: "{} is confused!",
      confused_end: "{}'s confused no more!",
      recharge: "{} must recharge!",
      frozen: "{} is frozen solid!",
      sleep: "{} is fast asleep!",
      wake: "{} woke up!",
      haze: "All status changes were removed!",
      thaw: "{} thawed out!",
      paralyze: "{}'s fully paralyzed!",
      rage: "{}'s rage is building!",
      disable_end: "{}'s disabled no more!",
      bide: "{} unleashed energy!",
      trapped: "{} can't move!",
      forfeit: "{} forfeit the match.",
      forfeit_timer: "{} ran out of time.",
    };

    if (e.why === "forfeit" || e.why === "forfeit_timer") {
      res.push(text(messages[e.why].replace("{}", players[e.id].name)));
    } else {
      const clazz: Partial<Record<InfoReason, string>> = {
        confused: "confused",
        sleep: "move",
        disable_end: "move",
        wake: "move",
      };
      res.push(
        text(
          messages[e.why].replace("{}", pname(e.id)).replace("{l}", pname(e.id, false)),
          clazz[e.why],
        ),
      );
    }
  } else if (e.type === "transform") {
    res.push(text(`${pname(e.src)} transformed into ${pname(e.target, false)}!`));
  } else if (e.type === "disable") {
    res.push(text(`${pname(e.id)}'s ${moveList[e.move].name} was disabled!`));
  } else if (e.type === "charge") {
    const chargeMessage: Partial<Record<MoveId, string>> = {
      skullbash: "{} lowered its head!",
      razorwind: "{} made a whirlwind!",
      skyattack: "{} is glowing!",
      solarbeam: "{} took in sunlight!",
      dig: "{} dug a hole!",
      fly: "{} flew up high!",
    };

    const msg = chargeMessage[e.move];
    if (msg) {
      res.push(text(msg.replace("{}", pname(e.id))));
    }
  } else if (e.type === "mimic") {
    res.push(text(`${pname(e.id)} learned ${moveList[e.move].name}!`));
  } else if (e.type === "conversion") {
    res.push(text(`Converted type to match ${pname(e.target, false)}!`));
  } else {
    res.push(text(JSON.stringify(e)));
  }

  return res;
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
  console.log(`turnNoToIndex() | Turn NO: ${turn} -> Turn IDX: ${index}`);
  return index;
};

const skipTo = (index: number) => {
  console.log(`skipTo() | index: ${index} currentTurn: ${currentTurn}`);

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
  console.log("onTurnsReceived() | count:" + count);
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
    if (currentTurn >= turns.length) {
      turnQueue = 0;
      break;
    }

    await runTurn(true, currentTurn++);
    turnQueue--;

    if (paused.value) {
      turnQueue = 0;
      break;
    }
  }
  isRunningTurn.value = false;
  smoothScroll.value = true;
};

const onConnect = async (startAt?: number) => {
  console.log(`onConnect() | startAt=${startAt} currentTurn=${currentTurn}`);
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

  isRunningTurn.value = true;
  for (let i = 0; i < currentTurn; i++) {
    await runTurn(false, i);
  }
  isRunningTurn.value = false;

  reconnecting = false;
  onTurnsReceived(turns.length - currentTurn);
};

defineExpose({ onTurnsReceived, onConnect });
</script>
