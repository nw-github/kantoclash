<template>
  <div class="flex w-full px-4 pb-4 justify-around relative" :class="isSingles && 'gap-8'">
    <template v-for="(player, id) in players.items" :key="id">
      <div
        v-if="player.bp"
        class="flex flex-col items-center"
        :class="id !== perspective ? 'order-2' : 'pt-10 sm:pt-14'"
      >
        <div
          class="absolute pt-20 sm:pt-30 overflow-hidden z-1000"
          :class="id !== perspective ? 'right-0 sm:right-4' : 'left-0 sm:left-4'"
        >
          <AbilityDisplay ref="abilityDisplays" :invert="id !== perspective" :player-id="id" />
        </div>

        <div
          class="flex justify-center gap-2 sm:gap-4"
          :class="id !== perspective && 'flex-row-reverse'"
        >
          <CanvasSprite
            v-if="id !== perspective"
            ref="trainerSprite"
            v-model:frame="trainerAnim.frame"
            class="absolute z-50 h-24 sm:h-40 opacity-0 pointer-events-none touch-none select-none"
            :class="isSingles ? 'bottom-[25%]' : 'bottom-[35%]'"
            :loop="false"
            :src="trainerAnim.src"
            :tint="trainerAnim.tint"
            :paused="trainerAnim.paused"
          />

          <div
            v-for="(poke, i) in player.bp.active"
            :key="i"
            class="w-full flex flex-col items-center relative h-32 sm:h-48"
            :class="(id !== perspective ? i === 0 : i !== 0) && 'pt-2 sm:pt-4'"
          >
            <StatusBar :poke :is-singles />

            <ActivePokemon
              ref="battlers"
              class="absolute z-20"
              :class="
                (!isSingles && id !== perspective ? i === 0 : i !== 0)
                  ? '-bottom-7 sm:-bottom-12'
                  : '-bottom-6 sm:-bottom-10'
              "
              :poke
              :back="id === perspective"
              :poke-id="`${id}:${i}`"
              :player
              :weather
            />
          </div>
        </div>

        <div
          class="relative bg-accented h-10 sm:h-16 rounded-[100%] flex justify-center border-2 border-inverted/20"
          :class="isSingles ? 'w-full' : 'w-[115%]'"
        >
          <img
            v-if="(player.bp.hazards.spikes || 0) >= 1"
            class="absolute size-4 sm:size-7 bottom-[50%] opacity-80 pointer-events-none"
            src="/caltrop.svg"
          />

          <img
            v-if="(player.bp.hazards.spikes || 0) >= 2"
            class="absolute size-4 sm:size-7 bottom-[25%] right-[20%] opacity-80 pointer-events-none"
            src="/caltrop.svg"
          />

          <img
            v-if="(player.bp.hazards.spikes || 0) >= 3"
            class="absolute size-4 sm:size-7 bottom-[25%] left-[20%] opacity-80 pointer-events-none"
            src="/caltrop.svg"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type {ActivePokemon} from "#components";
import type {PlayerId, PokeId} from "~~/game/events";
import type {AnimationParams} from "./ActivePokemon.vue";
import {playerId, type Weather} from "~~/game/utils";
import {abilityList} from "~~/game/species";
import {animate, type AnimationPlaybackControlsWithThen, type Segment} from "motion-v";
import {Random} from "random";

const {players, perspective} = defineProps<{
  players: Players;
  perspective: PlayerId;
  isSingles: boolean;
  weather?: Weather;
}>();

const allTrainerSprites = Object.keys(import.meta.glob("~~/public/sprites/trainer/**/*.png")).map(
  trackToPath,
);

const battlers = useTemplateRef("battlers");
const abilityDisplays = useTemplateRef("abilityDisplays");

const animations: AnimationPlaybackControlsWithThen[] = [];

const trainerSprite = useTemplateRef("trainerSprite");
const trainerAnim = reactive({
  paused: true,
  frame: 0,
  tint: {r: 0, g: 0, b: 0, a: 0},
  src: allTrainerSprites[0],
});

const opp = computed(() => {
  return Object.entries(players.items).find(
    ([id, player]) => !player.isSpectator && id !== perspective,
  )?.[1];
});

watchImmediate(opp, opp => {
  if (opp) {
    // FIXME: this is kinda hacky, temporary until we allow choosing trainer sprite
    if (!opp.trainerSprite) {
      const it = !import.meta.dev && allTrainerSprites.find(item => item.includes(opp.name));
      opp.trainerSprite = it || new Random(opp.name + document.URL).choice(allTrainerSprites)!;
    }

    trainerAnim.src = opp.trainerSprite;
  }
});

const playAnimation = (id: PokeId, params: AnimationParams) => {
  const component = battlers.value?.find(a => a?.getId() === id);
  return anim(component && component.playAnimation(params));
};

const displayAbility = (ev: UIBattleEvent & {type: "proc_ability"}) => {
  const component = abilityDisplays.value?.find(a => a?.getId() === playerId(ev.src));
  const poke = players.poke(ev.src)!;
  return anim(
    component &&
      component.playSlideIn(
        poke.base.name,
        poke.v.speciesId,
        poke.v.form,
        abilityList[ev.ability].name,
      ),
  );
};

const playTrainerIntro = () => {
  const sprite = trainerSprite?.value?.[0];
  const canvas = sprite?.getCanvas();
  if (!canvas) {
    return;
  }

  trainerAnim.paused = true;
  trainerAnim.frame = 1;
  trainerAnim.tint.a = 255;
  return anim(
    animate([
      [canvas, {x: [0, 0], y: [0, 0], opacity: [1, 1]}, {at: 0, duration: ms(100)}],
      [trainerAnim.tint, {a: [255, 0]}, {duration: ms(500)}],
      onAnimComplete(new AnimCallback(() => (trainerAnim.paused = false))),
      [{dummy: 0}, {dummy: 0}, {duration: ms(sprite!.animDuration(500))}], // For some reason, these APNGs have a few frames at the end with huge delays
      [canvas, {x: rem(3), y: -rem(1), opacity: [1, 0]}, {duration: ms(500)}],
    ]),
  );
};

const skipAnimations = () => {
  animations.forEach(anim => anim.complete());
  animations.length = 0;
};

const anim = (anim: AnimationPlaybackControlsWithThen | null | undefined) => {
  if (!anim) {
    return;
  }
  animations.push(anim);

  const onFinish = () => {
    const idx = animations.indexOf(anim);
    if (idx !== -1) {
      animations.splice(idx, 1);
    }
  };

  anim.then(onFinish, onFinish);
  return anim;
};

const onAnimComplete = (cb: AnimCallback): Segment => {
  let once = false;
  let value = 0;
  const obj = {
    get value() {
      return value;
    },
    set value(v) {
      value = v;
      if (v !== 0 && !once) {
        cb.exec();
        once = true;
      }
    },
  };
  // XXX: For some reason motion decides to run animations with 0 duration at the start of the
  // sequence
  return [obj, {value: 5}, {duration: 0.015}];
};

defineExpose({playAnimation, displayAbility, skipAnimations, playTrainerIntro});
</script>
