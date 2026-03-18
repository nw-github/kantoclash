<template>
  <UInputNumber
    v-model="model"
    color="primary"
    :min
    :max
    size="sm"
    :increment="false"
    :decrement="false"
    :placeholder
  />
</template>

<script setup lang="ts">
const model = defineModel<number | undefined>({default: undefined});
defineProps<{min?: number; max?: number; placeholder?: string}>();
</script>
