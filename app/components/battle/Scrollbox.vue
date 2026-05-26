<template>
  <div
    class="w-full h-16 sm:h-18 rounded-lg bg-muted text-default sm:text-lg p-2 text-wrap overflow-hidden ring ring-inset ring-accented"
  >
    <span v-for="(part, i) in displayText" :key="i" :class="part.clazz">{{ part.text }}</span>
    <span class="invisible" :clazz="invisText.clazz">{{ invisText.text }}</span>
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

const displayText = reactive<{text: string; clazz?: string}[]>([]);
const invisText = reactive({text: "", clazz: "" as string | undefined});
const mgr = injectManager()!;

let chunkNo = 0;
let characterNo = 0;

const textLines = ref();

const {pause, resume, reset} = useInterval(() => charDelay, {
  controls: true,
  immediate: true,
  callback: () => {
    const line = textLines.value;
    if (!line) {
      return;
    }

    let chunk = line.text[chunkNo];
    if (!chunk || !chunk.text[characterNo]) {
      chunk = line.text[++chunkNo];
      characterNo = 0;
      if (!chunk) {
        return nextLine();
      }
    }

    const ch = chunk.text[characterNo++];
    if (!ch) {
      return nextLine();
    }

    const span = displayText.at(-1);
    if (!span || span.clazz !== chunk.clazz) {
      displayText.push({text: ch, clazz: chunk.clazz});
    } else {
      span.text += ch;
    }

    // This doesn't cover words that are split into several chunks but we don't produce things like
    // that anyway.
    if (ch !== " " && chunk.text[characterNo] && chunk.text[characterNo] !== " ") {
      const end = chunk.text.indexOf(" ", characterNo + 1);
      invisText.text = chunk.text.slice(characterNo, end === -1 ? undefined : end);
      invisText.clazz = chunk.clazz;
    } else {
      invisText.text = "";
    }
  },
});

const nextLine = () => {
  pause();
  setTimeout(() => emit("displayed"), lineDelay);
};

const resetText = () => {
  displayText.length = 0;
  chunkNo = 0;
  characterNo = 0;
  reset();
  resume();
};

watchImmediate(
  () => [e, perspective] as const,
  ([e, perspective]) => {
    textLines.value =
      e &&
      eventText({
        e,
        myId,
        perspective,
        gen: mgr.battle.gen,
        isDoubles: mgr.isDoubles,
        players: mgr.players,
      });
    resetText();
  },
);
</script>
