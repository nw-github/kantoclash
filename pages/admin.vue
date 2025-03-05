<template>
  <div class="h-full w-full space-x-1">
    <UButton
      :label="!config.maintenance ? 'Start Maintenace Mode' : 'Cancel Maintenance Mode'"
      :loading
      @click="toggle('maintenance')"
    />

    <UButton
      :label="!config.botMatchmaking ? 'Enable Bots' : 'Disable Bots'"
      :loading
      @click="toggle('botMatchmaking')"
    />
  </div>
</template>

<script setup lang="ts">
import type { ServerConfig } from "~/server/gameServer";

definePageMeta({ middleware: ["admin"] });

const { $conn } = useNuxtApp();
const toast = useToast();
const config = ref<ServerConfig>({});
const loading = ref(true);

onMounted(() => {
  if (!$conn.connected) {
    $conn.once("connect", getConfig);
  } else {
    getConfig();
  }
});

const toggle = (key: keyof ServerConfig) => {
  const state = { ...config.value, [key]: !config.value[key] };
  loading.value = true;
  $conn.emit("setConfig", state, worked => {
    loading.value = false;
    if (!worked) {
      toast.add({ title: "Setting maintenance mode failed!" });
      return;
    }
    config.value = state;
  });
};

const getConfig = () => {
  $conn.emit("getConfig", state => {
    if (state) {
      config.value = state;
      loading.value = false;
    } else {
      toast.add({ title: "Getting config failed!" });
    }
  });
};
</script>
