<template>
  <div class="w-full flex flex-col items-center">
    <div
      class="w-11/12 sm:w-3/4 flex flex-col gap-0.5 sm:gap-1 text-sm z-30"
      :class="{ invisible: !poke || poke.hidden }"
    >
      <div class="flex justify-between flex-col sm:flex-row">
        <span class="font-bold">{{ poke?.name ?? "--" }}</span>
        <span v-if="poke" class="text-[0.75rem] sm:text-sm">Lv. {{ poke.level }}</span>
      </div>
      <div class="relative overflow-hidden rounded-md bg-[#333] flex">
        <div class="hp-fill absolute h-full rounded-md" />
        <div class="w-full text-center text-gray-100 text-xs sm:text-sm z-30">{{ hp }}%</div>
      </div>
      <div class="relative">
        <div v-if="poke" class="flex gap-1 flex-wrap absolute *:px-[0.2rem] *:py-[0.1rem]">
          <UBadge v-if="poke.transformed" color="black">Transformed</UBadge>

          <TypeBadge
            v-if="poke.charging"
            :type="moveList[poke.charging].type"
            :label="moveList[poke.charging].name"
          />

          <template v-if="!species!.types.every((ty, i) => ty === poke!.conversion?.[i])">
            <TypeBadge v-for="type in poke.conversion" :key="type" :type="type" />
          </template>

          <UBadge v-if="poke.status" :style="{ backgroundColor: statusColor[poke.status] }">
            {{ poke.status.toUpperCase() }}
          </UBadge>

          <template v-for="(value, flag) in poke.flags">
            <UBadge v-if="value && flag !== 'substitute'" :key="flag" :color="flagInfo[flag].color">
              {{ flagInfo[flag].name }}
            </UBadge>
          </template>

          <template v-for="(val, stage) in poke.stages">
            <UBadge v-if="val" :key="stage" :class="val > 0 ? 'up' : 'down'">
              {{ roundTo(stageMultipliers[val] / 100, 2) }}x {{ toTitleCase(stage) }}
            </UBadge>
          </template>
        </div>
      </div>
    </div>

    <div class="flex flex-col items-center">
      <div class="w-[128px] h-[117px] sm:w-[256px] sm:h-[234px] items-center justify-center flex">
        <UPopover mode="hover" :popper="{ placement: 'top' }">
          <div ref="sprite" class="sprite z-20" :class="{ back, front: !back, invisible: !poke }">
            <Sprite
              :species="species"
              :substitute="poke?.flags.substitute"
              :kind="back ? 'back' : 'front'"
              :scale="lessThanSm ? 1 : 2"
            />
          </div>

          <template v-if="poke" #panel>
            <div class="p-2">
              <template v-if="base && !poke.transformed">
                <PokemonTTContent :poke="base" :active="poke" />
              </template>
              <template v-else>
                <div class="flex flex-col gap-5">
                  <div class="flex justify-between space-x-4">
                    <span>
                      {{ species!.name }}
                      <span v-if="poke.transformed">
                        (Was: {{ speciesList[poke.speciesId].name }})
                      </span>
                    </span>
                    <div class="flex space-x-1">
                      <TypeBadge v-for="type in species!.types" :key="type" :type="type" />
                    </div>
                  </div>

                  <span class="italic text-center">{{ minSpe }} to {{ maxSpe }} Spe</span>
                </div>
              </template>
            </div>
          </template>
        </UPopover>
      </div>

      <div class="relative flex justify-center">
        <div
          ref="ground"
          class="absolute bottom-4 sm:bottom-8 bg-gray-200 dark:bg-gray-600 h-10 w-20 sm:h-16 sm:w-40 rounded-[100%]"
        />
      </div>

      <div ref="pokeBall" class="pokeball absolute w-[42px] h-[42px] z-10 opacity-0" />
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

.status {
  background-color: v-bind("poke?.status ? statusColor[poke.status] : 'transparent'");
}

.down {
  background-color: var(--stat-down);
}

