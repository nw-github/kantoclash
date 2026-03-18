<template>
  <UModal :dismissible>
    <template #content>
      <UAlert v-bind="$attrs" />
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type {AlertProps} from "@nuxt/ui";

interface Props extends /* @vue-ignore */ AlertProps {
  dismissible?: bool;
}

defineProps<Props>();
</script>
