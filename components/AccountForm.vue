<template>
  <div>
    <UTabs v-model="currentTab" :items="items" />
    <UForm
      ref="form"
      :schema="schema"
      :state="state"
      class="p-2 space-y-2 rounded-lg divide-y divide-gray-200 dark:divide-gray-800 ring-1 ring-gray-200 dark:ring-gray-800 shadow bg-white dark:bg-gray-900"
      @submit="submit"
    >
      <div class="after:w-full after:border-1 space-y-2">
        <UFormGroup label="Username" name="username" required>
          <UInput v-model.trim="state.username" autofocus />
        </UFormGroup>
        <UFormGroup label="Password" name="password" required>
          <UInput v-model="state.password" type="password" />
        </UFormGroup>
        <UFormGroup
          v-if="currentTab === 1"
          label="Confirm Password"
          name="confirmPassword"
          required
        >
          <UInput v-model="state.confirmPassword" type="password" />
        </UFormGroup>
      </div>

      <div class="pt-2">
        <UButton
          v-if="currentTab === 1"
          type="submit"
          icon="material-symbols:person-add"
          :label="!loading ? 'Sign Up' : 'Signing up...'"
          :loading="loading"
        />
        <UButton
          v-else
          type="submit"
          icon="material-symbols:login"
          :label="!loading ? 'Log In' : 'Logging in...'"
          :loading="loading"
        />
      </div>
    </UForm>
  </div>
</template>

<script setup lang="ts">
import { z } from "zod";
import type { Form, FormSubmitEvent } from "#ui/types";

const items = [
  { label: "Log in", icon: "material-symbols:login" },
  { label: "Sign up", icon: "material-symbols:person-add" },
];

const { $conn } = useNuxtApp();
const form = ref<Form<Schema>>();
const state = reactive({ username: undefined, password: undefined, confirmPassword: undefined });
const loading = ref(false);
const currentTab = ref(0);
const { fetch: refresh } = useUserSession();

const schema = userSchema.extend({
  confirmPassword: z
    .string()
    .optional()
    .refine(v => currentTab.value === 0 || v === state.password, "Passwords do not match"),
});

type Schema = z.output<typeof schema>;

const submit = async (event: FormSubmitEvent<Schema>) => {
  form.value!.clear();

  loading.value = true;
  try {
    const body = { username: event.data.username, password: event.data.password };

    await $fetch(currentTab.value === 1 ? "/api/register" : "/api/login", { method: "POST", body });
    await refresh();

    state.username = undefined;
    state.password = undefined;
    state.confirmPassword = undefined;

    $conn.disconnect();
  } catch (err: any) {
    form.value!.setErrors([
      {
        path: "username",
        message: err.data.statusCode === 409 ? "Username already taken" : "Invalid credentials",
      },
    ]);
  } finally {
    loading.value = false;
  }
};
</script>
