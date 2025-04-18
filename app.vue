<template>
  <UContainer class="h-dvh sm:py-6" :ui="{padding: 'px-0'}">
    <UCard
      class="h-full flex flex-col"
      :ui="{body: {base: 'grow overflow-hidden'}, rounded: 'rounded-none sm:rounded-lg'}"
    >
      <template #header>
        <nav class="flex justify-between">
          <UHorizontalNavigation class="hidden md:block" :links>
            <template #default="{link, isActive}">
              <UTooltip
                :text="link.vs"
                :class="[
                  link.vs && 'lg:inline-block',
                  link.vs && links.length > nLinks + 3 && 'hidden',
                ]"
              >
                <div class="truncate" :class="[link.vs && 'max-w-10 md:max-w-20 lg:max-w-36']">
                  <span
                    class="text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white"
                    :class="[isActive && 'text-gray-900 dark:text-white']"
                  >
                    {{ link.label }}
                  </span>
                </div>
              </UTooltip>
            </template>

            <template #icon="{link, isActive}">
              <UTooltip :text="link.vs">
                <UIcon
                  :name="link.icon"
                  class="text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white size-5"
                  :class="[isActive && 'text-gray-900 dark:text-white']"
                />
              </UTooltip>
            </template>
          </UHorizontalNavigation>

          <UPopover class="block md:hidden" :popper="{placement: 'bottom-start'}">
            <UButton icon="heroicons:bars-3-16-solid" variant="link" color="gray" />
            <template #panel>
              <UVerticalNavigation :links />
            </template>
          </UPopover>

          <div class="flex items-center gap-3">
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
                  $colorMode.preference === 'dark' || $colorMode.value === 'dark'
                    ? 'material-symbols:dark-mode'
                    : 'material-symbols:light-mode'
                "
                @click="$colorMode.preference = $colorMode.value === 'dark' ? 'light' : 'dark'"
              />
            </ColorScheme>
            <UPopover mode="click" :popper="{placement: 'bottom-start'}">
              <ClientOnly>
                <UButton
                  :icon="
                    musicVol === 0
                      ? 'material-symbols:volume-off-outline-rounded'
                      : 'material-symbols:volume-up-outline-rounded'
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
                      :popper="{strategy: 'fixed'}"
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

  <UModals />
  <UNotifications />
  <BackgroundMusic />
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  --grid-color: #e4e4e4;
  background-image: linear-gradient(to right, var(--grid-color) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px);
  background-size: 32px 32px;
}

.dark body {
  --grid-color: #18181b;
}
</style>

<script setup lang="ts">
import {provideSSRWidth} from "@vueuse/core";
import type {RoomDescriptor} from "./server/gameServer";
import type {WatchStopHandle} from "vue";
import AlertModal from "./components/AlertModal.vue";

provideSSRWidth(768);

const {$conn} = useNuxtApp();
const {user, fetch} = useUserSession();
const route = useRoute();
const modal = useModal();
const {volume: musicVol, track: currentTrack} = useBGMusic();
const sfxVol = useSfxVolume();
const challenges = useChallenges();
const ignoreChallenges = useIgnoreChallenges();
const ignoredPlayers = ref<string[]>([]);
const toast = useToast();
const musicTrackItems = allMusicTracks.map(value => ({label: musicTrackName(value), value}));
const connected = ref($conn.connected);
const accountOpen = ref(false);

const links = ref([
  {label: "Home", icon: "heroicons:home", to: "/"},
  {label: "Team Builder", icon: "famicons:hammer-outline", to: "/builder"},
]);
const nLinks = ref(2);

watchImmediate(user, user => {
  if (user?.admin) {
    links.value.push({
      label: "Admin Panel",
      icon: "material-symbols:settings-outline",
      to: "/admin",
    });
    nLinks.value = 3;
  } else {
    links.value.splice(2, 1);
    nLinks.value = 2;
  }
});

const roomToLink = (room: RoomDescriptor) => {
  return {
    label: `vs. ${room.battlers.find(b => b.id !== useMyId().value)!.name}`,
    icon: formatInfo[room.format].icon,
    to: "/room/" + room.id,
    vs: room.battlers.map(pl => pl.name).join(" vs. ") + " - " + formatInfo[room.format].name,
  };
};

