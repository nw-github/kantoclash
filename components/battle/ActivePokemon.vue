<template>
  <div class="w-full flex flex-col items-center">
    <div
      class="w-11/12 sm:w-3/4 flex flex-col gap-0.5 sm:gap-1 text-sm z-30"
      :class="{invisible: !poke || poke.hidden}"
    >
      <div class="flex justify-between flex-col sm:flex-row">
        <span class="font-bold flex items-center">
          {{ poke?.name ?? "--" }}
          <!-- @vue-expect-error -->
          <GenderIcon class="size-4" :gender="poke?.gender ?? gen1Gender[poke?.speciesId]" />
        </span>
        <span class="text-[0.75rem] sm:text-sm">Lv. {{ poke?.level ?? 100 }}</span>
      </div>
      <div class="relative overflow-hidden rounded-md bg-[#333] flex">
        <div class="hp-fill absolute h-full rounded-md" />
        <div class="w-full text-center text-gray-100 text-xs sm:text-sm z-30">{{ hp }}%</div>
      </div>
      <div class="relative">
        <div v-if="poke" class="flex gap-1 flex-wrap absolute *:px-[0.2rem] *:py-[0.1rem]">
          <UBadge v-if="poke.transformed" color="black">Transformed</UBadge>

          <TypeBadge
            v-if="poke.v.charging"
            :type="gen.moveList[poke.v.charging].type"
            :label="gen.moveList[poke.v.charging].name"
          />

          <template v-if="!species!.types.every((ty, i) => ty === poke.v.types?.[i])">
            <TypeBadge v-for="type in poke.v.types" :key="type" :type="type" />
          </template>

          <UBadge v-if="poke.v.status" :style="{backgroundColor: statusColor[poke.v.status]}">
            {{ poke.v.status.toUpperCase() }}
          </UBadge>

          <UBadge v-if="poke.v.perishCount" color="red"> Perish: {{ poke.v.perishCount }} </UBadge>

          <template v-for="{name, color, flag} in badges">
            <UBadge v-if="((poke.v.flags ?? 0) & flag) !== 0" :key="flag" :color :label="name" />
          </template>

          <template v-for="(val, stage) in poke.v.stages">
            <UBadge v-if="val" :key="stage" :class="val > 0 ? 'up' : 'down'">
              {{ roundTo(stageMultipliers[val] / 100, 2) }}x {{ statShortName[stage] }}
            </UBadge>
          </template>
        </div>
      </div>
    </div>

    <div class="flex flex-col items-center relative">
      <div class="w-[128px] h-[117px] sm:w-[256px] sm:h-[234px] items-center justify-center flex">
        <UPopover mode="hover" :popper="{placement: 'top'}">
          <div ref="sprite" class="sprite z-20" :class="{back, front: !back, invisible: !poke}">
            <Sprite
              :species="poke?.transformed ?? poke?.speciesId"
              :substitute="((poke?.v.flags || 0) & VolatileFlag.substitute) !== 0"
              :scale="lessThanSm ? 1 : 2"
              :shiny="poke?.shiny"
              :back
            />
          </div>

          <template v-if="poke && !poke.hidden" #panel>
            <div class="p-2">
              <PokemonTTContent v-if="base && !poke.transformed" :poke="base" :active="poke" />
              <div v-else class="flex flex-col gap-5 items-center">
                <div class="flex gap-10">
                  <span>
                    {{ species!.name }}
                    <span v-if="poke.transformed">
                      (Was: {{ gen.speciesList[poke.speciesId].name }})
                    </span>
                  </span>
                  <div class="flex gap-1">
                    <TypeBadge v-for="type in species!.types" :key="type" :type image />
                  </div>
                </div>

                <span class="italic text-center">{{ minSpe }} to {{ maxSpe }} Spe</span>
              </div>
            </div>
          </template>
        </UPopover>
      </div>

      <div
        ref="ground"
        class="absolute bottom-4 sm:bottom-8 bg-gray-200 dark:bg-gray-600 h-10 w-20 sm:h-16 sm:w-40 rounded-[100%]"
      />

      <div ref="pokeBall" class="pokeball absolute size-[42px] z-10 opacity-0" />
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
  background-color: v-bind("poke?.v.status ? statusColor[poke.v.status] : 'transparent'");
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
import {stageMultipliers, VolatileFlag} from "~/game/utils";
import {calcStat, type Gender, type Pokemon} from "~/game/pokemon";
import type {MoveId} from "~/game/moves";
import {breakpointsTailwind} from "@vueuse/core";
import type {Generation} from "~/game/gen1";
import type {SpeciesId} from "~/game/species";

