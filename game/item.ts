import __items from "./data/items.json";
import type {ArceusForm, GenesectForm, Status} from "./pokemon";
import type {SpeciesId} from "./species";
import type {StatStageId, Type, Weather} from "./utils";

export type ItemId = keyof typeof __items;
export type ItemData = {
  name: string;
  tm?: Type;
  fling?: number;
  desc?: string;
  exists?: bool;

  plate?: ArceusForm;
  drive?: GenesectForm;
  typeBoost?: {type: Type; type2?: Type; percent: number; species?: SpeciesId[]};
  cureStatus?: Status | "any" | "confuse";
  healFixed?: number;
  healSitrus?: bool;
  healPinchNature?: StatStageId;
  statPinch?: StatStageId | "random" | "crit";
  restorePP?: number;
  reduceAcc?: number;
  boostAcc?: number;
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
