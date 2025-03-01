<template>
  <audio ref="musicController" loop :src="track" autoplay />
</template>

<script setup lang="ts">
const toast = useToast();
const currentTrack = useCurrentTrack();
const musicVol = useMusicVolume();
const musicController = ref<HTMLAudioElement>();
const track = computed(() => {
  return (
    currentTrack.value &&
    "/" + currentTrack.value.split("/").slice(2).map(encodeURIComponent).join("/")
  );
});

watch(currentTrack, value => {
  if (value) {
    toast.add({
      title: `Now Playing: ${musicTrackName(value)}`,
      icon: "heroicons-outline:speaker-wave",
    });
    if (musicController.value) {
      musicController.value.play().catch(_err => {});
    } else {
      watchOnce(musicController, v => v!.play().catch(_err => {}));
    }
  }
});

effect(() => {
  if (musicController.value) {
    musicController.value.volume = musicVol.value ?? 1.0;
  }
});
</script>
