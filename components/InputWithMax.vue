<template>
  <UInput v-bind="$props" v-model="model" :maxlength>
    <template v-if="maxlength !== undefined" #trailing>
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {{ model?.length ?? 0 }}/{{ maxlength }}
      </span>
    </template>
  </UInput>
</template>

<script setup lang="ts">
import type { UInput } from "#components";

type InputProps = InstanceType<typeof UInput>["$props"];

interface Props extends /* @vue-ignore */ InputProps {
  maxlength?: number;
}

const model = defineModel<string>();

defineProps<Props>();
</script>
