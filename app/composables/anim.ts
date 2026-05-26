import type {InjectionKey} from "vue";
import APNG from "~/libs/apng";
import {loadGIF, type Gif} from "~/libs/libgif";

export class AnimationCache {
  cache: Partial<Record<string, APNG | Gif>> = {};
  loading: Partial<Record<string, Promise<APNG | Gif>>> = {};

  static async rawLoad(src: string) {
    const data = await fetch(src).then(data => data.arrayBuffer());
    return src.endsWith("gif") ? await loadGIF(data) : new APNG(data);
  }

  load(src: string) {
    if (this.cache[src]) {
      return this.cache[src];
    } else if (this.loading[src]) {
      return this.loading[src];
    } else {
      return (this.loading[src] = (async () => {
        this.cache[src] = await AnimationCache.rawLoad(src);
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.loading[src];
        return this.cache[src];
      })());
    }
  }

  clear() {
    for (const key in this.cache) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete this.cache[key];
    }
  }
}

const animCacheKey = Symbol() as InjectionKey<AnimationCache>;

export const provideAnimationCache = (cache: AnimationCache) => provide(animCacheKey, cache);
export const injectAnimationCache = () => inject(animCacheKey);