.up {
  background-color: var(--stat-up);
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
</style>

<script setup lang="ts">
import { stageMultipliers } from "@/game/utils";
import { calcStat, type Pokemon } from "@/game/pokemon";
import { speciesList } from "@/game/species";
import { moveList, type MoveId } from "@/game/moveList";
import tailwindColors from "tailwindcss/colors";
import { breakpointsTailwind } from "@vueuse/core";

const props = defineProps<{ poke?: ClientActivePokemon; base?: Pokemon; back?: boolean }>();
const species = computed(
  () => props.poke && speciesList[props.poke.transformed ?? props.poke.speciesId],
);
const minSpe = computed(
  () => props.poke && calcStat(false, species.value!.stats.spe, props.poke.level, 0, 0),
);
const maxSpe = computed(
  () => props.poke && calcStat(false, species.value!.stats.spe, props.poke.level, 15, 65535),
);
const hp = computed(() => props.poke?.hpPercent ?? 0);
const breakpoint = useBreakpoints(breakpointsTailwind);
const lessThanSm = breakpoint.smaller("sm");

const sprite = ref<HTMLDivElement>();
const pokeBall = ref<HTMLDivElement>();
const ground = ref<HTMLDivElement>();
const pbRow = ref(0);
const pbCol = ref(3);

const hpColor = (percent: number) => {
  const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

  // https://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript/54070620#54070620
  const rgb2hsv = (r: number, g: number, b: number) => {
    const v = Math.max(r, g, b);
    const c = v - Math.min(r, g, b);
    const h = c && (v == r ? (g - b) / c : v == g ? 2 + (b - r) / c : 4 + (r - g) / c);
    return { h: 60 * (h < 0 ? h + 6 : h), s: v && c / v, v };
  };

  const hsv2rgb = (h: number, s: number, v: number) => {
    const f = (n: number, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1)];
  };

  const hexrgb2hsv = (hex: string) => {
    hex = hex.slice(1);
    return rgb2hsv(
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4), 16),
    );
  };

  const red = hexrgb2hsv(tailwindColors.red[800]);
  const yellow = hexrgb2hsv(tailwindColors.yellow[600]);
  const green = hexrgb2hsv(tailwindColors.lime[700]);
  const div = 50;
  if (percent >= div) {
    const [r, g, b] = hsv2rgb(
      lerp(yellow.h, green.h, (percent - div) / (100 - div)),
      lerp(yellow.s, green.s, (percent - div) / (100 - div)),
      lerp(yellow.v, green.v, (percent - div) / (100 - div)),
    );
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const [r, g, b] = hsv2rgb(
      lerp(red.h, yellow.h, percent / div),
      lerp(red.s, yellow.s, percent / div),
      lerp(red.v, yellow.v, percent / div),
    );
    return `rgb(${r}, ${g}, ${b})`;
  }
};

const offsX = (number: number) => `-${number * 42 - number}px`;
const offsY = (number: number) => `-${number * 42 - number * 2}px`;

const flagInfo = {
  confused: { color: "red", name: "Confused" },
  disabled: { color: "red", name: "Disable" },
  focus: { color: "emerald", name: "Focus Energy" },
  light_screen: { color: "pink", name: "Light Screen" },
  reflect: { color: "pink", name: "Reflect" },
  mist: { color: "teal", name: "Mist" },
  seeded: { color: "lime", name: "Leech Seed" },
} as const;

export type AnimationType = "faint" | "sendin" | "retract" | "get_sub" | "lose_sub" | MoveId;

const remToPx = (rem: number) =>
  parseFloat(getComputedStyle(document.documentElement).fontSize) * rem;

