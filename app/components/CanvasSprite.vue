<template>
  <canvas ref="cv">
    <img :src />
  </canvas>
</template>

<script setup lang="ts">
import APNG from "../libs/apng";
import {loadGIF, type Gif} from "../libs/libgif";

const frame = defineModel<number>("frame", {default: 0});

const {
  src,
  paused,
  tint,
  loop = true,
} = defineProps<{
  src: string;
  paused?: boolean;
  loop?: boolean;
  tint?: {r: number; g: number; b: number; a: number};
}>();

const canvas = useTemplateRef("cv");

let image: Gif | undefined;
let timer = 0;

const adjustCanvas = (c: HTMLCanvasElement, image: Gif) => {
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
};

watchImmediate(
  () => src,
  async () => {
    try {
      const data = await fetch(src).then(data => data.arrayBuffer());
      image = src.endsWith("gif") ? loadGIF(data) : new APNG(data);
      frame.value = 0;
      timer = 0;
      if (canvas.value && image) {
        adjustCanvas(canvas.value, image);
      }
    } catch {
      image = undefined;
      frame.value = 0;
      timer = 0;
    }
  },
);

watch(canvas, c => {
  if (c && image) {
    adjustCanvas(c, image);
  }
});

useAnimationFrame((_, dt) => {
  if (!image || !canvas.value) {
    return;
  }

  if (!paused && (loop || frame.value < image.frameCount - 1)) {
    timer += dt;
    if (timer >= image.getDelay(frame.value)) {
      frame.value = (frame.value + 1) % image.frameCount;
      timer = 0;
    }
  }

  const ctx = canvas.value.getContext("2d")!;
  image.drawFrame(ctx, frame.value);

  if (tint) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${tint.a / 255})`;
    ctx.fillRect(0, 0, image.width, image.height);
    ctx.globalCompositeOperation = "source-over";
  }
});

const animDuration = () => {
  if (!image) {
    return 0;
  }
  let time = 0;
  for (let i = 0; i < image.frameCount; i++) {
    time += image.getDelay(i);
  }
  return time;
};

const getCanvas = () => canvas.value;

defineExpose({animDuration, getCanvas});
</script>

<style scoped>
canvas {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}
</style>
