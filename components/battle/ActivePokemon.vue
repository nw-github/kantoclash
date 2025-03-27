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

    <div class="flex flex-col items-center relative">
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
          ref="substitute"
          class="absolute opacity-0 bottom-[50%] pointer-events-none"
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
        ref="caltrop1"
        class="absolute bottom-4 sm:bottom-8 size-4 sm:size-7 opacity-0 pointer-events-none"
        src="/caltrop.svg"
      />
      <img
        ref="caltrop2"
        class="absolute bottom-4 sm:bottom-8 size-4 sm:size-7 opacity-0 pointer-events-none"
        src="/caltrop.svg"
      />
      <img
        ref="caltrop3"
        class="absolute bottom-4 sm:bottom-8 size-4 sm:size-7 opacity-0 pointer-events-none"
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
const pokeBall = ref<HTMLDivElement>();
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

const offsX = (number: number) => `-${number * 42 - number}px`;
const offsY = (number: number) => `-${number * 42 - number * 2}px`;
const relativePos = (src: DOMRect, x: number, y: number) => [x - src.left, y - src.top];

const caltrop1 = ref<HTMLImageElement>();
const caltrop2 = ref<HTMLImageElement>();
const caltrop3 = ref<HTMLImageElement>();

const substitute = ref<HTMLDivElement>();