let timeline: anime.AnimeTimelineInstance;
const playAnimation = (anim: AnimationType, name?: string, cb?: () => void) => {
  return new Promise<void>(resolve => {
    const other = document.querySelector(`.sprite${props.back ? ".front" : ".back"}`)!;
    if (!sprite.value || !pokeBall.value) {
      return;
    }

    const relativePos = (src: DOMRect, x: number, y: number) => [x - src.left, y - src.top];

    pbCol.value = name ? [...name].reduce((acc, x) => x.charCodeAt(0) + acc, 0) % 17 : 3;

    skipAnimation();
    timeline = useAnime.timeline();
    if (anim === "faint") {
      timeline.add({
        targets: sprite.value,
        duration: 250,
        translateY: { value: remToPx(8), duration: 250 },
        easing: "easeInExpo",
        opacity: 0,
        complete: () => {
          useAnime.set(sprite.value!, { translateX: 0, translateY: 0, scale: 0 });
          resolve();
        },
      });
    } else if (anim === "sendin") {
      useAnime.set(sprite.value, { opacity: 0, translateX: 0, translateY: 0, scale: 0 });
      useAnime.set(pokeBall.value, { translateX: 0, translateY: 0, rotateZ: 0 });

      const pbRect = pokeBall.value.getBoundingClientRect();
      const sprRect = sprite.value.getBoundingClientRect();
      const myCenterX = sprRect.left + sprRect.width / 2;
      const myCenterY = sprRect.top + sprRect.height / 2;
      const [x, y] = relativePos(pbRect, myCenterX, myCenterY);

      const startX = props.back
        ? relativePos(pbRect, sprRect.left - 80, 0)[0]
        : relativePos(pbRect, sprRect.right + 40, 0)[0];
      const endX = props.back ? x - 15 : x - 10;

      pbRow.value = 0;
      timeline.add({
        targets: pokeBall.value,
        translateX: [
          { value: startX, duration: 0 },
          { value: endX, duration: 700, easing: "linear" },
        ],
        translateY: [
          { value: y - 10, duration: 0 },
          { value: y - 60, duration: 450, easing: "easeOutQuad" },
          { value: y, duration: 250, easing: "easeInQuad" },
        ],
        rotateZ: { value: 360 * 4 * (props.back ? 1 : -1), duration: 800, easing: "linear" },
        opacity: [
          { value: 100, duration: 800 },
          { value: 0, duration: 0 },
        ],
        complete: cb,
      });
      timeline.add({
        targets: sprite.value,
        easing: "easeOutExpo",
        opacity: 1,
        scale: [{ value: 0, duration: 0 }, { value: 1 }],
        duration: 800,
        complete: () => resolve(),
      });
    } else if (anim === "retract") {
      if (!props.poke?.flags.substitute) {
        reset(true);
      }
      useAnime.set(pokeBall.value, { translateX: 0, translateY: 0, opacity: 1 });

      const sprRect = sprite.value.getBoundingClientRect();
      const pbRect = pokeBall.value.getBoundingClientRect();
      const gRect = ground.value!.getBoundingClientRect();

      const [x, y] = relativePos(
        pbRect,
        gRect.left + gRect.width / 2,
        gRect.top + remToPx(lessThanSm.value ? 3 : 0),
      );
      const [_, sprY] = relativePos(sprRect, 0, gRect.top - remToPx(lessThanSm.value ? 1.2 : 2.8));

      pbRow.value = 10;

      timeline.add({
        targets: pokeBall.value,
        easing: "steps(2)",
        translateX: [{ value: x - pbRect.width / 2, duration: 0 }],
        translateY: [{ value: y, duration: 0 }],
        duration: 800,
      });
      timeline.add(
        {
          targets: sprite.value,
          easing: "easeOutQuart",
          scale: 0.45,
          opacity: [{ value: 0, easing: "easeInCubic" }],
          translateY: sprY,
          duration: 550,
        },
        0,
      );
      timeline.add({
        targets: pokeBall.value,
        opacity: 0,
        duration: 300,
        easing: "linear",
        begin: () => (pbRow.value = 9),
        complete: () => resolve(),
      });
    } else if (anim === "get_sub") {
      const sprRect = sprite.value.getBoundingClientRect();
      const groundRect = ground.value!.getBoundingClientRect();
      const [_, sprY] = relativePos(sprRect, 0, groundRect.top - sprRect.height / 2);

      timeline.add({
        targets: sprite.value,
        duration: 1000,
        easing: "easeInExpo",
        opacity: 0,
        translateY: [{ value: 0, duration: 500 }],
        complete: cb,
      });
      timeline.add({
        targets: sprite.value,
        duration: 250,
        translateY: [
          { value: -remToPx(8), duration: 0 },
          { value: sprY, duration: 250 },
        ],
        easing: "easeOutBounce",
        opacity: { value: 1, duration: 0 },
        complete: () => resolve(),
      });
    } else if (anim === "lose_sub") {
      timeline.add({
        targets: sprite.value,
        duration: 750,
        easing: "easeInExpo",
        opacity: 0,
        complete: () => {
          cb!();
          useAnime.set(sprite.value!, { translateY: 0 });
        },
      });
      timeline.add({
        targets: sprite.value,
        duration: 750,
        easing: "easeInExpo",
        opacity: 1,
        complete: () => resolve(),
      });
    } else if (!moveList[anim].power) {
      return resolve();
    } else {
      const sprRect = sprite.value.getBoundingClientRect();
      const oppRect = other.getBoundingClientRect();

      const [x, y] = relativePos(sprRect, oppRect.x, oppRect.y);
      const midYRel = oppRect.top < sprRect.top ? y - 50 : -50;
      const duration = 240;
      let ran = false;
      timeline.direction = "alternate";
      timeline.add({
        targets: sprite.value,
        translateX: { value: x, duration, easing: "linear" },
        translateY: [
          { value: midYRel, duration: duration * (3 / 4), easing: "easeOutQuart" },
          { value: y, duration: duration * (1 / 4), easing: "easeInQuart" },
        ],
        loopComplete: () => {
          if (!ran && cb) {
            cb();
            ran = true;
          }
        },
        complete: () => resolve(),
      });
      return;
    }

    timeline.play();
  });
};

const reset = (visible: boolean) => {
  if (sprite.value) {
    useAnime.set(sprite.value, { opacity: +visible, translateX: 0, translateY: 0, scale: 1 });
  }
};

const skipAnimation = () => {
  if (timeline && !timeline.paused) {
    timeline.seek(timeline.duration);
  }
};

defineExpose({ playAnimation, skipAnimation, reset });
</script>
