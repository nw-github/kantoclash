<template>
  <UModal
    :title
    :description
    :close="false"
    :ui="{
      header: 'p-4 sm:p-4 text-sm',
      description: 'text-xs',
      body: 'p-2 sm:p-2',
      footer: 'p-4 sm:p-4 justify-between',
    }"
  >
    <template #body>
      <UTextarea
        v-model="text"
        class="w-full"
        :ui="{base: 'min-h-48 h-full'}"
        placeholder="Add a bug description here..."
        variant="none"
        autoresize
        autofocus
        :maxrows="8"
      />
    </template>

    <template #footer>
      <div class="flex gap-1">
        <UButton
          label="Submit"
          size="sm"
          :disabled="text.length > maxLength"
          @click="$emit('close', text.trim())"
        />
        <UButton label="Cancel" size="sm" variant="outline" @click="$emit('close')" />
      </div>

      <span class="text-xs" :class="[text.length <= maxLength ? 'text-muted' : 'text-error']">
        {{ text.length }}/{{ maxLength }}
      </span>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const text = ref("");
const maxLength = CHAT_MAX_MESSAGE;

const title = "Report a Bug";
const description = `
Please add a short description of the bug and what you believe should have occurred
instead. Example: "On turn 10, the opponent's Hitmonlee used Hi Jump Kick against my
Dusknoir, which failed due to type immunity, but the Hitmonlee did not take crash damage
when it was supposed to."
`;

defineEmits<{(e: "close", message?: string): void}>();
</script>
