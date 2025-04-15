import __items from "./items.json";
import type {Status} from "./pokemon";
import type {StatStageId} from "./utils";

export type ItemId = keyof typeof __items;
export type ItemData = {
  name: string;
  tm?: string;
};

export const itemList = __items as Record<ItemId, ItemData>;

export const statusBerry: Partial<Record<ItemId, Status | "any" | "confuse">> = {
  mintberry: "slp",
  psncureberry: "psn",
  przcureberry: "par",
  iceberry: "brn",
  burntberry: "frz",

  cheriberry: "par",
  chestoberry: "slp",
  pechaberry: "psn",
  rawstberry: "brn",
  aspearberry: "frz",

  miracleberry: "any",
  lumberry: "any",

  bitterberry: "confuse",
  persimberry: "confuse",
};

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
