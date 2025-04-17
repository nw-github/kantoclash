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
};

export const itemList = __items as Record<ItemId, ItemData>;

export const healBerry: Partial<Record<ItemId, number>> = {
  berry: 10,
  berryjuice: 20,
  goldberry: 30,
  oranberry: 10,
  sitrusberry: 30,
};

export const healPinchBerry: Partial<Record<ItemId, StatStageId>> = {
  /** Confuses natures that are -Atk */
  figyberry: "atk",
  /** Confuses natures that are -SpA */
  wikiberry: "spa",
  /** Confuses natures that are -Spe */
  magoberry: "spe",
  /** Confuses natures that are -SpD */
  aguavberry: "spd",
  /** Confuses natures that are -Def */
  iapapaberry: "def",
};

export const ppBerry: Partial<Record<ItemId, number>> = {
  mysteryberry: 5,
  leppaberry: 10,
};

export const statPinchBerry: Partial<Record<ItemId, StatStageId | "random" | "crit">> = {
  liechiberry: "atk",
  ganlonberry: "def",
  salacberry: "spe",
  petayaberry: "spa",
  apicotberry: "spd",
  lansatberry: "crit",
  starfberry: "random",
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
