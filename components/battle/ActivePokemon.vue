<template>
  <div class="all w-full flex flex-col items-center">
    <div
      class="flex flex-col gap-0.5 sm:gap-1 text-sm z-40"
      :class="[(!poke || poke.hidden) && 'invisible', !isSingles ? 'w-16 sm:w-32' : 'w-28 sm:w-40']"
    >
      <div class="flex justify-between flex-col sm:flex-row">
        <div class="font-bold flex items-center grow overflow-hidden">
          <span class="truncate text-xs">{{ poke?.name || "--" }}</span>
          <!-- @vue-expect-error -->
          <GenderIcon
            class="size-4 hidden sm:block"
            :gender="gen1Gender[poke?.speciesId] ?? poke?.gender"
          />
        </div>
        <div class="flex items-center">
          <span class="text-[0.65rem] sm:text-xs whitespace-nowrap">
            Lv. {{ poke?.level ?? 100 }}
          </span>
          <!-- @vue-expect-error -->
          <GenderIcon
            class="size-4 sm:hidden"
            :gender="gen1Gender[poke?.speciesId] ?? poke?.gender"
          />
        </div>
      </div>
      <div class="relative overflow-hidden rounded-md bg-[#333] flex">
        <div class="hp-fill absolute h-full rounded-md" />
        <div class="w-full text-center text-gray-100 text-xs font-medium z-30">{{ hp }}%</div>
      </div>
      <div class="relative">
        <div
          v-if="poke"
          class="flex gap-1 flex-wrap absolute *:px-[0.2rem] *:py-[0.1rem] *:text-[0.6rem] sm:*:text-xs"
        >
          <UBadge v-if="poke.transformed" color="black" label="Transformed" variant="subtle" />

          <UBadge
            v-if="poke.v.status"
            :color="statusColor[poke.v.status]"
            :label="poke.v.status.toUpperCase()"
          />

          <template v-if="!species!.types.every((ty, i) => ty === poke.v.types?.[i])">
            <TypeBadge v-for="type in poke.v.types" :key="type" :type />
          </template>

          <TypeBadge
            v-if="poke.v.charging"
            :type="gen.moveList[poke.v.charging].type"
            :label="gen.moveList[poke.v.charging].name"
          />

          <UBadge
            v-if="poke.v.trapped"
            color="red"
            icon="tabler:prison"
            :label="gen.moveList[poke.v.trapped].name"
            variant="subtle"
          />

          <UBadge
            v-if="poke.v.perishCount"
            color="red"
            icon="material-symbols:skull"
            :label="poke.v.perishCount"
            variant="subtle"
          />

          <UBadge
            v-if="poke.v.stockpile"
            color="green"
            icon="material-symbols-light:money-bag"
            :label="poke.v.stockpile"
            variant="subtle"
          />

          <template v-for="{flag, props} in badges">
            <UBadge v-if="((poke.v.flags ?? 0) & flag) !== 0" :key="flag" v-bind="props" />
          </template>

          <template v-for="(val, stage) in poke.v.stages">
            <UBadge v-if="val" :key="stage" :color="val > 0 ? 'lime' : 'red'">
              {{
                roundTo(
                  stage === "acc" || stage === "eva"
                    ? gen.accStageMultipliers[val]
                    : gen.stageMultipliers[val],
                  2,
                )
              }}x {{ statShortName[stage] }}
            </UBadge>
          </template>

          <!-- <UBadge variant="subtle" color="lime" />
          <UBadge variant="subtle" color="pink" />
          <UBadge variant="subtle" color="violet" />
          <UBadge variant="subtle" color="red" />
          <UBadge variant="subtle" color="yellow" />
          <UBadge variant="subtle" color="sky" /> -->
        </div>
      </div>
    </div>

    <div ref="scope" class="flex flex-col items-center relative">
      <div class="items-center justify-center flex">
        <UPopover mode="hover" :popper="{placement: 'top'}">
          <div
            ref="sprite"
            class="sprite relative z-20 flex justify-center h-28 sm:h-56"
            :class="!poke && 'invisible'"
            :data-poke-id="pokeId"
          >
            <div
              class="absolute w-[128px] h-[117px] sm:w-[256px] sm:h-[234px] flex justify-center items-center select-none"
            >
              <Sprite
                :species="poke?.transformed ?? poke?.speciesId"
                :scale="lessThanSm ? 1 : 2"
                :shiny="poke?.shiny"
                :form="poke?.form"
                :back
              />

              <img
                v-if="poke && !poke.fainted && ((poke.v.flags ?? 0) & VF.cConfused) !== 0"
                class="absolute size-10 sm:size-20 -top-3 sm:-top-0 z-30 dark:invisible"
                src="/dizzy-light.gif"
                alt="confused"
              />

              <img
                v-if="poke && !poke.fainted && ((poke.v.flags ?? 0) & VF.cConfused) !== 0"
                class="absolute size-10 sm:size-20 -top-3 sm:-top-0 z-30 invisible dark:visible"
                src="/dizzy.gif"
                alt="confused"
              />

              <AnimatePresence>
                <motion.img
                  v-if="poke?.v.status === 'slp'"
                  class="absolute size-6 sm:size-10 top-6 z-30 invert dark:invert-0 rotate-180 ml-24"
                  src="/zzz.gif"
                  alt="confused"
                  :initial="{opacity: 0}"
                  :transition="{duration: 0.2}"
                  :animate="{opacity: 1}"
                  :exit="{opacity: 0}"
                />
              </AnimatePresence>
            </div>
          </div>

          <template v-if="poke && !poke.hidden" #panel>
            <PokemonTTContent
              v-if="poke?.base && !poke.transformed"
              :poke="poke?.base"
              :active="poke"
              :weather
            />
            <div v-else class="p-2 flex flex-col items-center">
              <div class="flex gap-10">
                <div class="flex gap-0.5 items-center justify-center">
                  {{ species!.name }}
                  <span v-if="poke.transformed">
                    (Was: {{ gen.speciesList[poke.speciesId].name }})
                  </span>

                  <template v-if="poke?.base && poke.transformed && poke?.base._item">
                    <ItemSprite :item="poke.base._item" />
                    <span
                      class="text-xs"
                      :class="poke.base.itemUnusable && 'line-through italic text-primary'"
                    >
                      {{ poke?.base.gen.items[poke.base._item].name }}
                    </span>
                  </template>
                </div>
                <div class="flex gap-1 items-center">
                  <TypeBadge v-for="type in species!.types" :key="type" :type image />
                </div>
              </div>
              <div v-if="poke?.base && poke.transformed" class="pt-1.5 space-y-1.5 w-full">
                <UProgress :max="poke?.base.stats.hp" :value="poke?.base.hp" />
                <div class="flex justify-between gap-4">
                  <span>
                    {{ poke?.base.hp }}/{{ poke?.base.stats.hp }} HP ({{
                      roundTo(hpPercentExact(poke?.base.hp, poke?.base.stats.hp), 2)
                    }}%)
                  </span>

                  <StatusOrFaint :poke="poke?.base" :faint="!poke || poke.fainted" />
                </div>
              </div>
              <div class="pt-1.5">
                <span v-if="gen.id >= 3">
                  {{
                    gen.speciesList[poke.transformed ?? poke.speciesId].abilities
                      .map(a => abilityList[a].name)
                      .join(", ")
                  }}
                </span>
              </div>
              <span class="pt-5 italic text-center">{{ minSpe }} to {{ maxSpe }} Spe</span>
            </div>
          </template>
        </UPopover>

        <AnimatePresence>
          <motion.div
            v-for="({name: key, clazz}, i) in screens"
            :key
            class="absolute w-16 h-14 sm:w-32 sm:h-28 opacity-30 z-30 rounded-md pointer-events-none"
            :class="clazz"
            :transition="{duration: 0.35, ease: 'easeOut'}"
            :initial="{scale: 0}"
            :animate="{scale: 1, y: i * -5, x: i * -5}"
            :exit="{scale: 0}"
            layout
          />
        </AnimatePresence>
      </div>

      <div
        ref="ground"
        class="ground absolute bottom-4 sm:bottom-8 h-10 w-20 sm:h-16 sm:w-40 rounded-[100%] flex justify-center"
        :class="{back, front: !back}"
      >
        <div
          ref="pokeBall"
          class="pokeball absolute size-[42px] z-10 opacity-0 pointer-events-none"
        />

        <div
          class="substitute absolute opacity-0 bottom-[50%] pointer-events-none"
          :class="back ? 'z-10' : 'z-40'"
        >
          <NuxtImg
            :srcset="
              back
                ? `/sprites/battle/back/substitute.gif ${lessThanSm ? 2 : 1}x`
                : `/sprites/battle/substitute.gif ${lessThanSm ? 1 : 0.5}x`
            "
            alt="substitute"
          />
        </div>

        <img
          v-for="i in 3"
          :key="i"
          class="caltrop absolute size-4 sm:size-7 opacity-0 z-30 pointer-events-none"
          src="/caltrop.svg"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
