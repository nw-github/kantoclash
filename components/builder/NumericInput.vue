<template>
  <UInput
    v-model.number="text"
    :color="hasError ? 'red' : undefined"
    :max-length="max && String(max).length"
    @keydown="checkDigit"
    @paste="checkPaste"
  />
</template>

<script setup lang="ts">
const model = defineModel<number | undefined>({ default: undefined });
const { min, max } = defineProps<{ min?: number; max?: number }>();

const text = computed({
  get: () => (model.value === undefined ? "" : model.value),
  set: v => (model.value = typeof v === "string" ? undefined : v),
});

const hasError = computed(() => {
  if (typeof text.value === "string") {
    return false;
  }
  return (min !== undefined && text.value < min) || (max !== undefined && text.value > max);
});

const checkDigit = (e: KeyboardEvent) => {
  if (e.ctrlKey || e.altKey) {
    return;
  }

  const isNan = Number.isNaN(+e.key);
  const start = (e.target as HTMLInputElement).selectionStart;
  const end = (e.target as HTMLInputElement).selectionEnd;
  if ((e.key.length === 1 && isNan) || e.key === " " || (e.key === "0" && text.value === 0)) {
    return e.preventDefault();
  } else if (e.key === "0" && start === 0 && end !== String(model.value ?? "").length) {
    return e.preventDefault();
  }
};

const checkPaste = (e: ClipboardEvent) => {
  const data = e.clipboardData!.getData("text");
  if (Number.isNaN(+data)) {
    return e.preventDefault();
  }

  e.clipboardData!.setData("text/plain", String(+data));
};
</script>
