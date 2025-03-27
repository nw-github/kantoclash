<template>
  <div class="w-full flex flex-col items-center">
    <div
      class="w-11/12 sm:w-3/4 flex flex-col gap-0.5 sm:gap-1 text-sm z-40"
      :class="{invisible: !poke || poke.hidden}"
    >
      <div class="flex justify-between flex-col sm:flex-row">
        <div class="font-bold flex items-center">
          <span class="truncate max-w-24">{{ poke?.name ?? "--" }}</span>
          <!-- @vue-expect-error -->
          <GenderIcon class="size-4" :gender="poke?.gender ?? gen1Gender[poke?.speciesId]" />
        </div>
        <span class="text-[0.75rem] sm:text-sm">Lv. {{ poke?.level ?? 100 }}</span>
      </div>
      <div class="relative overflow-hidden rounded-md bg-[#333] flex">
        <div class="hp-fill absolute h-full rounded-md" />
        <div class="w-full text-center text-gray-100 text-xs sm:text-sm z-30">{{ hp }}%</div>
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

          <template v-for="{flag, props} in badges">
            <UBadge v-if="((poke.v.flags ?? 0) & flag) !== 0" :key="flag" v-bind="props" />
          </template>

          <template v-for="(val, stage) in poke.v.stages">
            <UBadge v-if="val" :key="stage" :color="val > 0 ? 'lime' : 'red'">
              {{ roundTo(stageMultipliers[val] / 100, 2) }}x {{ statShortName[stage] }}
            </UBadge>
          </template>
        </div>
      </div>
    </div>

    <div ref="scope" class="flex flex-col items-center relative">
      <div class="w-[128px] h-[117px] sm:w-[256px] sm:h-[234px] items-center justify-center flex">
        <UPopover mode="hover" :popper="{placement: 'top'}">
          <div
            ref="sprite"
            class="sprite relative z-20 flex justify-center"
            :class="{back, front: !back, invisible: !poke}"
          >
            <Sprite
              :species="poke?.transformed ?? poke?.speciesId"
              :scale="lessThanSm ? 1 : 2"
              :shiny="poke?.shiny"
              :back
            />

            <img
              v-if="poke && !poke.fainted && ((poke.v.flags ?? 0) & VF.cConfused) !== 0"
              class="absolute size-10 sm:size-20 -top-3 sm:-top-6 z-30 dark:invisible"
              src="/dizzy-light.gif"
              alt="confused"
            />

            <img
              v-if="poke && !poke.fainted && ((poke.v.flags ?? 0) & VF.cConfused) !== 0"
              class="absolute size-10 sm:size-20 -top-3 sm:-top-6 z-30 invisible dark:visible"
              src="/dizzy.gif"
              alt="confused"
            />

            <img
              v-if="poke?.v.status === 'slp'"
              class="absolute size-6 sm:size-10 -top-4 z-30 invert dark:invert-0 rotate-180 ml-20"
              src="/zzz.gif"
              alt="confused"
            />
          </div>

          <template v-if="poke && !poke.hidden" #panel>
            <div class="p-2">
              <PokemonTTContent v-if="base && !poke.transformed" :poke="base" :active="poke" />
              <div v-else class="flex flex-col items-center">
                <div class="flex gap-10">
                  <div class="flex gap-0.5 items-center justify-center">
                    {{ species!.name }}
                    <span v-if="poke.transformed">
                      (Was: {{ gen.speciesList[poke.speciesId].name }})
                    </span>

                    <template v-if="base && poke.transformed && base.item">
                      <ItemSprite :item="base.item" />
                      <span class="text-xs">{{ base.gen.items[base.item] }}</span>
                    </template>
                  </div>
                  <div class="flex gap-1">
                    <TypeBadge v-for="type in species!.types" :key="type" :type image />
                  </div>
                </div>
                <div v-if="base && poke.transformed" class="pt-1.5 space-y-1.5 w-full">
                  <UProgress :max="base.stats.hp" :value="base.hp" />
                  <div class="flex justify-between gap-4">
                    <span>
                      {{ base.hp }}/{{ base.stats.hp }} HP ({{
                        roundTo(hpPercentExact(base.hp, base.stats.hp), 2)
                      }}%)
                    </span>

                    <StatusOrFaint :poke="base" :faint="!poke || poke.fainted" />
                  </div>
                </div>
                <span class="pt-5 italic text-center">{{ minSpe }} to {{ maxSpe }} Spe</span>
              </div>
            </div>
          </template>
        </UPopover>

        <TransitionGroup name="screens">
          <div
            v-for="{name: key, clazz, style} in screens"
            :key
            :class="clazz"
            :style
            class="absolute w-16 h-14 sm:w-32 sm:h-28 opacity-30 z-30 rounded-md pointer-events-none"
          />
        </TransitionGroup>
      </div>

      <div
        ref="ground"
        class="ground absolute bottom-4 sm:bottom-8 bg-gray-200 dark:bg-gray-600 h-10 w-20 sm:h-16 sm:w-40 rounded-[100%] flex justify-center"
        :class="{back, front: !back}"
      >
        <div
          ref="pokeBall"
          class="pokeball absolute size-[42px] z-10 opacity-0 pointer-events-none"
        />

        <div
          class="substitute absolute opacity-0 bottom-[50%] pointer-events-none"
          :class="!back && 'z-40'"
        >
          <Sprite species="marowak" substitute :scale="lessThanSm ? 1 : 2" :back />
        </div>
      </div>

      <img
        v-if="side?.spikes"
        class="absolute size-4 sm:size-7 bottom-10 sm:bottom-14 opacity-80 pointer-events-none"
        src="/caltrop.svg"
      />

      <img
        v-for="i in 3"
        :key="i"
        class="caltrop absolute bottom-4 sm:bottom-8 size-4 sm:size-7 opacity-0 pointer-events-none"
        src="/caltrop.svg"
      />
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

