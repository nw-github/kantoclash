<template>
  <div class="h-full w-full">
    <UButton
      :label="!maintenance ? 'Start Maintenace Mode' : 'Cancel Maintenance Mode'"
      :loading="maintenance === undefined"
      @click="toggleMaintenance"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: ["admin"],
});

const { $conn } = useNuxtApp();
const toast = useToast();
const maintenance = ref<boolean>();

onMounted(() => {
  $conn.emit("getMaintenance", state => (maintenance.value = state));
});

const toggleMaintenance = () => {
  const prev = maintenance.value;
  maintenance.value = undefined;
  $conn.emit("setMaintenance", !prev, newState => {
    maintenance.value = newState;
    if (newState === prev) {
      toast.add({ title: "Setting maintenance mode failed!" });
    }
  });
};
</script>