@import "@/assets/colors.css";

.hp-fill {
  width: v-bind("hp + '%'");
  background-color: v-bind("hpColor(hp)");
  transition: width 0.5s, background-color 0.5s;
}

.pokeball {
  background: url("/sprites/pokeballs.png") v-bind("offsX(pbCol)") v-bind("offsY(pbRow)");

  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;

  @media (max-width: theme("screens.sm")) {
    scale: 0.5;
  }
}

img {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}
</style>

<script setup lang="ts">
import {VF, hpPercentExact, type ScreenId, type Weather} from "~/game/utils";
import {breakpointsTailwind} from "@vueuse/core";
import type {Generation} from "~/game/gen";
import {UPopover, type UBadge} from "#components";
import {
  steps,
  motion,
  type AnimationSequence,
  type Segment,
  type SequenceOptions,
  type SequenceTime,
} from "motion-v";
import type {PokeId} from "~/game/events";
import {Nature} from "~/game/pokemon";
import {abilityList} from "~/game/species";

const {poke, back, gen, player, pokeId} = defineProps<{
  player?: ClientPlayer;
  poke?: ClientActivePokemon;
  back?: bool;
  gen: Generation;
  pokeId: PokeId;
  isSingles: bool;
  weather?: Weather;
}>();
const species = computed(() => poke && gen.speciesList[poke.transformed ?? poke.speciesId]);
const minSpe = computed(
  () => poke && gen.calcStat("spe", species.value!.stats, poke.level, {spe: 0}, {spe: 0}),
);
const maxSpe = computed(
  () =>
    poke &&
    gen.calcStat(
      "spe",
      species.value!.stats,
      poke.level,
      {spe: gen.maxIv},
      {spe: gen.maxEv},
      Nature.timid,
    ),
);
const hp = computed(() => poke?.hpPercent ?? 0);
const statShortName = computed(() => ({...getStatKeys(gen), spd: "SpD", acc: "Acc", eva: "Eva"}));

