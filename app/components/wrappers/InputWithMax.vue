<template>
  <UInput v-bind="$attrs" v-model="model" :maxlength :ui="{trailing: 'pointer-events-none'}">
    <template v-if="maxlength !== undefined" #trailing>
      <span class="text-xs text-muted">{{ model?.length ?? 0 }}/{{ maxlength }}</span>
    </template>
  </UInput>
</template>

<script setup lang="ts">
import type {InputProps} from "@nuxt/ui";

interface Props extends /* @vue-ignore */ InputProps {
  // This is required
  maxlength?: number;
}

const model = defineModel<string>();

defineProps<Props>();
</script>
