import {Generation1} from "./gen1";
import {Generation2} from "./gen2";
import {Generation3} from "./gen3";
import {Generation4} from "./gen4";
import {Generation5} from "./gen5";
import {deepFreeze} from "./utils";

export type Generation = Generation1;

export const GENERATION1 = deepFreeze(new Generation1());
export const GENERATION2 = deepFreeze(new Generation2());
export const GENERATION3 = deepFreeze(new Generation3());
export const GENERATION4 = deepFreeze(new Generation4());
export const GENERATION5 = deepFreeze(new Generation5());

export const GENERATIONS: Partial<Record<number, Generation>> = {
  [1]: GENERATION1,
  [2]: GENERATION2,
  [3]: GENERATION3,
  [4]: GENERATION4,
  [5]: GENERATION5,
};
