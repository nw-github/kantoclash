import {GENERATION1, type Generation} from "./gen1";
import {GENERATION2} from "./gen2";
import {GENERATION3} from "./gen3";
export * from "./gen1";
export * from "./gen2";
export * from "./gen3";

export const GENERATIONS: Partial<Record<number, Generation>> = {
  [1]: GENERATION1,
  [2]: GENERATION2,
  [3]: GENERATION3,
};
