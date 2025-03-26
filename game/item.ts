import items from "./items.json";
import type {Status} from "./pokemon";

export type ItemId = keyof typeof items;
export {items};

export const statusBerry: Partial<Record<ItemId, Status>> = {
  mintberry: "slp",
  psncureberry: "psn",
  przcureberry: "par",
  iceberry: "brn",
  burntberry: "frz",
};

export const healBerry: Partial<Record<ItemId, number>> = {
  berry: 10,
  berryjuice: 20,
  goldberry: 30,
};
