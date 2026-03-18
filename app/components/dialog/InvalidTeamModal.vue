<template>
  <UModal>
    <template #content>
      <UAlert
        title="Your team is invalid!"
        variant="outline"
        color="error"
        :actions="[
          {
            variant: 'subtle',
            color: 'success',
            label: `Edit Team`,
            to: `/builder?editing=${teamIdx}`,
            onClick: () => $emit('close'),
          },
          {
            variant: 'outline',
            color: 'neutral',
            label: 'Close',
            onClick: () => $emit('close'),
          },
        ]"
      >
        <template #description>
          <div class="max-h-60 overflow-auto">
            <div v-for="([poke, problems], i) in errors" :key="i">
              <span>{{ poke }}</span>
              <ul class="list-disc pl-8">
                <li v-for="(problem, j) in problems" :key="j">{{ problem }}</li>
              </ul>
            </div>
          </div>
        </template>
      </UAlert>
    </template>
  </UModal>
</template>

<script setup lang="ts">
defineProps<{errors: Record<number, [string, string[]]>; teamIdx?: number}>();
defineEmits<{close: []}>();
</script>
