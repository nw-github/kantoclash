import type {Random} from "random";
import type {ActivePokemon} from "./battle";
import type {TypeChart} from "./gen";

export type Weather = "rain" | "sun" | "sand";

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
  | "steel";
export type Stages = (typeof stageKeys)[number];
export type StatStages = (typeof stageStatKeys)[number];

export type Stats = Record<(typeof statKeys)[number], number>;
export type StageStats = Record<StatStages, number>;

export const stageStatKeys = ["atk", "def", "spa", "spd", "spe"] as const;
export const statKeys = ["hp", ...stageStatKeys] as const;
export const stageKeys = [...stageStatKeys, "acc", "eva"] as const;

export type VolatileFlag = (typeof volatileFlags)[number];

export const volatileFlags = ["light_screen", "reflect", "mist", "focus", "seeded"] as const;

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

export const scaleAccuracy255 = (acc: number, user: ActivePokemon, target: ActivePokemon) => {
  // https://bulbapedia.bulbagarden.net/wiki/Accuracy#Generation_I_and_II
  acc *=
    (stageMultipliers[user.v.stages["acc"]] / 100) *
    (stageMultipliers[-target.v.stages["eva"]] / 100);
  return clamp(Math.floor(acc), 1, 255);
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

export const stageMultipliers: Record<number, number> = {
  [-6]: 25,
  [-5]: 28,
  [-4]: 33,
  [-3]: 40,
  [-2]: 50,
  [-1]: 66,
  0: 100,
  1: 150,
  2: 200,
  3: 250,
  4: 300,
  5: 350,
  6: 400,
};

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

declare global {
  interface ReadonlyArray<T> {
    includes(x: any): x is T;
  }

  interface Array<T> {
    includes(x: any): x is T;
  }
}
