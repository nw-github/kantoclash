<template>
  <UModal v-model="open">
    <div class="space-y-1 py-1 divide-y divide-gray-200 dark:divide-gray-800">
      <div class="flex flex-col px-2">
        <h1 class="truncate">Report a Bug</h1>
        <div class="text-xs text-gray-400 dark:text-gray-500">
          Please add a short description of the bug and what you believe should have occurred
          instead. Example: "On turn 10, the opponent's Hitmonlee used Hi Jump Kick against my
          Dusknoir, which failed due to type immunity, but the Hitmonlee did not take crash damage
          when it was supposed to."
        </div>
      </div>

      <UTextarea
        v-model="text"
        class="h-48"
        placeholder="Add a bug description here..."
        variant="none"
        autofocus
      />

      <div class="px-2 pb-1 pt-2 flex justify-between items-center">
        <div class="flex gap-1">
          <UButton
            label="Submit"
            size="xs"
            :disabled="text.length > maxLength"
            @click="(open = false), $emit('submit', text.trim())"
          />
          <UButton label="Cancel" size="xs" variant="outline" @click="open = false" />
        </div>

        <span
          class="text-xs"
          :class="[text.length <= maxLength ? 'text-gray-500 dark:text-gray-400' : 'text-red-400']"
        >
          {{ text.length }}/{{ maxLength }}
        </span>
      </div>
    </div>
  </UModal>
</template>

<script setup lang="ts">
const open = defineModel<boolean>();
const text = ref("");
const maxLength = CHAT_MAX_MESSAGE;

defineEmits<{(e: "submit", message: string): void; (e: "close"): void}>();

watch(open, open => {
  if (!open) {
    text.value = "";
  }
});
</script>
