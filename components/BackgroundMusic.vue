<template>
  <audio ref="musicController" />
</template>

<script setup lang="ts">
// Loops auto-generated with: https://github.com/arkrow/PyMusicLooper
import loops from "@/public/music/loops.json";

const toast = useToast();
const { volume, track } = useBGMusic();
const musicController = ref<HTMLAudioElement>();

let context: AudioContext;
if (import.meta.client) {
  context = new AudioContext();
}

let source: AudioBufferSourceNode | undefined;
let gain: GainNode | undefined;
watch(volume, value => gain && (gain.gain.value = value));
watch(track, value => (value ? play(value) : stop()));

const stop = () => {
  if (!context || !source) {
    return;
  }

  // gain!.gain.exponentialRampToValueAtTime(0, context!.currentTime + 2);
  // await delay(2000);

  source.stop();
  source = undefined;
  gain = undefined;
};

const play = async (next: string) => {
  type Loops = Record<string, { start: string; end: string }>;

  if (!context) {
    return;
  }

  stop();

  const name = musicTrackName(next);
  const blob = await $fetch<Blob>(trackToPath(next));
  const loop = (loops as Loops)[next.slice(next.lastIndexOf("/") + 1)];

  source = context.createBufferSource();
  source.buffer = await context.decodeAudioData(await blob.arrayBuffer());

  if (track.value !== next) {
    return;
  }

  gain = context.createGain();
  gain.gain.value = volume.value;
  gain.connect(context.destination);

  source.loopStart = toSeconds(loop.start);
  source.loopEnd = toSeconds(loop.end);
  source.loop = true;
  source.connect(gain);
  source.start(/*0, source.buffer.duration - 5*/);

  toast.add({ title: `Now Playing: ${name}`, icon: "heroicons-outline:speaker-wave" });
};

const toSeconds = (pos: string) => {
  const [m, sms] = pos.split(":");
  const [s, ms] = sms.split(".").map(Number);
  return +m * 60 + s + ms / 1000;
};

const trackToPath = (tr: string) => "/" + tr.split("/").slice(2).map(encodeURIComponent).join("/");
</script>
