<template>
  <div class="flex gap-2" :class="reverse && 'flex-row-reverse'">
    <div class="flex flex-col gap-1" :class="reverse && 'items-end'">
      <div class="flex items-center text-xs sm:text-sm">
        <!-- player.nPokemon - player.nFainted | i < players[id].nPokemon | Icon ternary keeps causing problems -->

        <template v-if="nPokemon <= 6">
          <UIcon
            v-for="i in nPokemon - nFainted"
            :key="i"
            name="ic:baseline-catching-pokemon"
            class="bg-primary dark:bg-inverted"
          />
          <UIcon
            v-for="i in nFainted"
            :key="i"
            name="tabler:pokeball-off"
            class="bg-primary dark:bg-inverted"
          />
          <UIcon
            v-for="i in 6 - nPokemon"
            :key="i"
            name="ci:dot-03-m"
            class="bg-primary dark:bg-inverted"
          />
        </template>
        <template v-else>
          <UIcon name="ic:baseline-catching-pokemon" class="bg-primary dark:bg-inverted" />
          <span class="text-sm font-medium text-muted pr-1">
            <UIcon name="lucide-x text-xs" />{{ nPokemon }}
          </span>

          <UIcon name="tabler:pokeball-off" class="bg-primary dark:bg-inverted" />
          <span class="text-sm font-medium text-muted">
            <UIcon name="lucide-x text-xs" />{{ nFainted }}
          </span>
        </template>
      </div>

      <div
        class="text-xs pr-0.5 pb-1 font-semibold flex gap-1"
        :class="reverse && 'flex-row-reverse'"
      >
        {{ player?.name ?? "Loading..." }}

        <div
          v-if="(time = timeLeft())"
          :key="updateMarker"
          class="flex items-center"
          :class="[time.red ? 'text-error' : 'text-muted']"
        >
          (<UIcon class="mr-0.5" name="material-symbols:alarm-outline" /> {{ time.time }})
        </div>
      </div>
    </div>

    <template v-for="(screen, name) in player?.screens">
      <TouchTooltip v-if="screen && screens[name]" :key="name" :text="screens[name].name">
        <UIcon
          :name="screens[name].icon"
          :class="[screens[name].clazz, reverse && 'transform scale-x-[-1]']"
        />
      </TouchTooltip>
    </template>
  </div>
</template>

<script setup lang="ts">
import type {ScreenId} from "~~/game/utils";

const {player, reverse} = defineProps<{player?: ClientPlayer; reverse?: bool}>();

const nPokemon = computed(() => player?.nPokemon ?? 6);
const nFainted = computed(() => player?.nFainted ?? 0);

const updateMarker = ref(0);

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
</script>
