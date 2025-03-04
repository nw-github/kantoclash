<template>
  <USelectMenu :options="formats" v-bind="$attrs" value-attribute="id" />
</template>

<script setup lang="ts">
const props = defineProps<{ teamOnly?: boolean }>();

const formats = battleFormats
  .filter(id => !props.teamOnly || formatInfo[id].needsTeam)
  .map(id => ({
    id,
    label: formatInfo[id].name,
    icon: formatInfo[id].icon,
  }));
</script>
