import {GENERATION1, type Generation} from "./gen1";
import {GENERATION2} from "./gen2";
import {GENERATION3} from "./gen3";
import {GENERATION4} from "./gen4";
export * from "./gen1";
export * from "./gen2";
export * from "./gen3";
export * from "./gen4";

export const GENERATIONS: Partial<Record<number, Generation>> = {
  [1]: GENERATION1,
  [2]: GENERATION2,
  [3]: GENERATION3,
  [4]: GENERATION4,
};
