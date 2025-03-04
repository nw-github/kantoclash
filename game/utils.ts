import type { Random } from "random";
import type { ActivePokemon } from "./battle";

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
  | "dragon";
export type Stages = (typeof stageKeys)[number];
export type Stats = Record<(typeof statKeys)[number], number>;
export type StageStats = Record<(typeof stageStatKeys)[number], number>;

export const stageStatKeys = ["atk", "def", "spc", "spe"] as const;
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

export const calcDamage = ({
  lvl,
  pow,
  atk,
  def,
  eff,
  isCrit,
  isStab,
  rand,
}: {
  lvl: number;
  pow: number;
  atk: number;
  def: number;
  eff: number;
  isCrit: boolean;
  isStab: boolean;
  rand: number | Random | false;
}) => {
  if (eff === 0) {
    return 0;
  }

  lvl *= isCrit ? 2 : 1;
  let dmg = Math.min(idiv(idiv((idiv(2 * lvl, 5) + 2) * pow * atk, def), 50), 997) + 2;
  if (isStab) {
    dmg += idiv(dmg, 2);
  }

  if (eff > 1) {
    dmg = idiv(dmg * 20, 10);
    dmg = eff > 2 ? idiv(dmg * 20, 10) : dmg;
  } else if (eff < 1) {
    dmg = idiv(dmg * 5, 10);
    dmg = eff < 0.5 ? idiv(dmg * 5, 10) : dmg;
  }

  let r = typeof rand === "number" ? rand : 255;
  if (rand && typeof rand !== "number" && dmg > 1) {
    r = rand.int(217, 255);
  }
  return idiv(dmg * r, 255);
};

export const getEffectiveness = (atk: Type, def: Type[]) => {
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
      return false;
    case "water":
    case "grass":
    case "fire":
    case "electric":
    case "ice":
    case "psychic":
    case "dragon":
      return true;
  }
};

export const idiv = (a: number, b: number) => Math.floor(a / b);

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

export const typeChart: Record<Type, Partial<Record<Type, number>>> = {
  normal: { ghost: 0, rock: 0.5 },
  rock: { bug: 2, fire: 2, flying: 2, ice: 2, fight: 0.5, ground: 0.5 },
  ground: { rock: 2, poison: 2, bug: 0.5, flying: 0, grass: 0.5, fire: 2, electric: 2 },
  ghost: { normal: 0, ghost: 2, psychic: 0 },
  poison: { rock: 0.5, ground: 0.5, ghost: 0.5, grass: 2, bug: 2, poison: 0.5 },
  bug: { ghost: 0.5, flying: 0.5, fight: 0.5, grass: 2, fire: 0.5, psychic: 2, poison: 2 },
  flying: { rock: 0.5, bug: 2, fight: 2, grass: 2, electric: 0.5 },
  fight: {
    normal: 2,
    rock: 2,
    ghost: 0,
    poison: 0.5,
    bug: 0.5,
    flying: 0.5,
    ice: 2,
    psychic: 0.5,
  },
  water: { rock: 2, ground: 2, water: 0.5, grass: 0.5, fire: 2, dragon: 0.5 },
  grass: {
    rock: 2,
    ground: 2,
    poison: 0.5,
    bug: 0.5,
    flying: 0.5,
    water: 2,
    fire: 0.5,
    dragon: 0.5,
    grass: 0.5,
  },
  fire: { rock: 0.5, bug: 2, water: 0.5, grass: 2, fire: 0.5, ice: 2, dragon: 0.5 },
  electric: { ground: 0, flying: 2, water: 2, grass: 0.5, electric: 0.5, dragon: 0.5 },
  ice: { ground: 2, flying: 2, water: 0.5, grass: 2, ice: 0.5, dragon: 2 },
  psychic: { poison: 2, fight: 2, psychic: 0.5 },
  dragon: { dragon: 2 },
};