const {poke, base, back, gen} = defineProps<{
  poke?: ClientActivePokemon;
  base?: Pokemon;
  back?: boolean;
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

const gen1Gender: Partial<Record<SpeciesId, Gender>> = {
  "nidoran-f": "female",
  "nidoran-m": "male",
};

const offsX = (number: number) => `-${number * 42 - number}px`;
const offsY = (number: number) => `-${number * 42 - number * 2}px`;

/*
"red" | "pink" | "emerald" | "teal" | "lime" | "gray" | "black" | "sky" | "white" | "green" |
"orange" | "amber" | "yellow" | "cyan" | "blue" | "indigo" | "violet" | "purple" | "fuchsia" |
"rose" | "primary"
*/
const badges = [
  {flag: VolatileFlag.confused, color: "red", name: "Confused"},
  {flag: VolatileFlag.disabled, color: "red", name: "Disable"},
  {flag: VolatileFlag.attract, color: "pink", name: "Attract"},
  {flag: VolatileFlag.focus, color: "emerald", name: "Focus Energy"},
  {flag: VolatileFlag.light_screen, color: "pink", name: "Light Screen"},
  {flag: VolatileFlag.reflect, color: "pink", name: "Reflect"},
  {flag: VolatileFlag.mist, color: "teal", name: "Mist"},
  {flag: VolatileFlag.seeded, color: "lime", name: "Leech Seed"},
  {flag: VolatileFlag.destinyBond, color: "gray", name: "Destiny Bond"},
  {flag: VolatileFlag.protect, color: "black", name: "Protect"},
  {flag: VolatileFlag.endure, color: "black", name: "Endure"},
  {flag: VolatileFlag.encore, color: "sky", name: "Encore"},
  {flag: VolatileFlag.meanLook, color: "red", name: "Can't Escape"},
  {flag: VolatileFlag.nightmare, color: "black", name: "Nightmare"},
  {flag: VolatileFlag.foresight, color: "violet", name: "Foresight"},
  {flag: VolatileFlag.lockon, color: "red", name: "Locked Onto"},
] as const;

export type AnimationType =
  | "faint"
  | "sendin"
  | "retract"
  | "get_sub"
  | "lose_sub"
  | "phaze"
  | MoveId;

const rem = (rem: number) => parseFloat(getComputedStyle(document.documentElement).fontSize) * rem;

let timeline: anime.AnimeTimelineInstance | undefined;
const playAnimation = (anim: AnimationType, name?: string, cb?: () => void) => {
  return new Promise<void>(resolve => {
    const other = document.querySelector(`.sprite${back ? ".front" : ".back"}`)!;
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
        translateY: {value: rem(7), duration: 250},
        easing: "easeInExpo",
        opacity: 0,
        complete: () => {
          useAnime.set(sprite.value!, {translateX: 0, translateY: 0, scale: 1});
          resolve();
        },
      });
    } else if (anim === "sendin") {
      reset(false);
      useAnime.set(pokeBall.value, {translateX: 0, translateY: 0, rotateZ: 0});

      const pbRect = pokeBall.value.getBoundingClientRect();
      const sprRect = sprite.value.getBoundingClientRect();
      const gRect = ground.value!.getBoundingClientRect();
      const myCenterX = sprRect.left + sprRect.width / 2;
      const myCenterY = sprRect.top + sprRect.height / 2;
      const [x, y] = relativePos(pbRect, myCenterX, myCenterY);
      const startX = relativePos(
        pbRect,
        back ? gRect.left - rem(1.25) : gRect.right + rem(1),
        0,
      )[0];
      const endX = back ? x - 15 : x - 10;

      pbRow.value = 0;
      timeline.add({
        targets: pokeBall.value,
        translateX: [
          {value: startX, duration: 0},
          {value: endX, duration: 700, easing: "linear"},
        ],
        translateY: [
          {value: y - 10, duration: 0},
          {value: y - 60, duration: 450, easing: "easeOutQuad"},
          {value: y, duration: 250, easing: "easeInQuad"},
        ],
        rotateZ: {value: 360 * 4 * (back ? 1 : -1), duration: 800, easing: "linear"},
        opacity: [
          {value: 100, duration: 800},
          {value: 0, duration: 0},
        ],
        complete: cb,
      });
      timeline.add({
        targets: sprite.value,
        easing: "easeOutExpo",
        opacity: 1,
        scale: [{value: 0, duration: 0}, {value: 1}],
        duration: 800,
        complete: () => resolve(),
      });
    } else if (anim === "retract") {
      if (((poke?.v.flags || 0) & VolatileFlag.substitute) === 0) {
        reset(true);
      }
      useAnime.set(pokeBall.value, {translateX: 0, translateY: 0, opacity: 1});

      const sprRect = sprite.value.getBoundingClientRect();
      const pbRect = pokeBall.value.getBoundingClientRect();
      const gRect = ground.value!.getBoundingClientRect();

      const [x, y] = relativePos(
        pbRect,
        gRect.left + gRect.width / 2,
        gRect.top + rem(lessThanSm.value ? 3 : 0),
      );
      const [_, sprY] = relativePos(sprRect, 0, gRect.top - rem(lessThanSm.value ? 1.2 : 2.8));

      pbRow.value = 10;

      timeline.add({
        targets: pokeBall.value,
        easing: "steps(2)",
        translateX: [{value: x - pbRect.width / 2, duration: 0}],
        translateY: [{value: y, duration: 0}],
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
      // preload the substitute graphic
      const img = new Image();
      img.src = `/sprites/battle/${back ? "back/" : ""}substitute.gif`;

      const sprRect = sprite.value.getBoundingClientRect();
      const groundRect = ground.value!.getBoundingClientRect();
      const [_, sprY] = relativePos(sprRect, 0, groundRect.top - sprRect.height / 2);

      timeline.add({
        targets: sprite.value,
        duration: 1000,
        easing: "easeInExpo",
        opacity: 0,
        translateY: [{value: 0, duration: 500}],
        complete: cb,
      });
      timeline.add({
        targets: sprite.value,
        duration: 250,
        translateY: [
          {value: -rem(8), duration: 0},
          {value: sprY, duration: 250},
        ],
        easing: "easeOutBounce",
        opacity: {value: 1, duration: 0},
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
          useAnime.set(sprite.value!, {translateY: 0});
        },
      });
      timeline.add({
        targets: sprite.value,
        duration: 750,
        easing: "easeInExpo",
        opacity: 1,
        complete: () => resolve(),
      });
    } else if (anim === "phaze") {
      timeline.add({
        targets: sprite.value,
        duration: 450,
        translateX: [{value: back ? -120 : 120, easing: "easeOutQuart"}],
        opacity: [{value: 0, easing: "easeOutExpo"}],
        complete: () => {
          useAnime.set(sprite.value!, {translateX: 0, translateY: 0, scale: 1});
          resolve();
        },
      });
    } else if (gen.moveList[anim].kind !== "damage") {
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
        translateX: {value: x, duration, easing: "linear"},
        translateY: [
          {value: midYRel, duration: duration * (3 / 4), easing: "easeOutQuart"},
          {value: y, duration: duration * (1 / 4), easing: "easeInQuart"},
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
    useAnime.set(sprite.value, {opacity: +visible, translateX: 0, translateY: 0, scale: 1});
  }
};

const skipAnimation = () => {
  if (timeline && !timeline.paused) {
    timeline.seek(timeline.duration);
    timeline = undefined;
  }
};

defineExpose({playAnimation, skipAnimation, reset});
</script>
