<template>
  <UModal>
    <template #content>
      <UTextarea
        v-model="importText"
        :ui="{base: 'h-94 rounded-lg'}"
        :placeholder="exportMode ? undefined : 'Paste your team(s) here...'"
        variant="none"
        autoresize
        spellcheck="false"
      >
        <template #trailing>
          <TooltipButton
            :text="exportMode ? 'Copy' : 'Import'"
            :icon="
              exportMode
                ? 'material-symbols:content-copy-outline'
                : 'heroicons:arrow-down-tray-20-solid'
            "
            variant="ghost"
            color="neutral"
            class="mr-1"
            @click="() => $emit('close', {accepted: true, text: importText})"
          />
        </template>
      </UTextarea>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const {text} = defineProps<{text: string; exportMode: bool}>();
defineEmits<{close: [{accepted: bool; text: string} | undefined]}>();

const importText = ref(text);
</script>
