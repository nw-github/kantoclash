import type {InjectionKey} from "vue";

export const readEmptyIfDisabled = <T>(realValue: Ref<T>, empty: T, disabled: unknown) => {
  const isDisabled = toRef(disabled);
  return computed({
    get: () => (isDisabled.value ? empty : realValue.value),
    set: value => (realValue.value = value),
  });
};

const manager = Symbol() as InjectionKey<ClientManager>;

export const provideManager = (value: ClientManager) => provide(manager, value);
export const injectManager = () => inject(manager);
