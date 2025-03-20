<template>
  <div class="space-y-2 p-1">
    <UFormGroup label="Start Seconds Before">
      <UInput v-model.number="offset" />
    </UFormGroup>

    <USelectMenu v-model="track" searchable :options="musicTrackItems" value-attribute="value" />

    <div class="w-full">
      <URange v-model="currentTime" :min="0" :max="duration" :step="0.05" disabled />
      <div class="w-full flex justify-between">
        <span>{{ toTime(currentTime) }}</span>
        <span>{{ toTime(duration) }}</span>
      </div>
    </div>

    <USelectMenu v-model="startTime" :options="startTimes" />
    <div class="flex gap-1">
      <UButton label="Restart" @click="restart" />
      <UButton label="Copy" @click="startTime && copy(startTime.start, startTime.end)" />
      <UButton label="Clear" @click="startTime = undefined" />
    </div>

    <UTextarea v-model="textAreaText" :rows="10" />
  </div>
</template>

<script setup lang="ts">
import loops from "@/public/music/loops.json";

definePageMeta({middleware: ["admin"]});

const musicTrackItems = allMusicTracks.map(value => ({label: musicTrackName(value), value}));
const track = ref(musicTrackItems[0].value);
const {volume} = useBGMusic();
watch(volume, value => gain && (gain.gain.value = value));

const duration = ref(0);
const currentTime = ref(0);
const offset = ref(5);

const startTimes = ref<{label: string; start: number; end: number}[]>([]);
const startTime = ref<{label: string; start: number; end: number}>();
const textAreaText = ref("");
const audioBuffer = ref<Promise<AudioBuffer>>();

let context: AudioContext | undefined;
if (import.meta.client) {
  context = new AudioContext();
  context.suspend();
}

onUnmounted(() => {
  if (context) {
    context.close();
    context = undefined;
  }
});

let source: AudioBufferSourceNode | undefined;
let gain: GainNode | undefined;
const stop = () => {
  if (!context || !source || !import.meta.client) {
    return;
  }

  source.stop();
  source = undefined;
  gain = undefined;
  context.suspend();
};

const play = async (next: string, start: number, end: number) => {
  if (!context) {
    return;
  }

  stop();

  const buffer = await audioBuffer.value;
  if (track.value !== next || !buffer) {
    return;
  }

  gain = context.createGain();
  gain.gain.value = volume.value;
  gain.connect(context.destination);

  source = context.createBufferSource();
  source.buffer = buffer;
  source.loopStart = start;
  source.loopEnd = end;
  source.loop = true;
  source.connect(gain);

  source.start(0, end - offset.value);

  let last = context.currentTime;
  let curr = end - offset.value;

  await context.resume();
  requestAnimationFrame(function callback() {
    if (context?.state === "running") {
      curr += context.currentTime - last;
      last = context.currentTime;
      if (curr > end) {
        curr = curr - end + start;
      }

      currentTime.value = curr;
      requestAnimationFrame(callback);
    }
  });
};

const copy = (start: number, end: number) => {
  const name = track.value.slice(track.value.lastIndexOf("/") + 1);
  navigator.clipboard.writeText(`"${name}": { "start": "${start}", "end": "${end}" },`);
};

const toTime = (seconds: number) => {
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  const ms = roundTo(seconds % 1, 3)
    .toString()
    .slice(2)
    .padStart(3, "0");
  return `${mm}:${ss}.${ms}`;
};

const trackToPath = (tr: string) => "/" + tr.split("/").slice(2).map(encodeURIComponent).join("/");

const addStartTime = (start: number, end: number, confidence?: number) => {
  let label = `${startTimes.value.length}: ${toTime(start)} - ${toTime(end)}`;
  if (confidence) {
    label += ` [${roundTo(confidence * 100, 2)}]`;
  }
  return startTimes.value[startTimes.value.push({start, end, label}) - 1];
};

const restart = () => {
  if (startTime.value) {
    stop();
    play(track.value, startTime.value.start, startTime.value.end);
  }
};

watch(startTime, time => {
  if (time) {
    play(track.value, time.start, time.end);
  } else {
    stop();
  }
});

watch(textAreaText, text => {
  startTimes.value.length = +!!track.value;
  for (const line of text.split("\n").map(l => l.trim())) {
    if (line.length) {
      const [start, end, , , confidence] = line.split(" ").map(Number);
      if (!isNaN(start) && !isNaN(end)) {
        addStartTime(start, end, confidence);
      }
    }
  }
});

watchImmediate(track, async track => {
  stop();
  if (!import.meta.client || !track) {
    return;
  }

  audioBuffer.value = undefined;

  type Loops = Record<string, {start: string; end: string}>;

  const loop = (loops as Loops)[track.slice(track.lastIndexOf("/") + 1)];
  startTimes.value.length = 0;
  startTime.value = addStartTime(toSeconds(loop.start), toSeconds(loop.end));

  audioBuffer.value = (async () => {
    const blob = await $fetch<Blob>(trackToPath(track));
    const buffer = await context!.decodeAudioData(await blob.arrayBuffer());

    currentTime.value = 0;
    duration.value = buffer.duration;

    return buffer;
  })();
});
</script>
