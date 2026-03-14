<template>
  <UModal>
    <UAlert
      title="Your team is invalid!"
      :actions="[
        // Bring user to teambuilder
        // { variant: 'solid', color: 'primary', label: 'Fix', click: () =>  },
        {
          variant: 'solid',
          color: 'primary',
          label: 'OK',
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
  </UModal>
</template>

<script setup lang="ts">
defineProps<{errors: Record<number, [string, string[]]>}>();
defineEmits<{close: []}>();
</script>