const breakpoint = useBreakpoints(breakpointsTailwind);
const lessThanSm = breakpoint.smaller("sm");

const sprite = ref<HTMLDivElement>();
const ground = ref<HTMLDivElement>();
const pbRow = ref(0);
const pbCol = ref(3);
const scrColor: Record<ScreenId, string> = {
  safeguard: "bg-purple-500",
  light_screen: "bg-pink-500",
  reflect: "bg-blue-400",
  mist: "bg-sky-400",
};

const screens = computed(() => {
  const screens: {name: string; clazz: string}[] = [];
  if ((poke?.v.flags ?? 0) & VF.protect) {
    screens.push({name: "protect", clazz: "bg-slate-200"});
  }

  if ((poke?.v.flags ?? 0) & VF.lightScreen) {
    screens.push({name: "light_screen", clazz: scrColor.light_screen});
  }

  if ((poke?.v.flags ?? 0) & VF.reflect) {
    screens.push({name: "reflect", clazz: scrColor.reflect});
  }

  for (const screen in scrColor) {
    if (player?.screens?.[screen as ScreenId]) {
      screens.push({name: screen, clazz: scrColor[screen as ScreenId]});
    }
  }

  return screens;
});

const [scope, animate] = useAnimate();

const offsX = (number: number) => `-${number * 42 - number}px`;
const offsY = (number: number) => `-${number * 42 - number * 2}px`;
const relativePos = (src: DOMRect, x: number, y: number) => [x - src.left, y - src.top];

