<template>
  <audio ref="musicController" autoplay loop src="/15-seconds-of-silence.mp3" />
</template>

<script setup lang="ts">
// Loops auto-generated with: https://github.com/arkrow/PyMusicLooper
import loops from "@/public/music/loops.json";

const toast = useToast();
const {volume, track, fadeOutRequested} = useBGMusic();
const musicController = ref<HTMLAudioElement>();
const context = useAudioContext();

let notified = false;
onMounted(() => {
  context!.addEventListener("statechange", showToast);

  musicController.value!.volume = 0;
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

const stop = async (fade: boolean) => {
  if (!context || !source) {
    return;
  }

  const src = source;
  if (fade) {
    await new Promise(resolve => {
      useAnime({
        targets: gain!.gain,
        value: 0,
        easing: "easeOutCubic",
        duration: 3000,
        complete: resolve,
      });
    });
  }

  if (navigator.mediaSession) {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  }

  if (source === src) {
    src.stop();
    source = undefined;
    gain = undefined;
    context.suspend();
  }
};

const play = async (next: string) => {
  type Loops = Record<string, {start: string; end: string}>;

  if (!context) {
    return;
  }

  const stopping = stop(true);

  const blob = await $fetch<Blob>(trackToPath(next));
  const loop = (loops as Loops)[next.slice(next.lastIndexOf("/") + 1)];
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());

  await stopping;

  if (track.value !== next) {
    return;
  }

  notified = false;
  gain = context.createGain();
  gain.gain.value = volume.value;
  gain.connect(context.destination);

  source = context.createBufferSource();
  source.buffer = buffer;
  if (loop) {
    source.loopStart = toSeconds(loop.start);
    source.loopEnd = toSeconds(loop.end);
  }
  source.loop = true;
  source.connect(gain);
  source.start();

  await context.resume();
};

const trackToPath = (tr: string) => "/" + tr.split("/").slice(2).map(encodeURIComponent).join("/");

const showToast = () => {
  if (context?.state === "running" && track.value && !notified) {
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
