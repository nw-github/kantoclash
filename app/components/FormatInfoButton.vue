<template>
  <PopoverButton
    :ui="{base: 'w-min'}"
    :icon="formatInfo[format].icon"
    color="neutral"
    variant="ghost"
  >
    <template #trailing>
      <span class="text-xs font-medium text-muted">
        {{ formatInfo[format].generation }}
      </span>
    </template>

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
  </PopoverButton>
</template>

<script setup lang="ts">
defineProps<{format: FormatId}>();
</script>
