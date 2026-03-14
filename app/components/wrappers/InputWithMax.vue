<template>
  <UInput v-bind="$attrs" v-model="model" :maxlength>
    <template v-if="maxlength !== undefined" #trailing>
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {{ model?.length ?? 0 }}/{{ maxlength }}
      </span>
    </template>
  </UInput>
</template>

<script setup lang="ts">
import type {InputProps} from "@nuxt/ui";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface Props extends /* @vue-ignore */ InputProps {}

const model = defineModel<string>();

defineProps<Props>();
</script>
