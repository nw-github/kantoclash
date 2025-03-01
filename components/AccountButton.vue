<template>
  <UPopover v-model="model" mode="click" :popper="{ placement: 'bottom-end' }">
    <UButton icon="material-symbols:account-circle-full" variant="ghost" color="gray" />
    <template #panel>
      <div class="p-4">
        <AuthState v-slot="{ user }">
          <div v-if="user">
            <div class="flex items-center space-x-2">
              <UIcon name="material-symbols:account-circle-full" class="size-5" />
              <h2>{{ user.name }}</h2>
            </div>
            <UDivider class="py-2" />
            <div class="space-y-2">
              <UCheckbox v-model="filter" label="Enable profanity filter" />
              <UCheckbox v-model="challenges" label="Ignore challenges" />
              <UButton
                :label="!loading ? 'Log out' : 'Logging out...'"
                :loading="loading"
                @click="logout"
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
import { UButton } from "#components";

const { $conn } = useNuxtApp();
const { clear } = useUserSession();
const filter = useChatCensorEnabled();
const challenges = useIgnoreChallenges();
const loading = ref(false);
const model = defineModel<{ open: boolean }>();

const logout = async () => {
  await clear();
  $conn.disconnect();
};
</script>
