<template>
  <div class="flex gap-2" :class="reverse && 'flex-row-reverse'">
    <div class="flex flex-col gap-1" :class="reverse && 'items-end'">
      <div v-if="!showTeamPreview" class="flex items-center">
        <TouchPopover
          v-for="(poke, i) in player?.bp?.team ?? []"
          :key="i"
          :disabled="!isRevealed(poke)"
        >
          <div class="relative flex items-center justify-center -ml-1">
            <UIcon
              :class="isRevealed(poke) && 'invisible'"
              class="absolute bg-primary size-3 sm:size-3.5 dark:bg-inverted"
              name="ic:baseline-catching-pokemon"
            />

            <BoxSprite
              :class="!poke.hp && 'opacity-25'"
              :species-id="isRevealed(poke) ? poke.speciesId : ''"
              :form="poke.form"
              :scale="lessThanSm ? 0.7 : 1"
            />
          </div>

          <template v-if="isRevealed(poke)" #content>
            <UnknownPokeTTContent :poke="new Battlemon(poke, player!.bp!, 0)" />
          </template>
        </TouchPopover>

        <div
          v-for="i in 6 - (player?.nPokemon ?? 6)"
          :key="i"
          class="relative flex items-center justify-center -ml-1"
        >
          <UIcon
            class="absolute bg-primary size-3 sm:size-3.5 dark:bg-inverted"
            name="ci:dot-03-m"
          />
          <BoxSprite class="invisible" :scale="lessThanSm ? 0.7 : 1" />
        </div>
      </div>

      <div
        class="text-xs pr-0.5 pb-1 font-semibold flex gap-1 items-center"
        :class="reverse && 'flex-row-reverse'"
      >
        <span :class="player?.admin && 'text-amber-300'">{{ player?.name ?? "Loading..." }}</span>

        <div
          v-if="(time = timeLeft())"
          :key="updateMarker"
          class="flex items-center"
          :class="[time.red ? 'text-error' : 'text-muted']"
        >
          (<UIcon class="mr-0.5" name="material-symbols:alarm-outline" /> {{ time.time }})
        </div>

        <template v-for="(screen, name) in player?.bp?.screens">
          <TouchTooltip v-if="screen && screens[name]" :key="name" :text="screens[name].name">
            <UIcon
              :name="screens[name].icon"
              :class="[screens[name].clazz, reverse && 'transform scale-x-[-1]']"
            />
          </TouchTooltip>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {ScreenId} from "~~/game/utils";
import type {Pokemon} from "~~/game/pokemon";
import {breakpointsTailwind} from "@vueuse/core";
import {Battlemon} from "~~/game/active";

const {player, reverse} = defineProps<{
  player?: ClientPlayer;
  reverse?: boolean;
  showTeamPreview?: boolean;
}>();

const updateMarker = ref(0);
const lessThanSm = useBreakpoints(breakpointsTailwind).smaller("sm");
const mgr = injectManager();

useIntervalFn(() => updateMarker.value++, 1000);

const screens: Partial<Record<ScreenId, {clazz: string; icon: string; name: string}>> = {
  tailwind: {clazz: "text-sky-400", icon: "mdi:weather-windy", name: "Tailwind"},
  luckychant: {clazz: "text-lime-400", icon: "mdi:clover", name: "Lucky Chant"},
};

let time: ReturnType<typeof timeLeft>;

const timeLeft = () => {
  if (!player?.time || reverse) {
    return;
  }

  const secs = Math.max(
    Math.floor((player.time.startedAt + player.time.duration - Date.now()) / 1000),
    0,
  );

  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return {
    red: secs <= 10,
    time: `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
  };
};

const isRevealed = (poke: Pokemon) => mgr && !mgr.isUnknown(poke);
</script>
