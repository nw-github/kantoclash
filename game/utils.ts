import type {Random} from "random";
import type {PlayerId, PokeId} from "./events";
import type {AbilityId} from "./species";

export type NonEmptyArray<T> = [T, ...T[]];

export type Weather = "rain" | "sun" | "sand" | "hail";

export type Type =
  | "normal"
  | "rock"
  | "ground"
  | "ghost"
  | "poison"
  | "bug"
  | "flying"
  | "fight"
  | "water"
  | "grass"
  | "fire"
  | "electric"
  | "ice"
  | "psychic"
  | "dragon"
  | "dark"
  | "steel"
  | "???";
export type StageId = (typeof stageKeys)[number];
export type StatStageId = (typeof stageStatKeys)[number];
export type StatId = (typeof statKeys)[number];

export type Stats = Record<StatId, number>;
export type StageStats = Record<StatStageId, number>;

export const stageStatKeys = ["atk", "def", "spa", "spd", "spe"] as const;
export const statKeys = ["hp", ...stageStatKeys] as const;
export const stageKeys = [...stageStatKeys, "acc", "eva"] as const;

export const screens = [
  "light_screen",
  "reflect",
  "safeguard",
  "mist",
  "luckychant",
  "tailwind",
] as const;
export type ScreenId = (typeof screens)[number];

export const hazards = ["spikes", "rocks", "tspikes"] as const;
export type HazardId = (typeof hazards)[number];

// prettier-ignore
export enum VF {
  none         = 0,
  /** Gen 1 only */
  lightScreen  = 0x0000_0001,
  /** Gen 1 only */
  reflect      = 0x0000_0002,
  mist         = 0x0000_0004,
  focusEnergy  = 0x0000_0008,
  destinyBond  = 0x0000_0010,
  curse        = 0x0000_0020,
  protect      = 0x0000_0040,
  endure       = 0x0000_0080,
  nightmare    = 0x0000_0100,
  roost        = 0x0000_0200,
  lockon       = 0x0000_0400,
  grudge       = 0x0000_0800,
  helpingHand  = 0x0000_1000,
  ingrain      = 0x0000_2000,
  flashFire    = 0x0000_4000,
  charge       = 0x0000_8000,
  waterSport   = 0x0001_0000,
  mudSport     = 0x0002_0000,
  followMe     = 0x0004_0000,
  loafing      = 0x0008_0000,
  imprisoning  = 0x0010_0000,
  torment      = 0x0020_0000,
  snatch       = 0x0040_0000,
  magicCoat    = 0x0080_0000,
  gastroAcid   = 0x0100_0000,
  minimize     = 0x0200_0000,
  defenseCurl  = 0x0400_0000,
  powerTrick   = 0x0800_0000,
  aquaRing     = 0x1000_0000,
}

export enum Endure {
  None,
  Endure,
  FocusBand,
  FocusSash,
  Sturdy,
}

// prettier-ignore
export const HP_TYPES: Type[] = [
  "fight", "flying", "poison", "ground", "rock", "bug", "ghost", "steel", "fire", "water",
  "grass", "electric", "psychic", "ice", "dragon", "dark",
];

// prettier-ignore
export const IGNORABLE_ABILITIES = new Set<AbilityId>([
  'battlearmor', 'clearbody', 'damp', 'dryskin', 'filter', 'flashfire', 'flowergift',
  'heatproof', 'hypercutter', 'immunity', 'innerfocus', 'insomnia', 'keeneye', 'leafguard',
  'levitate', 'lightningrod', 'limber', 'magmaarmor', 'marvelscale', 'motordrive', 'oblivious',
  'owntempo', 'sandveil', 'shellarmor', 'shielddust', 'simple', 'snowcloak', 'solidrock',
  'soundproof', 'stickyhold', 'stormdrain', 'sturdy', 'suctioncups', 'tangledfeet', 'thickfat',
  'unaware', 'vitalspirit', 'voltabsorb', 'waterabsorb', 'waterveil', 'whitesmoke', 'wonderguard',
  'bigpecks', 'contrary', 'friendguard', 'heavymetal', 'lightmetal', 'magicbounce', 'multiscale',
  'sapsipper', 'telepathy', 'wonderskin',
]);

export const TypeMod = {
  SUPER_EFFECTIVE: 20,
  MORE_EFFECTIVE: 15,
  EFFECTIVE: 10,
  NOT_VERY_EFFECTIVE: 5,
  NO_EFFECT: 0,
} as const;

export enum MC {
  physical,
  special,
  status,
}

export enum Range {
  /** Targets the user */
  Self,
  /** Targets a random opponent */
  Random,
  /** Targets any adjacent pokemon */
  Adjacent,
  /** Targets any adjacent excluding allies */
  AdjacentFoe,
  /** Targets one ally */
  AdjacentAlly,
  /** Targets self or one adjacent ally */
  SelfOrAdjacentAlly,
  /** Targets any pokemon except the user */
  Any,

