export const readEmptyIfDisabled = <T>(realValue: Ref<T>, empty: T, disabled: unknown) => {
  const isDisabled = toRef(disabled);
  return computed({
    get: () => (isDisabled.value ? empty : realValue.value),
    set: value => (realValue.value = value),
  });
};