/*
"red" | "pink" | "emerald" | "teal" | "lime" | "gray" | "black" | "sky" | "white" | "green" |
"orange" | "amber" | "yellow" | "cyan" | "blue" | "indigo" | "violet" | "purple" | "fuchsia" |
"rose" | "primary"
*/
const badges: {flag: VF; props: InstanceType<typeof UBadge>["$props"]}[] = [
  {flag: VF.followMe, props: {color: "lime", icon: "tabler:hand-finger", variant: "subtle"}},
  {flag: VF.cAttract, props: {color: "pink", icon: "material-symbols:favorite", variant: "subtle"}},
  {flag: VF.lockon, props: {color: "red", icon: "ri:crosshair-2-line", variant: "subtle"}},
  {flag: VF.cMeanLook, props: {color: "red", icon: "tabler:prison", variant: "subtle"}},
  {flag: VF.cSeeded, props: {color: "lime", icon: "tabler:seedling-filled", variant: "subtle"}},
  {flag: VF.flashFire, props: {color: "red", icon: "mdi:fire", variant: "subtle"}},
  {flag: VF.helpingHand, props: {color: "lime", icon: "mdi:hand-clap", variant: "subtle"}},
  {flag: VF.charge, props: {color: "yellow", icon: "material-symbols:bolt", variant: "subtle"}},
  {
    flag: VF.cEncore,
    props: {color: "sky", icon: "material-symbols:celebration", variant: "subtle"},
  },
  {flag: VF.cDisabled, props: {color: "red", icon: "fe:disabled", variant: "subtle"}},
  {
    flag: VF.cTaunt,
    props: {color: "red", icon: "fluent-emoji-high-contrast:anger-symbol", variant: "subtle"},
  },
  {
    flag: VF.identified,
    props: {color: "violet", icon: "material-symbols:search-rounded", variant: "subtle"},
  },
  {
    flag: VF.imprisoning,
    props: {color: "red", icon: "material-symbols:lock", variant: "subtle", label: "Imprisoning"},
  },
  {flag: VF.curse, props: {color: "red", icon: "mdi:nail", label: "Cursed", variant: "subtle"}},
  {flag: VF.focusEnergy, props: {color: "emerald", label: "Focus Energy"}},
  {flag: VF.mist, props: {color: "teal", label: "Mist"}},
  {flag: VF.destinyBond, props: {color: "gray", label: "Destiny Bond"}},
  {flag: VF.grudge, props: {color: "gray", label: "Grudge"}},
  {flag: VF.protect, props: {color: "black", label: "Protect"}},
  {flag: VF.endure, props: {color: "black", label: "Endure"}},
  {flag: VF.nightmare, props: {color: "black", label: "Nightmare"}},
  {flag: VF.cDrowsy, props: {color: "black", label: "Drowsy"}},
  {flag: VF.waterSport, props: {color: "sky", label: "Water Sport"}},
  {flag: VF.mudSport, props: {color: "orange", label: "Mud Sport"}},
];