.screens-move,
.screens-enter-active,
.screens-leave-active {
  transition: all 0.4s ease-out;
}

.screens-enter-from {
  transform: scale(0);
}

.screens-leave-to {
  transform: scale(0);
}
</style>

<script setup lang="ts">
import {stageMultipliers, VF, hpPercentExact, type Screen} from "~/game/utils";
import {calcStat, type Pokemon} from "~/game/pokemon";
import {breakpointsTailwind} from "@vueuse/core";
import type {Generation} from "~/game/gen";
import type {Side} from "./Battle.vue";
import type {UBadge} from "#components";
import type {StyleValue} from "vue";
import {
  steps,
  type AnimationSequence,
  type Segment,
  type SequenceOptions,
  type SequenceTime,
} from "motion-v";

const {poke, base, back, gen, side} = defineProps<{
  poke?: ClientActivePokemon;
  base?: Pokemon;
  back?: boolean;
  side?: Side;
  gen: Generation;
}>();
const species = computed(() => poke && gen.speciesList[poke.transformed ?? poke.speciesId]);
const minSpe = computed(
  () => poke && calcStat("spe", species.value!.stats, poke.level, {spe: 0}, {spe: 0}),
);
const maxSpe = computed(
  () =>
    poke && calcStat("spe", species.value!.stats, poke.level, {spe: gen.maxIv}, {spe: gen.maxEv}),
);
const hp = computed(() => poke?.hpPercent ?? 0);
const statShortName = computed(() => ({...getStatKeys(gen), spd: "SpD", acc: "Acc", eva: "Eva"}));

const breakpoint = useBreakpoints(breakpointsTailwind);
const lessThanSm = breakpoint.smaller("sm");

const sprite = ref<HTMLDivElement>();
const ground = ref<HTMLDivElement>();
const pbRow = ref(0);
const pbCol = ref(3);
const scrColor: Record<Screen, string> = {
  safeguard: "bg-purple-500",
  light_screen: "bg-pink-500",
  reflect: "bg-blue-400",
};

