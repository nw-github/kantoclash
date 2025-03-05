<template>
  <audio ref="musicController" autoplay loop src="/15-seconds-of-silence.mp3" />
</template>

<script setup lang="ts">
// Loops auto-generated with: https://github.com/arkrow/PyMusicLooper
import loops from "@/public/music/loops.json";

const toast = useToast();
const { volume, track } = useBGMusic();
const musicController = ref<HTMLAudioElement>();

let notified = false;
let context: AudioContext;
onMounted(() => {
  const unlock = () => {
    document.removeEventListener("touchstart", unlock, true);
    document.removeEventListener("touchend", unlock, true);
    document.removeEventListener("click", unlock, true);
    document.removeEventListener("keydown", unlock, true);

    context
      .resume()
      .then(showToast)
      .catch(() => {});
  };

  document.addEventListener("touchstart", unlock, true);
  document.addEventListener("touchend", unlock, true);
  document.addEventListener("click", unlock, true);
  document.addEventListener("keydown", unlock, true);

  context = new AudioContext();
  context.suspend();

  musicController.value!.volume = 0;
});

let source: AudioBufferSourceNode | undefined;
let gain: GainNode | undefined;
watch(volume, value => gain && (gain.gain.value = value));
watch(track, value => (value ? play(value) : stop()));

const stop = async () => {
  if (!context || !source) {
    return;
  }

  const src = source;
  gain!.gain.exponentialRampToValueAtTime(0.01, context!.currentTime + 2);
  await delay(2000);

  if (navigator.mediaSession) {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  }

  src.stop();
  source = undefined;
  gain = undefined;
  context.suspend();
};

const play = async (next: string) => {
  type Loops = Record<string, { start: string; end: string }>;

  if (!context) {
    return;
  }

  const stopping = stop();

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
  source.loopStart = toSeconds(loop.start);
  source.loopEnd = toSeconds(loop.end);
  source.loop = true;
  source.connect(gain);
  source.start(/*0, source.buffer.duration - 5*/);

  await context.resume();
  showToast();
};

const toSeconds = (pos: string) => {
  const [m, sms] = pos.split(":");
  const [s, ms] = sms.split(".").map(Number);
  return +m * 60 + s + ms / 1000;
};

const trackToPath = (tr: string) => "/" + tr.split("/").slice(2).map(encodeURIComponent).join("/");

const showToast = () => {
  if (context.state === "running" && track.value && !notified) {
    const name = musicTrackName(track.value);
    toast.add({
      title: `Now Playing: ${name}`,
      icon: "heroicons-outline:speaker-wave",
    });
    notified = true;

    if (!navigator.mediaSession) {
      return;
    }

    const [title, game] = name.split("(").map(s => s.trim());
    const artist = game.split(")")[0];
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist });
    navigator.mediaSession.playbackState = "playing";
    navigator.mediaSession.setPositionState({ duration: 0, playbackRate: 1, position: 0 });
  }
};
</script>