const rem = (rem: number) => parseFloat(getComputedStyle(document.documentElement).fontSize) * rem;

export type AnimationParams = SwitchAnim | RetractAnim | AttackAnim | OtherAnim | HurtAnim;

export type SwitchAnim = {
  anim: "sendin";
  cb?: () => void;
  name: string;
};

export type RetractAnim = {
  anim: "sendin" | "retract" | "phaze";
  cb?: () => void;
  batonPass: bool;
  name: string;
};

export type AttackAnim = {
  anim: "attack";
  cb?: () => void;
  target: PokeId;
};

export type OtherAnim = {
  anim: "faint" | "get_sub" | "lose_sub" | "spikes";
  cb?: () => void;
  batonPass?: bool;
};

export type HurtAnim = {
  anim: "hurt";
  cb?: () => void;
  direct: bool;
};

const subOpacity = 0.5;
const [subOffsetX, subOffsetY] = [1.5, 0.5];

let hasSubstitute = false;
const playAnimation = (params: AnimationParams) => {
  if ("name" in params) {
    pbCol.value = params.name
      ? [...params.name].reduce((acc, x) => x.charCodeAt(0) + acc, 0) % 17
      : 3;
  }

  const seq: AnimationSequence = [];
  const opts: SequenceOptions = {};
  if (params.anim === "faint") {
    animations.faint(seq);
    if (hasSubstitute) {
      hasSubstitute = false;
      animations.fadeSub(seq);
    }
  } else if (params.anim === "sendin") {
    animations.sendIn(seq, params.cb);
    if (hasSubstitute) {
      animations.subAfterBatonPass(seq);
    }
  } else if (params.anim === "retract") {
    if (hasSubstitute) {
      if (params.batonPass) {
        animations.startSubAttack(seq);
      } else {
        hasSubstitute = false;
        animations.loseSub(seq);
      }
    }
    animations.retract(seq);
  } else if (params.anim === "get_sub") {
    hasSubstitute = true;
    animations.getSub(seq);
  } else if (params.anim === "lose_sub") {
    hasSubstitute = false;
    animations.loseSub(seq, params.cb);
  } else if (params.anim === "phaze") {
    animations.phaze(seq, ".sprite");
    if (hasSubstitute) {
      hasSubstitute = false;
      animations.phaze(seq, ".substitute", "<");
    }
  } else if (params.anim === "spikes") {
    animations.spikes(seq, params.cb);
  } else if (params.anim === "attack") {
    if (hasSubstitute) {
      animations.startSubAttack(seq);
    }

    const other = document.querySelector(`.sprite[data-poke-id="${params.target}"]`)!;
    animations.attack(seq, other, params.cb);
    opts.repeat = 1;
    opts.repeatType = "reverse";
  } else if (params.anim === "hurt") {
    animations.hurt(seq, params.direct);
  }

  return animate(seq, opts);
};

const ms = (ms: number) => ms / 1000;

const onComplete = (cb: () => void): Segment => {
  let once = false;
  let value = 0;
  const obj = {
    get value() {
      return value;
    },
    set value(v) {
      value = v;
      if (v !== 0 && !once) {
        cb();
        once = true;
      }
    },
  };
  // XXX: For some reason motion decides to run animations with 0 duration at the start of the
  // sequence
  return [obj, {value: 5}, {duration: 0.015}];
};

