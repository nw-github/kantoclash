import __items from "./items.json";
import type {Status} from "./pokemon";
import type {StatStageId, Type} from "./utils";

export type ItemId = keyof typeof __items;
export type ItemData = {
  name: string;
  tm?: string;
  fling?: number;
  desc?: string;
  exists?: bool;

  typeBoost?: {type: Type; percent: number};
  cureStatus?: Status | "any" | "confuse";
  healFixed?: number;
  healPinchNature?: StatStageId;
  statPinch?: StatStageId | "random" | "crit";
};

export const itemList = __items as Record<ItemId, ItemData>;

export const ppBerry: Partial<Record<ItemId, number>> = {
  mysteryberry: 5,
  leppaberry: 10,
};

export const reduceAccItem: Partial<Record<ItemId, number>> = {
  brightpowder: 10,
  laxincense: 5,
};

export const choiceItem: Partial<Record<ItemId, StatStageId>> = {
  choiceband: "atk",
  choicespecs: "spa",
  choicescarf: "spe",
};
