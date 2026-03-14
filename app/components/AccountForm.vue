<template>
  <UTabs v-model="currentTab" :items>
    <template #content="{item}">
      <UCard :ui="{body: 'p-2 sm:p-2'}">
        <UForm ref="form" :schema :state class="divide-y divide-default" @submit="submit">
          <div class="space-y-2 pb-2">
            <UFormField label="Username" name="username" required>
              <UInput v-model.trim="state.username" autofocus />
            </UFormField>
            <UFormField label="Password" name="password" required>
              <UInput v-model="state.password" type="password" />
            </UFormField>
            <UFormField v-if="item.signUp" label="Confirm Password" name="confirmPassword" required>
              <UInput v-model="state.confirmPassword" type="password" />
            </UFormField>
          </div>

          <div class="pt-2">
            <UButton
              v-if="item.signUp"
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
      </UCard>
    </template>
  </UTabs>
</template>

<script setup lang="ts">
import {z} from "zod";
import type {Form, FormSubmitEvent} from "#ui/types";

const items = [
  {label: "Log in", icon: "material-symbols:login"},
  {label: "Sign up", icon: "material-symbols:person-add", signUp: true},
];

const {$conn} = useNuxtApp();
const form = ref<Form<Schema>>();
const state = reactive({username: undefined, password: undefined, confirmPassword: undefined});
const loading = ref(false);
const currentTab = ref("0");
const {fetch: refresh} = useUserSession();

const schema = userSchema.extend({
  confirmPassword: z
    .string()
    .optional()
    .refine(v => currentTab.value === "0" || v === state.password, "Passwords do not match"),
});

type Schema = z.output<typeof schema>;

const submit = async (event: FormSubmitEvent<Schema>) => {
  form.value!.clear();

  loading.value = true;
  try {
    const body = {username: event.data.username, password: event.data.password};

    await $fetch(currentTab.value === "1" ? "/api/register" : "/api/login", {method: "POST", body});
    await refresh();

    state.username = undefined;
    state.password = undefined;
    state.confirmPassword = undefined;

    $conn.disconnect();
  } catch (err: any) {
    const message = err.data.statusCode === 500 ? "Internal server error" : err.data.message;
    form.value!.setErrors([{name: "username", message}]);
  } finally {
    loading.value = false;
  }
};
</script>
