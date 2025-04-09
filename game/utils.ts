import type {Random} from "random";
import type {TypeChart} from "./gen";
import type {PlayerId, PokeId} from "./events";

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
export type Stages = (typeof stageKeys)[number];
export type StatStages = (typeof stageStatKeys)[number];

export type Stats = Record<(typeof statKeys)[number], number>;
export type StageStats = Record<StatStages, number>;

export const stageStatKeys = ["atk", "def", "spa", "spd", "spe"] as const;
export const statKeys = ["hp", ...stageStatKeys] as const;
export const stageKeys = [...stageStatKeys, "acc", "eva"] as const;

export const screens = ["light_screen", "reflect", "safeguard", "mist"] as const;
export type Screen = (typeof screens)[number];

// prettier-ignore
export enum VF {
  none         = 0,
  /** Gen 1 only */
  lightScreen  = 0x0000_0001,
  /** Gen 1 only */
  reflect      = 0x0000_0002,
  mist         = 0x0000_0004,
  focusEnergy        = 0x0000_0008,
  destinyBond  = 0x0000_0010,
  curse        = 0x0000_0020,
  protect      = 0x0000_0040,
  endure       = 0x0000_0080,
  nightmare    = 0x0000_0100,
  identified   = 0x0000_0200,
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

  /** Client only */
  cConfused    = 0x8000_0000,
  /** Client only */
  cDisabled    = 0x4000_0000,
  /** Client only */
  cAttract     = 0x2000_0000,
  /** Client only */
  cSubstitute  = 0x1000_0000,
  /** Client only */
  cEncore      = 0x0800_0000,
  /** Client only */
  cMeanLook    = 0x0400_0000,
  /** Client only */
  cSeeded      = 0x0200_0000,
  /** Client only */
  cTaunt       = 0x0100_0000,
  /** Client only */
  cDrowsy      = 0x0080_0000,
}

// prettier-ignore
export const HP_TYPES: Type[] = [
  "fight", "flying", "poison", "ground", "rock", "bug", "ghost", "steel", "fire", "water",
  "grass", "electric", "psychic", "ice", "dragon", "dark",
];

export const floatTo255 = (num: number) => Math.floor((num / 100) * 255);

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

export const getEffectiveness = (typeChart: TypeChart, atk: Type, def: readonly Type[]) => {
  return def.reduce((eff, def) => eff * (typeChart[atk][def] ?? 1), 1);
};

export const isSpecial = (atk: Type) => {
  switch (atk) {
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

export const idiv = (a: number, b: number) => Math.floor(a / b);

export const imul = (a: number, b: number) => Math.floor(a * b);

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

declare global {
  interface ReadonlyArray<T> {
    includes(x: any): x is T;
  }

  interface Array<T> {
    includes(x: any): x is T;
  }

  type bool = boolean;
}