  /** Targets all pokemon */
  All,
  /** Targets all allies except the user */
  AllAllies,
  /** Targets any adjacent pokemon, including allies (Earthquake) */
  AllAdjacent,
  /** Targets any adjacent pokemon, excluding allies (Rock Slide) */
  AllAdjacentFoe,
  /** User/Target field or Battle */
  Field,
}

export enum DMF {
  none,
  high_crit,
  drain,
  explosion,
  recharge,
  crash,
  double,
  triple,
  multi,
  multi_turn,
  trap,
  ohko,
  uturn,
  norand,
  rollout,
  minimize,
  remove_hazards,
  remove_screens,
  remove_protect,
  revenge,
  bugbite,
  futuresight,
  assurance,
  hits_defense,
  ignore_defeva,
}

export const isSpreadMove = (range: Range) => range >= Range.All;

export const clamp = (num: number, min: number, max: number) => Math.max(Math.min(num, max), min);

export const hpPercentExact = (current: number, max: number) => (current / max) * 100;

export const hpPercent = (current: number, max: number) => {
  // TODO: research how the game fills the hp bar
  const percent = Math.round(hpPercentExact(current, max));
  if (percent === 0 && current !== 0) {
    return 1;
  }
  return percent;
};

export const idiv = (a: number, b: number) => (a / b) | 0;
export const idiv1 = (a: number, b: number) => Math.max(1, (a / b) | 0);

export const arraysEqual = <T>(a: readonly T[], b: readonly T[]) => {
  return a.length === b.length && a.every((item, i) => b[i] === item);
};

export const randChoiceWeighted = <T>(rng: Random, arr: readonly T[], weights: number[]) => {
  let i;
  for (i = 1; i < weights.length; i++) {
    weights[i] += weights[i - 1];
  }

  const random = rng.float() * weights.at(-1)!;
  for (i = 0; i < weights.length; i++) {
    if (weights[i] > random) {
      break;
    }
  }

  return arr[i];
};

export const playerId = (poke: PokeId): PlayerId => poke.split(":")[0];

export const debugLog = import.meta.dev ? console.debug : (..._args: any[]) => {};

export const c = (v: any, c: number) => `\x1b[0;${c}m${v}\x1b[0m`;

export const n = (v: any) => c(v, 33);

export const isSpecialType = (type: Type) => {
  switch (type) {
    case "normal":
    case "rock":
    case "ground":
    case "ghost":
    case "poison":
    case "bug":
    case "flying":
    case "fight":
    case "steel":
    case "???":
      return false;
    case "water":
    case "grass":
    case "fire":
    case "electric":
    case "ice":
    case "psychic":
    case "dragon":
    case "dark":
      return true;
  }
};

// from ts-reset
type WidenLiteral<T> = T extends string
  ? string
  : T extends number
  ? number
  : T extends boolean
  ? boolean
  : T extends bigint
  ? bigint
  : T extends symbol
  ? symbol
  : T;

declare global {
  interface ReadonlyArray<T> {
    includes(
      searchElement: T | ((WidenLiteral<T> & {}) | undefined),
      fromIndex?: number,
    ): searchElement is T;
    lastIndexOf(
      searchElement: T | ((WidenLiteral<T> & {}) | undefined),
      fromIndex?: number,
    ): number;
    indexOf(searchElement: T | (WidenLiteral<T> & {}) | undefined, fromIndex?: number): number;
  }

  interface Array<T> {
    includes(
      searchElement: T | ((WidenLiteral<T> & {}) | undefined),
      fromIndex?: number,
    ): searchElement is T;
    lastIndexOf(
      searchElement: T | ((WidenLiteral<T> & {}) | undefined),
      fromIndex?: number,
    ): number;
    indexOf(searchElement: T | (WidenLiteral<T> & {}) | undefined, fromIndex?: number): number;
  }

  type bool = boolean;
}

export class TypeEffectiveness {
  shifts = 0;

  modify(mod: number) {
    // prettier-ignore
    switch (mod) {
    case TypeMod.SUPER_EFFECTIVE: this.shifts++; break;
    case TypeMod.NOT_VERY_EFFECTIVE: this.shifts--; break;
    case TypeMod.NO_EFFECT: this.shifts = NaN; break;
    }
  }

  superEffective() {
    return this.shifts > 0;
  }

  notVeryEffective() {
    return this.shifts < 0;
  }

  immune() {
    return Number.isNaN(this.shifts);
  }

  toFloat() {
    return this.immune() ? 0 : 2 ** this.shifts;
  }

  toString() {
    return this.immune() ? "Immune" : `${Math.abs(this.toFloat())}x`;
  }
}

export const deepFreeze = <T>(obj: T): T => {
  if (typeof obj !== "object" || !obj || Object.isFrozen(obj)) {
    return obj;
  }
  for (const k in obj) {
    obj[k as keyof T] = deepFreeze(obj[k as keyof T]);
  }
  return Object.freeze(obj);
};
