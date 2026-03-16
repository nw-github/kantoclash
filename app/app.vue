<template>
  <UApp :tooltip="{delayDuration: 200}">
    <UContainer class="h-dvh sm:py-6" :ui="{base: 'px-0'}">
      <UCard
        class="h-full flex flex-col"
        :ui="{body: 'grow overflow-hidden rounded-none sm:rounded-lg'}"
      >
        <template #header>
          <nav class="flex justify-between">
            <UNavigationMenu
              class="hidden md:block"
              orientation="horizontal"
              content-orientation="vertical"
              variant="link"
              highlight
              :items="links"
              :ui="{viewportWrapper: 'z-1000'}"
            />

            <UPopover class="block md:hidden">
              <UButton icon="heroicons:bars-3-16-solid" variant="link" color="neutral" />
              <template #content>
                <UNavigationMenu
                  orientation="vertical"
                  :items="links"
                  :ui="{viewportWrapper: 'z-1000'}"
                />
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
                  color="neutral"
                  variant="ghost"
                  :icon="
                    $colorMode.preference === 'dark' || $colorMode.value === 'dark'
                      ? 'material-symbols:dark-mode'
                      : 'material-symbols:light-mode'
                  "
                  @click="$colorMode.preference = $colorMode.value === 'dark' ? 'light' : 'dark'"
                />
              </ColorScheme>
              <ClientOnly>
                <UPopover mode="click" :content="{align: 'end'}">
                  <UButton
                    :icon="
                      musicVol === 0
                        ? 'material-symbols:volume-off-outline-rounded'
                        : 'material-symbols:volume-up-outline-rounded'
                    "
                    variant="ghost"
                    color="neutral"
                  />
                  <template #content>
                    <div class="p-4 w-80 space-y-2">
                      <div>
                        <span>Music</span>
                        <USlider v-model="musicVol" :max="0.8" :step="0.005" />
                      </div>
                      <div>
                        <span>Sound Effects</span>
                        <USlider v-model="sfxVol" :max="0.8" :step="0.005" />
                      </div>
                      <div v-if="currentTrack || debug">
                        <div>Current Track</div>
                        <USelectMenu
                          v-model="currentTrack"
                          class="w-full"
                          :items="musicTrackItems"
                          value-key="value"
                        />
                      </div>
                    </div>
                  </template>
                </UPopover>
              </ClientOnly>
              <AccountButton v-model:open="accountOpen" />
            </div>
          </nav>
        </template>

        <NuxtPage @request-login="accountOpen = true" />
      </UCard>
    </UContainer>

    <BackgroundMusic />
  </UApp>
</template>

<style>
@reference "@/assets/main.css";

@layer base {
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  * {
    margin: 0;
    padding: 0;
  }
}

body {
  --grid-color: #e4e4e4;
  background-image: linear-gradient(to right, var(--grid-color) 1px, transparent 1px),
    linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px);
  background-size: 32px 32px;
  @apply dark:bg-zinc-950/97;
}

.dark body {
  --grid-color: #18181b;
}
</style>

<script setup lang="ts">
import {provideSSRWidth} from "@vueuse/core";
import type {RoomDescriptor} from "~~/server/gameServer";
import AlertModal from "./components/dialog/AlertModal.vue";
import type {NavigationMenuChildItem, NavigationMenuItem} from "@nuxt/ui";

provideSSRWidth(768);

const debug = import.meta.dev;

const {$conn} = useNuxtApp();
const {user, fetch} = useUserSession();
const route = useRoute();
const {volume: musicVol, track: currentTrack} = useBGMusic();
const sfxVol = useSfxVolume();
const challenges = useChallenges();
const ignoreChallenges = useIgnoreChallenges();
const ignoredPlayers = ref<string[]>([]);
const toast = useToast();
const musicTrackItems = allMusicTracks.map(value => ({label: musicTrackName(value), value}));
const connected = ref($conn.connected);
const accountOpen = ref(false);

const alert = useOverlay().create(AlertModal);

const battleText = (count: number) => {
  // prettier-ignore
  switch (count) {
  case 0: return "No Battles";
  case 1: return "1 Battle";
  default: return `${count} Battles`;
  }
};

const links = ref<NavigationMenuItem[]>([
  {label: "Home", icon: "heroicons:home", to: "/"},
  {label: "Team Builder", icon: "famicons:hammer-outline", to: "/builder"},
  {label: battleText(0), icon: "akar-icons:double-sword", disabled: true, children: []},
]);
const battleLink = computed(() => links.value[2]);

watchImmediate(user, user => {
  const idx = links.value.findIndex(v => v.to === "/admin");
  if (user?.admin) {
    if (idx === -1) {
      links.value.push({
        label: "Admin Panel",
        icon: "material-symbols:settings-outline",
        to: "/admin",
      });
    }
  } else if (idx !== -1) {
    links.value.splice(idx, 1);
  }
});

const roomToLink = (room: RoomDescriptor): NavigationMenuChildItem => {
  return {
    label: `vs. ${room.battlers.find(b => b.id !== useMyId().value)!.name}`,
    icon: formatInfo[room.format].icon,
    to: "/room/" + room.id,
    description: formatInfo[room.format].name,
  };
};

const fetchMyRooms = () => {
  if (!user.value) {
    return;
  }

  $conn.emit("getPlayerRooms", user.value.id, rooms => {
    if (rooms !== "bad_player") {
      battleLink.value.children = rooms.map(roomToLink);
      battleLink.value.label = battleText(rooms.length);
      battleLink.value.disabled = !rooms.length;
    }
  });
};

watchImmediate(
  () => route.path,
  path => {
    fetchMyRooms();

    const inRoom = path.startsWith("/room");
    battleLink.value.active = inRoom;
    if (!inRoom && !import.meta.dev) {
      currentTrack.value = undefined;
    }
  },
);

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
        const rooms = (battleLink.value.children ??= []);
        rooms.push(roomToLink(room));
        battleLink.value.label = battleText(rooms.length);
        battleLink.value.disabled = !rooms.length;
      }
    });

    navigateTo(`/room/${roomId}?intro=true`);
  });
  $conn.on("maintenanceState", enabled => {
    if (route.path.startsWith("/admin")) {
      return;
    }

    if (alert.isOpen) {
      alert.close();
    } else {
      alert.open({
        title: "Maintenance Mode",
        icon: "material-symbols:info-outline-rounded",
        description: enabled
          ? "The server will be going down for maintenance shortly. The ability to start new battles is now disabled."
          : "Maintenance mode has been cancelled. The ability to start battles has been enabled.",
        dismissible: false,
        variant: "outline",
        color: "neutral",
        actions: [{variant: "solid", color: "primary", label: "OK", onClick: () => alert.close()}],
      });
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
        {
          label: "Go Home",
          icon: "heroicons:home",
          color: "neutral",
          variant: "outline",
          onClick: () => void navigateTo("/"),
        },
        {
          label: "Block This User",
          icon: "material-symbols:block",
          variant: "solid",
          color: "error",
          onClick() {
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
