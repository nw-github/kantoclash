<template>
  <USelectMenu
    v-bind="$attrs"
    value-key="id"
    :items="formats"
    :content="{align: 'start'}"
    :ui="{content: 'min-w-fit'}"
  />
</template>

<script setup lang="ts">
const {teamOnly, noIcons} = defineProps<{teamOnly?: boolean; noIcons?: boolean}>();

const formats = battleFormats
  .filter(id => !teamOnly || formatInfo[id].needsTeam)
  .map(id => ({id, label: formatInfo[id].name, icon: noIcons ? "" : formatInfo[id].icon}));
</script>
