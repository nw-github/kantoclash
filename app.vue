<template>
  <UContainer class="h-screen py-6">
    <UCard class="h-full flex flex-col" :ui="{ body: { base: 'grow overflow-hidden' } }">
      <template #header>
        <nav class="flex justify-between">
          <UHorizontalNavigation class="hidden sm:block" :links />

          <UPopover class="block sm:hidden" :popper="{ placement: 'bottom-start' }">
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
            <UPopover mode="hover" :popper="{ placement: 'bottom-start' }">
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
                    <URange :max="1" v-model="musicVol" :step="0.01" />
                  </div>
                  <div>
                    <span>Sound Effects</span>
                    <URange :max="1" v-model="sfxVol" :step="0.01" />
                  </div>
                  <div v-if="currentTrack">
                    <span>Current Track</span>
                    <USelectMenu
                      searchable
                      :options="musicTrackItems"
                      value-attribute="value"
                      v-model="currentTrack"
                    />
                  </div>
                </div>
              </template>
            </UPopover>
            <AccountButton v-model:open="accountOpen" />
          </div>
        </nav>
      </template>

      <NuxtPage @requestLogin="accountOpen = true" />
    </UCard>
  </UContainer>

  <UNotifications />
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
</style>

<script setup lang="ts">
const { $conn } = useNuxtApp();
const musicVol = useMusicVolume();
const sfxVol = useSfxVolume();
const currentTrack = useCurrentTrack();
const musicTrackItems = allMusicTracks.map(track => ({
  label: musicTrackName(track),
  value: track,
}));
const connected = ref($conn.connected);
const accountOpen = ref(false);

const links = [
  {
    label: "Home",
    icon: "heroicons:home",
    to: "/",
  },
  {
    label: "Team Builder",
    icon: "famicons:hammer-outline",
    to: "/teambuilder",
  },
  {
    label: "My Battles",
    icon: "material-symbols:swords-outline",
  },
];

$conn.on("connect", () => (connected.value = true));
$conn.on("disconnect", () => (connected.value = false));
</script>
