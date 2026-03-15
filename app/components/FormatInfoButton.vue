<template>
  <UPopover mode="hover">
    <UButton
      :ui="{base: 'w-min', label: 'text-xs font-medium text-muted'}"
      :icon="formatInfo[format].icon"
      :label="String(formatInfo[format].generation)"
      color="neutral"
      variant="ghost"
    />

    <template #content>
      <div class="flex flex-col gap-2 p-1 max-w-96">
        <h1 class="text-lg font-bold">{{ formatInfo[format].name }}</h1>

        <span>{{ formatInfo[format].desc }}</span>

        <div class="flex flex-col">
          <span class="font-semibold">Mods:</span>
          <template v-for="(val, mod) in formatInfo[format].mods" :key="mod">
            <span v-if="val" class="text-xs text-muted">
              {{ modNames[mod].name }}: {{ modNames[mod].desc }}
            </span>
          </template>
          <span v-if="Object.values(formatInfo[format].mods).every(v => !v)">None</span>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
defineProps<{format: FormatId}>();
</script>