const screens = computed(() => {
  const screens: {name: string; clazz: string; style: StyleValue}[] = [];
  let margin = 0;
  const addScreen = (name: string, clazz: string) => {
    screens.push({
      name,
      clazz,
      style: {marginTop: -margin * 0.5 + "rem", marginLeft: -margin * 0.5 + "rem"},
    });
    margin++;
  };

  if ((poke?.v.flags ?? 0) & VF.protect) {
    addScreen("protect", "bg-slate-200");
  }

  if ((poke?.v.flags ?? 0) & VF.lightScreen) {
    addScreen("light_screen", scrColor.light_screen);
  }

  if ((poke?.v.flags ?? 0) & VF.reflect) {
    addScreen("reflect", scrColor.reflect);
  }

  for (const screen in scrColor) {
    if (side?.screens?.[screen as Screen]) {
      addScreen(screen, scrColor[screen as Screen]);
    }
  }

  return screens;
});

const [scope, animate] = useAnimate();

const offsX = (number: number) => `-${number * 42 - number}px`;
const offsY = (number: number) => `-${number * 42 - number * 2}px`;
const relativePos = (src: DOMRect, x: number, y: number) => [x - src.left, y - src.top];

onMounted(async () => {
  // await playAnimation({anim: "get_sub", batonPass: true, name: ""});
  // await playAnimation({anim: "retract", batonPass: true, name: ""});
  // await playAnimation({anim: "sendin", batonPass: true, name: ""});
  // await playAnimation({anim: "attack", batonPass: false, name: ""});
  // await playAnimation({anim: "lose_sub", batonPass: false, name: ""});
  // await playAnimation({anim: "attack", batonPass: false, name: ""});
  // await playAnimation({anim: "retract", batonPass: false, name: ""});
  // await playAnimation({anim: "sendin", batonPass: false, name: ""});
  //   await playAnimation({
  //     anim: "get_sub",
  //     batonPass: false,
  //     name: "l",
  //     cb: () => log("cb called"),
  //   });
  //
  //   await playAnimation({
  //     anim: "lose_sub",
  //     batonPass: false,
  //     name: "l",
  //     cb: () => log("cb called"),
  //   });
  // await playAnimation({
  //   anim: "sendin",
  //   batonPass: false,
  //   name: "l",
  // });
});

/*
"red" | "pink" | "emerald" | "teal" | "lime" | "gray" | "black" | "sky" | "white" | "green" |
"orange" | "amber" | "yellow" | "cyan" | "blue" | "indigo" | "violet" | "purple" | "fuchsia" |
"rose" | "primary"
*/
const badges: {flag: VF; props: InstanceType<typeof UBadge>["$props"]}[] = [
  {flag: VF.cAttract, props: {color: "pink", icon: "material-symbols:favorite", variant: "subtle"}},
  {flag: VF.lockon, props: {color: "red", icon: "ri:crosshair-2-line", variant: "subtle"}},
  {flag: VF.cMeanLook, props: {color: "red", icon: "tabler:prison", variant: "subtle"}},
  {
    flag: VF.foresight,
    props: {
      color: "violet",
      icon: "material-symbols:search-rounded",
      variant: "subtle",
      class: "ring-violet-500 dark:ring-violet-400",
    },
  },
  {flag: VF.curse, props: {color: "red", label: "Curse"}},
  {flag: VF.cDisabled, props: {color: "red", label: "Disable"}},
  {flag: VF.focus, props: {color: "emerald", label: "Focus Energy"}},
  {flag: VF.mist, props: {color: "teal", label: "Mist"}},
  {flag: VF.seeded, props: {color: "lime", label: "Seeded"}},
  {flag: VF.destinyBond, props: {color: "gray", label: "Destiny Bond"}},
  {flag: VF.protect, props: {color: "black", label: "Protect"}},
  {flag: VF.endure, props: {color: "black", label: "Endure"}},
  {flag: VF.cEncore, props: {color: "sky", label: "Encore"}},
  {flag: VF.nightmare, props: {color: "black", label: "Nightmare"}},
];

const rem = (rem: number) => parseFloat(getComputedStyle(document.documentElement).fontSize) * rem;

export type AnimationParams =
  | SwitchAnim
  | {
      anim: "faint" | "get_sub" | "lose_sub" | "spikes" | "attack";
      cb?: () => void;
      batonPass?: boolean;
      name?: string;
    };

export type SwitchAnim = {
  anim: "sendin" | "retract" | "phaze";
  cb?: () => void;
  batonPass: boolean;
  name: string;
};

