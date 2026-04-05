import {ActivePokemon} from "./active";

type NullableIfOptional<T> = T extends undefined ? T | null | undefined : T | undefined;

export type Diff<T> = {
  [P in keyof T]?: T[P] extends object ? NullableIfOptional<Diff<T[P]>> : NullableIfOptional<T[P]>;
};

type Key = string | symbol;

const dirtyMap = new WeakMap<object, Set<Key>>();

const enproxy = <T extends object>(
  obj: T,
  includeList?: readonly (keyof T)[],
  notifyParent?: () => void,
): T => {
  if (
    !obj ||
    dirtyMap.has(obj) ||
    Object.isFrozen(obj) ||
    obj instanceof ActivePokemon ||
    Array.isArray(obj)
  ) {
    return obj;
  }

  const include = includeList && new Set(includeList);
  const dirty = new Set<Key>();
  const proxy = new Proxy(obj, {
    deleteProperty(target, key) {
      if (target[key as keyof T] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete target[key as keyof T];
        if (!include || include.has(key as keyof T)) {
          dirty.add(key);
          notifyParent?.();
        }
      }
      return true;
    },
    set(target, key, newValue) {
      const relevant = !include || include.has(key as keyof T);
      if (relevant) {
        if (typeof newValue === "object") {
          newValue = enproxy(newValue, undefined, () => {
            dirty.add(key);
            notifyParent?.();
          });
        }

        if (relevant && newValue !== target[key as keyof T]) {
          dirty.add(key);
          notifyParent?.();
        }
      }

      target[key as keyof T] = newValue;
      return true;
    },
  });
  dirtyMap.set(proxy, dirty);

  for (const key in obj) {
    const item = obj[key as keyof T];
    if (typeof item === "object" && (!include || include.has(key))) {
      dirty.add(key);
      obj[key as keyof T] = enproxy(item!, undefined, () => {
        dirty.add(key);
        notifyParent?.();
      }) as any;
    }
  }
  return proxy;
};

export function tracked<T extends object>(obj: T, include?: readonly (keyof T)[]) {
  return enproxy(obj, include);
}

export function flush<T extends object>(obj: T): Diff<T> {
  let dirty;
  if (!obj || !(dirty = dirtyMap.get(obj))) {
    return obj;
  }

  const result: Diff<T> = {};
  for (const k of dirty) {
    const item = obj[k as keyof T];
    if (item === undefined) {
      result[k as keyof T] = null as any;
    } else {
      const value = typeof item === "object" ? flush(item!) : item;
      result[k as keyof T] = value as any;
    }
  }
  dirty.clear();
  return result;
}

export function merge<T extends object>(obj: T, diff: Diff<T>) {
  for (const k in diff) {
    const rhs = diff[k];
    if (rhs === null) {
      obj[k] = undefined as any;
    } else if (
      typeof rhs === "object" &&
      rhs !== null &&
      typeof obj[k] === "object" &&
      obj[k] !== null &&
      !Array.isArray(rhs)
    ) {
      merge(obj[k], rhs);
    } else {
      obj[k] = rhs as any;
    }
  }
}

export default {tracked, flush, merge};
