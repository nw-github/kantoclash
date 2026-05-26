<template>
  <div
    class="w-full h-16 sm:h-18 rounded-lg bg-muted text-default sm:text-lg p-2 text-wrap overflow-hidden ring ring-inset ring-accented"
  >
    <span v-for="(part, i) in visible" :key="i" :class="part.clazz">{{ part.text }}</span>
    <span v-for="(part, i) in invisible" :key="i" class="invisible" :clazz="part.clazz">{{
      part.text
    }}</span>
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{displayed: []}>();

const {e, perspective, myId, charDelay, lineDelay} = defineProps<{
  e: UIBattleEvent;
  perspective: string;
  myId: string;
  charDelay: number;
  lineDelay: number;
}>();

const visible = ref<TextSpan[]>([]);
const invisible = ref<TextSpan[]>([]);
const mgr = injectManager()!;

const {pause, resume, reset} = useInterval(() => charDelay, {
  controls: true,
  callback: () => {
    const chunk = invisible.value[0];
    if (!chunk) {
      return;
    }

    if (!visible.value.length) {
      visible.value.push({text: "", clazz: chunk.clazz});
    }

    visible.value.at(-1)!.text += chunk.text.slice(0, 1);
    chunk.text = chunk.text.slice(1);

    if (!chunk.text) {
      invisible.value.shift();
      visible.value.push({text: "", clazz: invisible.value[0]?.clazz});

      if (!invisible.value.length) {
        nextLine();
      }
    }
  },
});

const nextLine = () => {
  pause();
  setTimeout(() => emit("displayed"), lineDelay);
};

watchImmediate(
  () => [e, perspective] as const,
  ([e, perspective]) => {
    const text =
      e &&
      eventText({
        e,
        myId,
        perspective,
        gen: mgr.battle.gen,
        isDoubles: mgr.isDoubles,
        players: mgr.players,
      });
    if (!text) {
      pause();
      return;
    }

    visible.value = [];
    invisible.value = text.spans.filter(span => !!span.text);
    reset();
    resume();

    if (!charDelay) {
      visible.value = invisible.value;
      invisible.value = [];
      nextLine();
    }
  },
);
</script>