const subOpacity = 0.5;
const [subOffsetX, subOffsetY] = [1.5, 0.5];

let hasSubstitute = false;
const playAnimation = ({anim, cb, batonPass, name}: AnimationParams) => {
  if (name) {
    pbCol.value = name ? [...name].reduce((acc, x) => x.charCodeAt(0) + acc, 0) % 17 : 3;
  }

  const seq: AnimationSequence = [];
  const opts: SequenceOptions = {};
  if (anim === "faint") {
    if (hasSubstitute) {
      animations.loseSub(seq);
    }
    animations.faint(seq);
  } else if (anim === "sendin") {
    animations.sendIn(seq, cb);
    if (hasSubstitute) {
      animations.subAfterBatonPass(seq);
    }
  } else if (anim === "retract") {
    if (hasSubstitute) {
      if (batonPass) {
        animations.startSubAttack(seq);
      } else {
        hasSubstitute = false;
        animations.loseSub(seq);
      }
    }
    animations.retract(seq);
  } else if (anim === "get_sub") {
    hasSubstitute = true;
    animations.getSub(seq);
  } else if (anim === "lose_sub") {
    hasSubstitute = false;
    animations.loseSub(seq, cb);
  } else if (anim === "phaze") {
    animations.phaze(seq, ".sprite");
    if (hasSubstitute) {
      hasSubstitute = false;
      animations.phaze(seq, ".substitute", "<");
    }
  } else if (anim === "spikes") {
    animations.spikes(seq, cb);
  } else {
    if (hasSubstitute) {
      animations.startSubAttack(seq);
    }

    animations.attack(seq, cb);
    opts.repeat = 1;
    opts.repeatType = "reverse";
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
  return [obj, {value: 5}, {duration: 0.01}];
};

const animations = {
  startSubAttack(seq: AnimationSequence) {
    seq.push([
      ".substitute",
      {
        x: back ? -rem(subOffsetX) : rem(subOffsetX),
        y: back ? rem(subOffsetY) : -rem(subOffsetY),
        opacity: 0.5,
      },
      {duration: ms(350), ease: easeOutExpo},
    ]);
    seq.push([
      ".sprite",
      {
        x: back ? rem(subOffsetX) / 2 : -rem(subOffsetX) / 2,
        y: back ? -rem(subOffsetY) / 2 : rem(subOffsetY) / 2,
        opacity: 1,
      },
      {duration: ms(350), ease: easeOutExpo, at: "<"},
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

  faint(seq: AnimationSequence) {
    seq.push([".sprite", {y: rem(7), opacity: 0}, {ease: easeInExpo, duration: ms(250)}]);
    seq.push([".sprite", {y: 0}, {ease: steps(1), duration: 0.01}]);
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
        scaleX: [1, 1],
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
        opacity: 1,
      },
      {duration: ms(350), ease: easeOutBounce},
    ]);
  },
  loseSub(seq: AnimationSequence, cb?: () => void) {
    seq.push([".substitute", {opacity: 0, scaleX: 0}, {duration: ms(300), ease: easeInExpo}]);
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
    const sprite = scope.value.querySelector(".sprite")!;
    const sprRect = sprite.getBoundingClientRect();
    const gRect = ground.value!.getBoundingClientRect();
    const [_, sprY] = relativePos(sprRect, 0, gRect.top - rem(lessThanSm.value ? 1.2 : 2.8));

    pbRow.value = 10;

    seq.push([".pokeball", {x: 0, y: 0, opacity: 1}, {ease: steps(1, "start"), duration: 0}]);
    seq.push([
      sprite,
      {scale: 0.45, opacity: 0, y: sprY},
      {duration: ms(550), at: "<", ease: easeOutQuart, opacity: {ease: easeInCubic}},
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
  attack(seq: AnimationSequence, cb?: () => void) {
    const other = document.querySelector(`.sprite${back ? ".front" : ".back"}`)!;
    const sprite = scope.value.querySelector(".sprite")!;

    const [x, y] = arcTo(sprite, other);
    seq.push([
      sprite,
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

const isBack = () => back;

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

defineExpose({playAnimation, isBack});
</script>
