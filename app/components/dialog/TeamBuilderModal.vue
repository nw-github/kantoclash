<template>
  <UModal>
    <template #content>
      <TeamBuilder :team @delete="$emit('close', true)" @close="$emit('close', false)" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
defineProps<{team: Team}>();
defineEmits<{close: [boolean]}>();
</script>
