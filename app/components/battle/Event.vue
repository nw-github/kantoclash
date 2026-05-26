<template>
  <div v-if="textLines" class="text-sm sm:text-base" :class="textLines.clazz">
    <template v-for="(text, j) in textLines.spans" :key="j">
      <UTooltip v-if="text.tooltip" :text="text.tooltip">
        <span :class="text.clazz">{{ text.text }}</span>
      </UTooltip>
      <span v-else :class="text.clazz">{{ text.text }}</span>
    </template>
  </div>
  <div v-else class="text-sm sm:text-base">
    Unknown event: <code>{{ e }}</code>
  </div>
</template>

<style scoped>
@reference "@/assets/main.css";

.muted {
  @apply text-xs sm:text-[0.8rem];
}
</style>

<script setup lang="ts">
const {perspective, myId, e} = defineProps<{e: UIBattleEvent; perspective: string; myId: string}>();

const mgr = injectManager()!;

const textLines = computed(() => {
  return eventText({
    e,
    myId,
    perspective,
    gen: mgr.battle.gen,
    isDoubles: mgr.isDoubles,
    players: mgr.players,
  });
});
</script>