const fetchMyRooms = () => {
  if (!user.value) {
    links.value.splice(nLinks.value, links.value.length - nLinks.value);
    return;
  }

  $conn.emit("getPlayerRooms", user.value.id, rooms => {
    links.value.splice(nLinks.value, links.value.length - nLinks.value);
    if (rooms !== "bad_player") {
      links.value.push(...rooms.map(roomToLink));
    }
  });
};

watch(
  () => route.path,
  path => {
    fetchMyRooms();

    if (!path.startsWith("/room")) {
      currentTrack.value = undefined;
    }
  },
);

let cancelModalWatch: WatchStopHandle | undefined;

onMounted(() => {
  $conn.on("connect", () => {
    $conn.emit("getChallenges", resp => (challenges.value = resp));
    connected.value = true;
  });
  $conn.on("disconnect", () => {
    connected.value = false;
    $conn.connect();
  });
  $conn.on("foundMatch", roomId => {
    $conn.emit("getRoom", roomId, room => {
      if (room !== "bad_room") {
        links.value.push(roomToLink(room));
      }
    });

    navigateTo(`/room/${roomId}?intro=true`);
  });
  $conn.on("maintenanceState", enabled => {
    if (route.path.startsWith("/admin")) {
      return;
    }

    const props = {
      title: "Maintenance Mode",
      icon: "material-symbols:info-outline-rounded",
      description: enabled
        ? "The server will be going down for maintenance shortly. The ability to start new battles is now disabled."
        : "Maintenance mode has been cancelled. The ability to start battles has been enabled.",
      preventClose: true,
      actions: [{variant: "solid", color: "primary", label: "OK", click: () => modal.close()}],
    };

    if (modal.isOpen.value) {
      if (cancelModalWatch) {
        cancelModalWatch();
      }

      cancelModalWatch = watchOnce(modal.isOpen, () => {
        modal.open(AlertModal, props);
        cancelModalWatch = undefined;
      });
    } else {
      modal.open(AlertModal, props);
    }
  });
  $conn.on("challengeReceived", ch => {
    if (ignoreChallenges.value || ignoredPlayers.value.includes(ch.from.id)) {
      $conn.emit("respondToChallenge", ch.from.id, false, undefined, () => {});
      return;
    }

    challenges.value.push(ch);
    toast.add({
      title: `New Challenge from ${ch.from.name}!`,
      description: `You were challenged to a ${formatInfo[ch.format].name}!`,
      icon: "material-symbols:info-outline-rounded",
      actions: [
        {label: "Go Home", icon: "heroicons:home", click: () => navigateTo("/")},
        {
          label: "Block This User",
          icon: "material-symbols:block",
          variant: "solid",
          color: "red",
          click() {
            ignoredPlayers.value.push(ch.from.id);
            const index = challenges.value.indexOf(ch);
            if (index !== -1) {
              challenges.value.splice(index, 1);
            }

            $conn.emit("respondToChallenge", ch.from.id, false, undefined, () => {});
            toast.add({title: `Blocked ${ch.from.name} for the rest of this session!`});
          },
        },
      ],
    });
  });
  $conn.on("challengeRetracted", battler => {
    const index = challenges.value.findIndex(c => c.from.id === battler.id);
    if (index !== -1) {
      challenges.value.splice(index, 1);
    }
  });
  $conn.on("challengeRejected", battler => {
    toast.add({
      title: "Challenge Rejected!",
      description: `Your challenge to user '${battler.name}' was rejected!`,
      icon: "material-symbols:info-outline-rounded",
    });
  });

  watchImmediate(user, () => {
    if (!user.value) {
      challenges.value.length = 0;
    }

    fetchMyRooms();
  });
  fetch();
});

onUnmounted(() => {
  $conn.off("connect");
  $conn.off("disconnect");
  $conn.off("foundMatch");
  $conn.off("maintenanceState");
  $conn.off("challengeReceived");
  $conn.off("challengeRetracted");
  $conn.off("challengeRejected");
});
</script>
