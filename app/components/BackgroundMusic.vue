<template>
  <audio ref="musicController" autoplay loop src="/silence.mp3" />
</template>

<script setup lang="ts">
import {animate} from "motion-v";

const toast = useToast();
const {volume, track, fadeOutRequested} = useBGMusic();
const musicController = ref<HTMLAudioElement>();

let playWasBlocked = false;
let currentInfo: MusicInfo = {loopStart: 0, loopEnd: 0, offset: 0};
const context = useAudioContext(() => {
  if (playWasBlocked && source) {
    source.start(0, currentInfo.offset);
    showToast();
  }
});

let notified = false;
onMounted(() => {
  musicController.value!.volume = 0;
  if (track.value) {
    play(track.value);
  }
});

onUnmounted(() => {
  source?.stop();
  source = undefined;
  gain = undefined;
});

let source: AudioBufferSourceNode | undefined;
let gain: GainNode | undefined;
watch(volume, value => gain && (gain.gain.value = value));
watch(track, value => (value ? play(value) : stop(false)));
watch(fadeOutRequested, async req => {
  if (req) {
    await stop(true);
    fadeOutRequested.value = false;
    track.value = undefined;
  }
});

let stopping: Promise<void> | undefined;

const stop = async (fade: bool) => {
  if (!context || !source) {
    return;
  }

  const src = source;
  if (fade) {
    await animate(gain!.gain, {value: 0}, {duration: 3, ease: [0.33, 1, 0.68, 1]}); // easeOutCubic
  }

  if (navigator.mediaSession) {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  }

  if (source === src) {
    src.stop();
    source = undefined;
    gain = undefined;
  }
};

const play = async (next: string) => {
  if (!context) {
    return;
  }

  stopping = stopping ?? stop(true);

  const blob = await $fetch<Blob>(trackToPath(next));
  const info = await getMusicInfo(blob, next);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());

  await stopping;
  stopping = undefined;

  if (track.value !== next) {
    return;
  }

  notified = false;
  currentInfo = info;
  gain = context.createGain();
  gain.gain.value = volume.value;
  gain.connect(context.destination);

  source = context.createBufferSource();
  source.buffer = buffer;
  source.loopStart = info.loopStart;
  source.loopEnd = info.loopEnd;
  source.loop = true;
  source.connect(gain);

  if (!context.unlocked) {
    playWasBlocked = true;
  } else {
    source.start(0, currentInfo.offset);
    showToast();
  }
};

const showToast = () => {
  const {title, album, artist} = currentInfo;
  if (track.value && !notified) {
    toast.add({
      title: `Now Playing: ${title}${album ? ` (${album})` : ""}`,
      icon: "heroicons-outline:speaker-wave",
    });

    notified = true;

    if (navigator.mediaSession) {
      navigator.mediaSession.metadata = new MediaMetadata({title, artist, album});
      navigator.mediaSession.playbackState = "playing";
      navigator.mediaSession.setPositionState({duration: 0, playbackRate: 1, position: 0});
    }
  }
};
</script>
