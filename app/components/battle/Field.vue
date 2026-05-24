<template>
  <div class="flex w-full px-4 justify-around relative" :class="isSingles && 'gap-8'">
    <template v-for="(player, id) in players.items" :key="id">
      <div
        v-if="player.bp"
        class="relative"
        :class="id !== perspective ? 'order-2' : 'pt-10 sm:pt-14'"
      >
        <div
          class="absolute pt-20 sm:pt-30 overflow-hidden z-1000"
          :class="id !== perspective ? '-right-8 sm:-right-12' : '-left-8 sm:-left-12'"
        >
          <AbilityDisplay ref="abilityDisplays" :invert="id !== perspective" :player-id="id" />
        </div>

        <div class="flex gap-2 sm:gap-4" :class="id !== perspective && 'flex-row-reverse'">
          <ActivePokemon
            v-for="(poke, i) in player.bp.active"
            :key="i"
            ref="activePokemon"
            :class="(id !== perspective ? i === 0 : i !== 0) && 'pt-2 sm:pt-4'"
            :poke
            :back="id === perspective"
            :poke-id="`${id}:${i}`"
            :player
            :is-singles
            :weather
          />

          <ActivePokemon
            v-if="!isSingles && player.bp.active.length < 2"
            :class="id === perspective && 'pt-2 sm:pt-4'"
            :poke-id="`${id}:${1}`"
            :player
            :is-singles
            :weather
          />
        </div>
        <div class="relative flex justify-center w-full">
          <div
            class="absolute bottom-4 sm:bottom-8 bg-accented w-[115%] h-10 sm:h-16 rounded-[100%] flex justify-center border-2 border-inverted/20"
            :class="isSingles && 'w-full'"
          />

          <img
            v-if="(player.bp.hazards.spikes || 0) >= 1"
            class="absolute size-4 sm:size-7 bottom-10 sm:bottom-14 opacity-80 pointer-events-none"
            src="/caltrop.svg"
          />

          <img
            v-if="(player.bp.hazards.spikes || 0) >= 2"
            class="absolute size-4 sm:size-7 bottom-11 sm:bottom-16 right-10 opacity-80 pointer-events-none"
            src="/caltrop.svg"
          />

          <img
            v-if="(player.bp.hazards.spikes || 0) >= 3"
            class="absolute size-4 sm:size-7 bottom-11 sm:bottom-16 left-10 opacity-80 pointer-events-none"
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
import type {AnimationPlaybackControls, AnimationPlaybackControlsWithThen} from "motion-v";

const {players, perspective} = defineProps<{
  players: Players;
  perspective: PlayerId;
  isSingles: boolean;
  weather?: Weather;
}>();

const activePokemon = useTemplateRef("activePokemon");
const abilityDisplays = useTemplateRef("abilityDisplays");

const animations: AnimationPlaybackControls[] = [];

const playAnimation = (id: PokeId, params: AnimationParams) => {
  const component = activePokemon.value?.find(a => a?.getId() === id);
  return anim(component && component.playAnimation(params));
};

const displayAbility = async (ev: UIBattleEvent & {type: "proc_ability"}) => {
  const component = abilityDisplays.value?.find(a => a?.getId() === playerId(ev.src));
  const poke = players.poke(ev.src)!;
  const left = playerId(ev.src) === perspective;
  return anim(
    component &&
      component.playSlideIn(
        poke.base.name,
        poke.v.speciesId,
        poke.v.form,
        abilityList[ev.ability].name,
        left,
      ),
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

defineExpose({playAnimation, displayAbility, skipAnimations});
</script>