const animations = {
  startSubAttack(seq: AnimationSequence) {
    seq.push([
      ".substitute",
      {
        x: back ? -rem(subOffsetX) : rem(subOffsetX),
        y: back ? rem(subOffsetY) : -rem(subOffsetY),
        opacity: [1, 0.5],
      },
      {duration: ms(300), ease: easeOutExpo},
    ]);
    seq.push([
      ".sprite",
      {
        x: back ? rem(subOffsetX) / 2 : -rem(subOffsetX) / 2,
        y: back ? -rem(subOffsetY) / 2 : rem(subOffsetY) / 2,
        opacity: 1,
      },
      {duration: ms(300), ease: easeOutExpo, at: "<"},
    ]);
  },
  subAfterBatonPass(seq: AnimationSequence) {
    seq.push([
      ".sprite",
      {
        opacity: subOpacity,
        x: back ? -rem(subOffsetX) : rem(subOffsetX),
        y: back ? rem(subOffsetY) : -rem(subOffsetY),
      },
      {duration: ms(250), ease: easeOutExpo},
    ]);
    seq.push([
      ".substitute",
      {x: 0, y: 0, opacity: 1},
      {duration: ms(250), ease: easeOutExpo, at: "+0"},
    ]);
  },
  fadeSub(seq: AnimationSequence) {
    seq.push([".substitute", {opacity: 0, scaleX: 0}, {duration: ms(300), ease: easeInExpo}]);
  },

  faint(seq: AnimationSequence) {
    seq.push([".sprite", {y: rem(7), opacity: 0}, {ease: easeInExpo, duration: ms(250)}]);
    seq.push([".sprite", {y: 0}, {ease: steps(1, "start"), duration: 0.01}]);
  },
  sendIn(seq: AnimationSequence, cb?: () => void) {
    pbRow.value = 0;

    seq.push([
      ".pokeball",
      {
        x: [back ? -rem(6) : rem(6), 0],
        y: [-rem(2), -rem(5), -rem(1.25)],
        rotateZ: [0, 360 * 5 * (back ? 1 : -1)],
        opacity: [1, 0],
      },
      {
        x: {ease: "linear"},
        y: {times: [0, 0.4, 1], ease: ["easeOut", "backIn"]},
        rotateZ: {ease: "linear"},
        opacity: {ease: steps(1)},
        duration: ms(650),
      },
    ]);
    if (cb) {
      seq.push(onComplete(cb));
    }

    seq.push([
      ".sprite",
      {opacity: [0, 1], x: [0, 0], y: [0, 0], scale: [0, 1]},
      {duration: ms(650), ease: easeOutExpo},
    ]);
  },
  getSub(seq: AnimationSequence, cb?: () => void) {
    seq.push([
      ".sprite",
      {
        opacity: [0, subOpacity],
        x: back ? -rem(subOffsetX) : rem(subOffsetX),
        y: back ? rem(subOffsetY) : -rem(subOffsetY),
      },
      {duration: ms(800), ease: easeOutExpo},
    ]);
    if (cb) {
      seq.push(onComplete(cb));
    }
    seq.push([
      ".substitute",
      {
        x: [0, 0],
        y: [-rem(8), 0],
        opacity: [0, 1],
        scaleX: [1, 1],
      },
      {duration: ms(350), ease: easeOutBounce},
    ]);
  },
  loseSub(seq: AnimationSequence, cb?: () => void) {
    this.fadeSub(seq);
    if (cb) {
      seq.push(onComplete(cb));
    }
    seq.push([".sprite", {x: 0, y: 0, opacity: 1}, {duration: ms(500), ease: easeInExpo}]);
  },
  phaze(seq: AnimationSequence, target: any, at?: SequenceTime) {
    const x = back ? -rem(8) : rem(8); // 120
    seq.push([
      target,
      {x, opacity: 0},
      {duration: ms(450), x: {ease: easeOutQuart}, opacity: {ease: easeOutExpo}, at},
    ]);
  },
  retract(seq: AnimationSequence) {
    pbRow.value = 10;

    seq.push([".pokeball", {x: 0, y: 0, opacity: 1}, {ease: steps(1, "start"), duration: 0}]);
    seq.push([
      sprite.value!,
      {scale: 0.45, opacity: 0, transformOrigin: ["bottom", "center"]},
      {
        duration: ms(550),
        at: "<",
        ease: easeOutQuart,
        opacity: {ease: easeInCubic},
        transformOrigin: {ease: steps(2, "start")},
      },
    ]);
    seq.push(onComplete(() => (pbRow.value = 9)));
    seq.push([".pokeball", {opacity: 0}, {duration: ms(200), ease: "linear"}]);
  },
  spikes(seq: AnimationSequence, cb?: () => void) {
    const ground = document.querySelector<HTMLDivElement>(`.ground${back ? ".front" : ".back"}`)!;
    const sprites = scope.value.querySelectorAll(".caltrop");

    for (let i = 0; i < sprites.length; i++) {
      let xOffs = [0, -30, 30][i];
      if (i !== 0) {
        xOffs += Math.sign(xOffs) * Math.random() * 20;
      }
      const height = Math.random() * 20 + 50;
      const offs = [ground.getBoundingClientRect().width / 2 + xOffs, 20] as const;

      const caltrop = sprites[i] as HTMLImageElement;

      const [x, y] = arcTo(caltrop, ground, height, offs);
      seq.push([
        caltrop,
        {opacity: [1, 1], x: [0, x], y: [0, ...y]}, //
        {
          x: {ease: "linear"},
          y: {times: [0, 0.75, 1], ease: [easeOutQuart, easeInQuart]},
          duration: ms(250),
          at: i * 0.1,
        },
      ]);
      if (cb && i === 0) {
        seq.push(onComplete(cb));
      }
      seq.push([
        caltrop,
        {opacity: 0, x: 0, y: 0},
        {ease: "easeOut", duration: ms(350), x: {ease: steps(1)}, y: {ease: steps(1)}},
      ]);
    }
  },
  attack(seq: AnimationSequence, other: Element, cb?: () => void) {
    const [x, y] = arcTo(sprite.value!, other);
    seq.push([
      sprite.value!,
      {x: [0, x], y: [0, ...y]},
      {
        x: {ease: "linear"},
        y: {times: [0, 0.75, 1], ease: [easeOutQuart, easeInQuart]},
        duration: ms(240),
      },
    ]);
    if (cb) {
      seq.push(onComplete(cb));
    }
  },
  hurt(seq: AnimationSequence, direct: bool) {
    const hitSub = hasSubstitute && !direct;
    seq.push([
      hitSub ? ".substitute" : ".sprite",
      {opacity: [0, 1, 0, 1, 0, !hitSub && hasSubstitute ? subOpacity : 1]},
      {opacity: {ease: steps(6)}, duration: 0.35},
    ]);
  },
};