onMounted(async () => {
  // await playAnimation(false, {anim: "get_sub", batonPass: false, name: ""});
  // await playAnimation(false, {anim: "lose_sub", batonPass: false, name: ""});
  // await playAnimation(false, {anim: "attack", batonPass: false, name: ""});
  // await playAnimation(false, {anim: "attack", batonPass: false, name: ""});
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

const arcTo = (
  self: Element,
  other: Element,
  duration: number,
  height = 50,
  offs?: [number, number],
) => {
  const myRect = self.getBoundingClientRect();
  const otherRect = other.getBoundingClientRect();

  const [x, y] = relativePos(myRect, otherRect.x, otherRect.y);
  const midYRel = otherRect.top < myRect.top ? y - height : -height;
  const xOffs = offs?.[0] ?? 0;
  const yOffs = offs?.[1] ?? 0;

  return {
    translateX: {value: x + xOffs, duration, easing: "linear"},
    translateY: [
      {value: midYRel, duration: duration * (3 / 4), easing: "easeOutQuart"},
      {value: y + yOffs, duration: duration / 4, easing: "easeInQuart"},
    ],
  };
};

export type AnimationParams =
  | SwitchAnim
  | {
      anim: "faint" | "get_sub" | "lose_sub" | "spikes" | "attack";
      cb?: () => void;
      batonPass?: boolean;
      name?: string;
    }
  | SwitchAnim;

export type SwitchAnim = {
  anim: "sendin" | "retract" | "phaze";
  cb?: () => void;
  batonPass: boolean;
  name: string;
};

let timeline: anime.AnimeTimelineInstance | undefined;
let hasSubstitute = false;
const playAnimation = (skip: boolean, {anim, cb, batonPass, name}: AnimationParams) => {
  if (!sprite.value || !pokeBall.value || !substitute.value) {
    return;
  }
  if (name) {
    pbCol.value = name ? [...name].reduce((acc, x) => x.charCodeAt(0) + acc, 0) % 17 : 3;
  }

  const subOpacity = 0.5;
  const [subOffsetX, subOffsetY] = [rem(1.5), rem(0.5)];

  timeline = useAnime.timeline();
  if (anim === "faint") {
    if (hasSubstitute) {
      playLoseSub(timeline);
    }

    timeline.add({
      targets: sprite.value,
      duration: 250,
      translateY: {value: rem(7), duration: 250},
      easing: "easeInExpo",
      opacity: 0,
      complete: () => useAnime.set(sprite.value!, {translateX: 0, translateY: 0, scale: 1}),
    });
  } else if (anim === "sendin") {
    pbRow.value = 0;
    timeline.add({
      targets: pokeBall.value,
      translateX: [
        {value: back ? -rem(6) : rem(6), duration: 0},
        {value: 0, duration: 700, easing: "linear"},
      ],
      translateY: [
        {value: -rem(2.5), duration: 0},
        {value: -rem(4 * 1.4), duration: 450, easing: "easeOutQuad"},
        {value: -rem(0.5), duration: 250, easing: "easeInQuad"},
      ],
      rotateZ: [
        {value: 0, duration: 0},
        {value: 360 * 4 * (back ? 1 : -1), duration: 800, easing: "linear"},
      ],
      opacity: [
        {value: 100, duration: 800},
        {value: 0, duration: 0},
      ],
      complete: cb,
    });
    timeline.add({
      targets: sprite.value,
      easing: "easeOutExpo",
      opacity: [{value: 0, duration: 0}, {value: 1}],
      translateX: {value: 0, duration: 0},
      translateY: {value: 0, duration: 0},
      scale: [{value: 0, duration: 0}, {value: 1}],
      duration: 800,
    });

    if (hasSubstitute) {
      timeline.add({
        targets: sprite.value,
        easing: "easeOutExpo",
        duration: 250,
        opacity: subOpacity,
        translateX: back ? -subOffsetX : subOffsetX,
        translateY: back ? subOffsetY : -subOffsetY,
      });
      // prettier-ignore
      timeline.add({
        targets: substitute.value,
        duration: 250,
        easing: "easeOutExpo",
        translateX: 0,
        translateY: 0,
        opacity: 1,
      }, "+=0");
    }
  } else if (anim === "retract") {
    if (hasSubstitute) {
      if (batonPass) {
        playStartAttack(timeline, subOffsetX, subOffsetY);
      } else {
        playLoseSub(timeline);
      }
    }

    const sprRect = sprite.value.getBoundingClientRect();
    const gRect = ground.value!.getBoundingClientRect();
    const [_, sprY] = relativePos(sprRect, 0, gRect.top - rem(lessThanSm.value ? 1.2 : 2.8));

    pbRow.value = 10;

    timeline.add({
      targets: pokeBall.value,
      easing: "steps(2)",
      translateX: [{value: 0, duration: 0}],
      translateY: [{value: 0, duration: 0}],
      opacity: [{value: 1, duration: 0}],
      duration: 800,
    });
    timeline.add(
      {
        targets: sprite.value,
        easing: "easeOutQuart",
        scale: 0.45,
        opacity: [{value: 0, easing: "easeInCubic"}],
        translateY: sprY,
        duration: 550,
        complete: () => {
          useAnime.set(sprite.value!, {opacity: 0, translateX: 0, translateY: 0, scale: 1});
        },
      },
      "+=0",
    );
    timeline.add({
      targets: pokeBall.value,
      opacity: 0,
      duration: 300,
      easing: "linear",
      begin: () => (pbRow.value = 9),
    });
  } else if (anim === "get_sub") {
    hasSubstitute = true;
    timeline.add({
      targets: sprite.value,
      easing: "easeOutExpo",
      duration: 800,
      opacity: subOpacity,
      translateX: back ? -subOffsetX : subOffsetX,
      translateY: back ? subOffsetY : -subOffsetY,
      complete: () => {
        useAnime.set(substitute.value!, {opacity: 1});
        cb?.();
      },
    });
    timeline.add({
      targets: substitute.value,
      duration: 350,
      scaleX: {value: 1, duration: 0},
      translateX: {value: 0, duration: 0},
      translateY: [
        {value: -rem(8), duration: 0},
        {value: 0, duration: 350},
      ],
      easing: "easeOutBounce",
    });
  } else if (anim === "lose_sub") {
    hasSubstitute = false;
    playLoseSub(timeline, cb);
  } else if (anim === "phaze") {
    timeline.add({
      targets: sprite.value,
      duration: 450,
      translateX: [{value: back ? -120 : 120, easing: "easeOutQuart"}],
      opacity: [{value: 0, easing: "easeOutExpo"}],
      complete: () => useAnime.set(sprite.value!, {translateX: 0, translateY: 0, scale: 1}),
    });

    if (hasSubstitute) {
      hasSubstitute = false;
      timeline.add(
        {
          targets: substitute.value,
          duration: 450,
          translateX: [{value: back ? -120 : 120, easing: "easeOutQuart"}],
          opacity: [{value: 0, easing: "easeOutExpo"}],
          complete: () => useAnime.set(substitute.value!, {translateX: 0, translateY: 0, scale: 1}),
        },
        0,
      );
    }
  } else if (anim === "spikes") {
    const other = document.querySelector<HTMLDivElement>(`.ground${back ? ".front" : ".back"}`)!;
    const sprites = [caltrop1.value!, caltrop2.value!, caltrop3.value!];

    let delay = 0;
    for (let i = 0; i < sprites.length; i++) {
      const duration = 250;
      let xOffs = [0, -30, 30][i];
      if (i !== 0) {
        xOffs += Math.sign(xOffs) * Math.random() * 20;
      }

      const caltrop = sprites[i];
      const params: anime.AnimeParams = {
        targets: caltrop,
        ...arcTo(caltrop, other, duration, Math.random() * 20 + 50, [
          other.getBoundingClientRect().width / 2 + xOffs,
          20,
        ]),
        opacity: {value: 1, duration: 0},
        complete: () => {
          useAnime({
            targets: caltrop,
            opacity: [{value: 1, duration: 250}, {value: 0}],
            complete: () => useAnime.set(caltrop, {translateX: 0, translateY: 0, opacity: 0}),
          });

          if (i === 0 && cb) {
            cb();
          }
        },
      };

      timeline.add(params, delay);
      delay += 80;
    }
  } else {
    if (hasSubstitute) {
      playStartAttack(timeline, subOffsetX, subOffsetY);
    }

    const other = document.querySelector(`.sprite${back ? ".front" : ".back"}`)!;

    const duration = 240;
    let ran = false;
    timeline.direction = "alternate";
    timeline.add({
      targets: sprite.value,
      ...arcTo(sprite.value, other, duration),
      loopComplete: () => {
        if (!ran && cb) {
          cb();
          ran = true;
        }
      },
    });
  }

  if (skip) {
    timeline.seek(timeline.duration);
    return;
  }

  return timeline.finished;
};

const playLoseSub = (timeline: anime.AnimeTimelineInstance, cb?: () => void) => {
  hasSubstitute = false;
  timeline.add({
    targets: substitute.value,
    duration: 300,
    easing: "easeInExpo",
    opacity: 0,
    scaleX: 0,
    complete: () => {
      cb?.();
      useAnime.set(sprite.value!, {scaleX: 1});
    },
  });
  timeline.add({
    targets: sprite.value,
    duration: 500,
    easing: "easeInExpo",
    translateX: 0,
    translateY: 0,
    opacity: 1,
  });
};

const playStartAttack = (timeline: anime.AnimeTimelineInstance, x: number, y: number) => {
  timeline.add({
    targets: substitute.value,
    duration: 350,
    easing: "easeOutExpo",
    translateX: back ? -x : x,
    translateY: back ? y : -y,
    opacity: 0.5,
  });
  // prettier-ignore
  timeline.add({
    targets: sprite.value,
    duration: 350,
    easing: "easeOutExpo",
    translateX: back ? x / 2 : -x / 2,
    translateY: back ? -y / 2 : y / 2,
    opacity: 1,
  }, 0);
};

const skipAnimation = () => {
  if (timeline && !timeline.paused) {
    timeline.seek(timeline.duration);
    timeline = undefined;
  }
};

const isBack = () => back;

defineExpose({playAnimation, skipAnimation, isBack});
</script>
