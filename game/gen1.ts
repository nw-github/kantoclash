import type { Random } from "random";
import type { ActivePokemon, Battle } from "./battle";
import { moveList, type Move } from "./moves";
import { speciesList } from "./species";
import { floatTo255, idiv, scaleAccuracy255, type Type } from "./utils";

export type TypeChart = Record<Type, Partial<Record<Type, number>>>;

export const typeChart: TypeChart = {
  normal: { ghost: 0, rock: 0.5, steel: 0.5 },
  rock: { bug: 2, fire: 2, flying: 2, ice: 2, fight: 0.5, ground: 0.5, steel: 0.5 },
  ground: { rock: 2, poison: 2, bug: 0.5, flying: 0, grass: 0.5, fire: 2, electric: 2, steel: 2 },
  ghost: { normal: 0, ghost: 2, psychic: 0, dark: 0.5, steel: 0.5 },
  poison: { rock: 0.5, ground: 0.5, ghost: 0.5, grass: 2, bug: 2, poison: 0.5, steel: 0 },
  bug: {
    ghost: 0.5,
    flying: 0.5,
    fight: 0.5,
    grass: 2,
    fire: 0.5,
    psychic: 2,
    poison: 2,
    dark: 2,
    steel: 0.5,
  },
  flying: { rock: 0.5, bug: 2, fight: 2, grass: 2, electric: 0.5, steel: 0.5 },
  fight: {
    normal: 2,
    rock: 2,
    ghost: 0,
    poison: 0.5,
    bug: 0.5,
    flying: 0.5,
    ice: 2,
    psychic: 0.5,
    dark: 2,
    steel: 2,
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
    steel: 0.5,
  },
  fire: { rock: 0.5, bug: 2, water: 0.5, grass: 2, fire: 0.5, ice: 2, dragon: 0.5, steel: 2 },
  electric: { ground: 0, flying: 2, water: 2, grass: 0.5, electric: 0.5, dragon: 0.5 },
  ice: { ground: 2, flying: 2, water: 0.5, grass: 2, ice: 0.5, dragon: 2, steel: 0.5 },
  psychic: { poison: 2, fight: 2, psychic: 0.5, steel: 0.5, dark: 0 },
  dragon: { dragon: 2, steel: 0.5 },
  dark: { ghost: 2, fight: 0.5, psychic: 2, dark: 0.5, steel: 0.5 },
  steel: { rock: 2, water: 0.5, fire: 0.5, electric: 0.5, ice: 2, steel: 0.5 },
};

const checkAccuracy = (move: Move, battle: Battle, user: ActivePokemon, target: ActivePokemon) => {
  if (!move.acc) {
    return true;
  }

  const chance = scaleAccuracy255(user.v.thrashing?.acc ?? floatTo255(move.acc), user, target);
  // https://www.smogon.com/dex/rb/moves/petal-dance/
  // https://www.youtube.com/watch?v=NC5gbJeExbs
  if (user.v.thrashing) {
    user.v.thrashing.acc = chance;
  }

  if (target.v.invuln || !battle.rand255(chance)) {
    battle.info(user, "miss");
    return false;
  }
  return true;
};

const getCritChance = (user: ActivePokemon, hc: boolean) => {
  const baseSpe = user.base.species.stats.spe;
  if (hc) {
    return user.v.flags.focus ? 4 * Math.floor(baseSpe / 4) : 8 * Math.floor(baseSpe / 2);
  } else {
    return Math.floor(user.v.flags.focus ? baseSpe / 8 : baseSpe / 2);
  }
};

export type CalcDamageParams = {
  lvl: number;
  pow: number;
  atk: number;
  def: number;
  eff: number;
  isCrit: boolean;
  isStab: boolean;
  rand: number | Random | false;

  itemBonus?: boolean;
  weather?: "bonus" | "penalty";
  tripleKick?: number;
  /**
   * Rollout:     2**(n + d) | n: min(consecutive hits, 4), d: defense curl used
   * Fury Cutter: 2**n | n: min(consecutive hits, 4)
   * Rage:        number of times user was damaged while using rage
   */
  moveMod?: number;
  /**
   * Pursuit & target is switching, Stomp and target has minimized, Gust/Twister and target is
   * flying, Earthquake/Magnitude and target is digging
   */
  doubleDmg?: boolean;
};

const calcDamage = ({ lvl, pow, atk, def, eff, isCrit, isStab, rand }: CalcDamageParams) => {
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

export function getDamageVariables(
  special: boolean,
  user: ActivePokemon,
  target: ActivePokemon,
  isCrit: boolean,
) {
  const [atks, defs] = special ? (["spa", "spa"] as const) : (["atk", "def"] as const);

  const ls = special && !!target.owner.light_screen;
  const reflect = !special && !!target.owner.reflect;

  let atk = user.getStat(atks, isCrit);
  let def = target.getStat(defs, isCrit, true, ls || reflect);
  if (atk >= 256 || def >= 256) {
    atk = Math.max(Math.floor(atk / 4) % 256, 1);
    // defense doesn't get capped here on cart, potentially causing divide by 0
    def = Math.max(Math.floor(def / 4) % 256, 1);
  }
  return [atk, def] as const;
}

export const createGeneration = () => {
  return {
    speciesList,
    moveList,
    typeChart,
    getCritChance,
    checkAccuracy,
    calcDamage,
    getDamageVariables,
  };
};

export type Generation = ReturnType<typeof createGeneration>;

export const GENERATION1 = createGeneration();
