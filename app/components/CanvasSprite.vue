<template>
  <canvas ref="cv">
    <img :srcset="`${src} ${1 / (canvasScale ?? 1)}x`" />
  </canvas>
</template>

<script setup lang="ts">
import type {Gif} from "../libs/libgif";

const frame = defineModel<number>("frame", {default: 0});

type Tint = {r: number; g: number; b: number; a: number} | string;

type Params = {
  src: string;
  paused?: boolean;
  loop?: boolean;
  speed?: number;
  tint?: Tint | ((absTime: number, dt: number) => Tint | undefined);
  canvasScale?: number;
};

const {src, paused, tint, canvasScale, loop = true, speed = 1} = defineProps<Params>();

const canvas = useTemplateRef("cv");

let image: Gif | undefined;
let timer = 0;

const animCache = injectAnimationCache();

const adjustCanvas = (c: HTMLCanvasElement, image: Gif) => {
  c.width = image.width;
  c.height = image.height;

  if (canvasScale !== undefined) {
    c.style.width = `${image.width * canvasScale}px`;
    c.style.height = `${image.height * canvasScale}px`;
  }
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
};

watchImmediate(
  () => src,
  async newSrc => {
    try {
      let data = animCache ? animCache.load(newSrc) : AnimationCache.rawLoad(newSrc);
      if (data instanceof Promise) {
        data = await data;
        if (newSrc !== src) {
          return;
        }
      }

      image = data;
      if (canvas.value && image) {
        adjustCanvas(canvas.value, image);
      }
    } catch {
      if (newSrc !== src) {
        return;
      }
      image = undefined;
    }
    frame.value = 0;
    timer = 0;
  },
);

watch([canvas, () => canvasScale], ([c]) => {
  if (c && image) {
    adjustCanvas(c, image);
  }
});

useAnimationFrame((absTime, dt) => {
  if (!image || !canvas.value) {
    return;
  }

  if (!paused && (loop || frame.value < image.frameCount - 1)) {
    timer += dt;
    if (timer >= image.getDelay(frame.value) * (1 / speed)) {
      frame.value = (frame.value + 1) % image.frameCount;
      timer = 0;
    }
  }

  const ctx = canvas.value.getContext("2d")!;
  image.drawFrame(ctx, frame.value);

  if (tint) {
    const realTint = typeof tint === "function" ? tint(absTime, dt) : tint;
    if (!realTint) {
      return;
    }

    ctx.globalCompositeOperation = "source-atop";
    if (typeof realTint === "object") {
      ctx.fillStyle = `rgba(${realTint.r}, ${realTint.g}, ${realTint.b}, ${realTint.a / 255})`;
    } else {
      ctx.fillStyle = realTint;
    }
    ctx.fillRect(0, 0, image.width, image.height);
    ctx.globalCompositeOperation = "source-over";
  }
});

const animDuration = (threshold = 0) => {
  if (!image) {
    return 0;
  }
  let time = 0;
  for (let i = 0; i < image.frameCount; i++) {
    if (!threshold || threshold >= image.getDelay(i)) {
      time += image.getDelay(i);
    }
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
