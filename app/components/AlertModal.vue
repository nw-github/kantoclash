<template>
  <UModal :prevent-close="preventClose">
    <UAlert :title :description :icon :actions />
  </UModal>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  description?: string;
  icon?: string;
  preventClose?: bool;
  actions?: any[];
}>();
</script>
