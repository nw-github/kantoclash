<template>
  <UPopover mode="click" v-model="model" :popper="{ placement: 'bottom-end' }">
    <UAvatar icon="material-symbols:account-circle-full" />
    <template #panel>
      <div class="p-4">
        <AuthState v-slot="{ user }">
          <div v-if="user">
            <div class="flex items-center space-x-2">
              <UAvatar icon="material-symbols:account-circle-full" />
              <h2>{{ user.name }}</h2>
            </div>
            <UDivider class="py-2" />
            <div class="space-y-2">
              <UCheckbox label="Announce presence when spectating" />
              <UButton
                @click="logout"
                :label="!loading ? 'Log out' : 'Logging out...'"
                :loading="loading"
              />
            </div>
          </div>
          <div v-else>
            <AccountForm />
          </div>
        </AuthState>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
const { $conn } = useNuxtApp();
const { clear } = useUserSession();
const loading = ref(false);
const model = defineModel<{ open: boolean }>();

const logout = async () => {
  await clear();
  $conn.disconnect().connect();
};
</script>
