<template>
  <UContainer class="h-screen py-6">
    <UCard class="h-full flex flex-col" :ui="{ body: { base: 'grow overflow-hidden' } }">
      <template #header>
        <nav class="flex justify-between">
          <UHorizontalNavigation class="hidden md:block" :links>
            <template #default="{ link, isActive }">
              <UTooltip
                :text="link.vs"
                :class="[link.vs && 'lg:inline-block', link.vs && links.length > 5 && 'hidden']"
              >
                <div
                  class="text-ellipsis whitespace-nowrap overflow-hidden"
                  :class="[link.vs && 'max-w-10 md:max-w-20 lg:max-w-36']"
                >
                  <span
                    class="text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"
                    :class="[isActive && 'text-gray-900 dark:text-white']"
                  >
                    {{ link.label }}
                  </span>
                </div>
              </UTooltip>
            </template>

            <template #icon="{ link, isActive }">
              <UTooltip :text="link.vs">
                <UIcon
                  :name="link.icon"
                  class="text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white size-5"
                  :class="[isActive && 'text-gray-900 dark:text-white']"
                />
              </UTooltip>
            </template>
          </UHorizontalNavigation>

          <UPopover class="block md:hidden" :popper="{ placement: 'bottom-start' }">
            <UButton icon="heroicons:bars-3-16-solid" variant="link" color="gray" />
            <template #panel>
              <UVerticalNavigation :links />
            </template>
          </UPopover>

          <div class="flex items-center space-x-3">
            <UTooltip v-if="!connected" text="Disconnected from server">
              <UIcon
                name="fluent:plug-disconnected-16-regular"
                class="animate-pulse size-5 bg-primary"
              />
            </UTooltip>
            <ColorScheme>
              <UButton
                color="gray"
                variant="ghost"
                :icon="
                  $colorMode.value === 'dark'
                    ? 'material-symbols:dark-mode'
                    : 'material-symbols:light-mode'
                "
                @click="$colorMode.preference = $colorMode.value === 'dark' ? 'light' : 'dark'"
              />
            </ColorScheme>
            <UPopover mode="click" :popper="{ placement: 'bottom-start' }">
              <ClientOnly>
                <UButton
                  :icon="
                    musicVol === 0
                      ? 'heroicons-outline:speaker-x-mark'
                      : 'heroicons-outline:speaker-wave'
                  "
                  variant="ghost"
                  color="gray"
                />
              </ClientOnly>
              <template #panel>
                <div class="p-4 w-80 space-y-2">
                  <div>
                    <span>Music</span>
                    <URange v-model="musicVol" :max="0.8" :step="0.005" />
                  </div>
                  <div>
                    <span>Sound Effects</span>
                    <URange v-model="sfxVol" :max="0.8" :step="0.005" />
                  </div>
                  <div v-if="currentTrack">
                    <span>Current Track</span>
                    <USelectMenu
                      v-model="currentTrack"
                      searchable
                      :options="musicTrackItems"
                      value-attribute="value"
                    />
                  </div>
                </div>
              </template>
            </UPopover>
            <AccountButton v-model:open="accountOpen" />
          </div>
        </nav>
      </template>

      <NuxtPage @request-login="accountOpen = true" />
    </UCard>
  </UContainer>

  <UNotifications />
  <MusicController />
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
</style>

<script setup lang="ts">
import { provideSSRWidth } from "@vueuse/core";
import type { RoomDescriptor } from "./server/utils/gameServer";

provideSSRWidth(768);

const { $conn } = useNuxtApp();
const { user } = useUserSession();
const musicVol = useMusicVolume();
const sfxVol = useSfxVolume();
const currentTrack = useCurrentTrack();
const musicTrackItems = allMusicTracks.map(track => ({
  label: musicTrackName(track),
  value: track,
}));
const connected = ref($conn.connected);
const accountOpen = ref(false);

const links = ref([
  {
    label: "Home",
    icon: "heroicons:home",
    to: "/",
  },
  {
    label: "Team Builder",
    icon: "famicons:hammer-outline",
    to: "/builder",
  },
]);

const roomToLink = (room: RoomDescriptor) => {
  return {
    label: formatInfo[room.format].name,
    icon: formatInfo[room.format].icon,
    to: "/room/" + room.id,
    vs: room.battlers.map(pl => pl.name).join(" vs. ") + " - " + formatInfo[room.format].name,
  };
};

const fetchMyRooms = () => {
  if (!user.value) {
    links.value.splice(2, links.value.length - 2);
    return;
  }

  $conn.emit("getPlayerRooms", user.value.id, rooms => {
    links.value.splice(2, links.value.length - 2);
    if (rooms !== "bad_player") {
      links.value.push(...rooms.map(roomToLink));
    }
  });
};

watch(
  () => useRoute().path,
  path => {
    fetchMyRooms();

    if (!path.startsWith("/room")) {
      currentTrack.value = undefined;
    }
  },
);

onMounted(() => {
  $conn.on("connect", () => (connected.value = true));
  $conn.on("disconnect", () => (connected.value = false));
  $conn.on("foundMatch", roomId => {
    $conn.emit("getRoom", roomId, room => {
      if (room !== "bad_room") {
        links.value.push(roomToLink(room));
      }
    });

    navigateTo(`/room/${roomId}`);
  });

  watchImmediate(user, fetchMyRooms);
});
</script>