const arcTo = (self: Element, other: Element, height = 50, offs?: readonly [number, number]) => {
  const myRect = self.getBoundingClientRect();
  const otherRect = other.getBoundingClientRect();

  const [x, y] = relativePos(myRect, otherRect.x, otherRect.y);
  const midYRel = otherRect.top < myRect.top ? y - height : -height;
  const xOffs = offs?.[0] ?? 0;
  const yOffs = offs?.[1] ?? 0;
  return [x + xOffs, [midYRel, y + yOffs]] as const;
};

// https://easings.net

const easeInExpo = [0.7, 0, 0.84, 0] as const;
const easeOutExpo = [0.16, 1, 0.3, 1] as const;
const easeOutQuart = [0.25, 1, 0.5, 1] as const;
const easeInQuart = [0.5, 0, 0.75, 0] as const;
const easeInCubic = [0.32, 0, 0.67, 0] as const;

function easeOutBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (x < 1 / d1) {
    return n1 * x * x;
  } else if (x < 2 / d1) {
    return n1 * (x -= 1.5 / d1) * x + 0.75;
  } else if (x < 2.5 / d1) {
    return n1 * (x -= 2.25 / d1) * x + 0.9375;
  } else {
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  }
}

const getId = () => pokeId;

defineExpose({playAnimation, getId});
</script>
