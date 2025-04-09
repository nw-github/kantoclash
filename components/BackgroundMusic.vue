<template>
  <audio ref="musicController" autoplay loop src="/silence.mp3" />
</template>

<script setup lang="ts">
// Loops auto-generated with: https://github.com/arkrow/PyMusicLooper
import loops from "@/public/music/loops.json";
import {animate} from "motion-v";

const toast = useToast();
const {volume, track, fadeOutRequested} = useBGMusic();
const musicController = ref<HTMLAudioElement>();

let playWasBlocked = false;
let offset = 0;
const context = useAudioContext(() => {
  if (playWasBlocked && source) {
    source.start(0, offset);
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

const stop = async (fade: boolean) => {
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
  type Loops = Record<string, {start: string; end: string}>;

  if (!context) {
    return;
  }

  stopping = stopping ?? stop(true);

  const path = "/" + next.split("/").slice(2).map(encodeURIComponent).join("/");
  const blob = await $fetch<Blob>(path);
  const loop = (loops as Loops)[next.slice(next.lastIndexOf("/") + 1)];
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());

  await stopping;
  stopping = undefined;

  if (track.value !== next) {
    return;
  }

  notified = false;
  gain = context.createGain();
  gain.gain.value = volume.value;
  gain.connect(context.destination);

  source = context.createBufferSource();
  // TODO: just remove the leading silence
  offset = next.includes("Cipher Peon Battle (Pokémon Colosseum)") ? 1.95 : 0;
  source.buffer = buffer;
  if (loop) {
    source.loopStart = toSeconds(loop.start);
    source.loopEnd = toSeconds(loop.end);
  }
  source.loop = true;
  source.connect(gain);

  if (!context.unlocked) {
    playWasBlocked = true;
  } else {
    source.start(0, offset);
    showToast();
  }
};

const showToast = () => {
  if (track.value && !notified) {
    const name = musicTrackName(track.value);
    toast.add({title: `Now Playing: ${name}`, icon: "heroicons-outline:speaker-wave"});
    notified = true;

    if (!navigator.mediaSession) {
      return;
    }

    const [title, game] = name.split("(").map(s => s.trim());
    const artist = game.split(")")[0];
    navigator.mediaSession.metadata = new MediaMetadata({title, artist});
    navigator.mediaSession.playbackState = "playing";
    navigator.mediaSession.setPositionState({duration: 0, playbackRate: 1, position: 0});
  }
};
</script>
