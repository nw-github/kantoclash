import __items from "./items.json";
import type {Status} from "./pokemon";
import type {StatStageId, Type} from "./utils";

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
};

export const itemList = __items as Record<ItemId, ItemData>;
