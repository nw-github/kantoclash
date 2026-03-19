<template>
  <UModal title="Go to turn...">
    <template #body>
      <UInputNumber v-model="turn" :min="0" :max class="w-full" />
    </template>

    <template #footer>
      <UButton
        label="Play"
        color="neutral"
        variant="outline"
        icon="material-symbols:play-arrow"
        @click="$emit('close', {why: 'go', turn})"
      />
      <UButton
        v-if="localMode"
        label="Roll Back"
        color="neutral"
        variant="outline"
        icon="material-symbols:undo"
        @click="$emit('close', {why: 'rewind', turn})"
      />
    </template>
  </UModal>
</template>

<script setup lang="ts">
defineProps<{max?: number; localMode?: bool}>();
defineEmits<{close: [{why: "rewind" | "go"; turn: number} | undefined]}>();

const turn = ref(0);
</script>
