import __items from "./items.json";
import type {Status} from "./pokemon";
import type {SpeciesId} from "./species";
import type {StatStageId, Type, Weather} from "./utils";

export type ItemId = keyof typeof __items;
export type ItemData = {
  name: string;
  tm?: Type;
  fling?: number;
  desc?: string;
  exists?: bool;

  typeBoost?: {type: Type; percent: number; plate?: bool};
  cureStatus?: Status | "any" | "confuse";
  healFixed?: number;
  healPinchNature?: StatStageId;
  statPinch?: StatStageId | "random" | "crit";
  restorePP?: number;
  reduceAcc?: number;
  choice?: StatStageId;
  raiseCrit?: number;
  kingsRock?: bool;
  halveSpeed?: bool;
  laggingTail?: bool;
  reduceType?: Type;
  extendWeather?: Weather;
  statusOrb?: Status;
  boostStats?: Partial<
    Record<SpeciesId, {stats: StatStageId[]; amount: number; transformed: bool}>
  >;
};

export const itemList = __items as Record<ItemId, ItemData>;
