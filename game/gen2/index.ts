import {createDefu} from "defu";
import {
  Generation1,
  scaleAccuracy255,
  DamageCalc as Gen1DamageCalc,
  type GetDamageParams,
} from "../gen1";
import type {Species, SpeciesId} from "../species";
import {
  clamp,
  debugLog,
  idiv,
  randChoiceWeighted,
  VF,
  type Stats,
  type StatStageId,
  type Type,
  type Weather,
} from "../utils";
import {moveOverrides, moveScripts, movePatches} from "./moves";
import speciesPatches from "./species.json";
import type {ActivePokemon, Battle} from "../battle";
import type {DamagingMove, Move, MoveId} from "../moves";
import items from "./items.json";
import type {Gender} from "../pokemon";
import {tryDamage} from "./damaging";
import type {ItemData, ItemId} from "../item";

const critStages: Record<number, number> = {
  [0]: 17 / 256,
  [1]: 1 / 8,
  [2]: 1 / 4,
  [3]: 85 / 256,
  [4]: 1 / 2,
};

const accStageMultipliers: Record<number, [num: number, div: number]> = {
  [-6]: [33, 100],
  [-5]: [36, 100],
  [-4]: [43, 100],
  [-3]: [50, 100],
  [-2]: [60, 100],
  [-1]: [75, 100],
  0: [100, 100],
  1: [133, 100],
  2: [266, 100],
  3: [200, 100],
  4: [233, 100],
  5: [266, 100],
  6: [300, 100],
};

const __merge = createDefu((obj, key, value) => {
  if (Array.isArray(obj[key])) {
    obj[key] = value;
    return true;
  }
});

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] | undefined;
};

export const merge = <T extends object>(a: T, b: DeepPartial<T>): T => __merge(b, a) as any;

// prettier-ignore
class Rng extends Generation1.Rng {
  override maxThrash = 2;

  override tryDefrost(battle: Battle) { return battle.rand255(25) }

  override tryCrit(battle: Battle, user: ActivePokemon, hc: boolean) {
    let stages = hc ? 2 : 0;
    if (user.v.hasFlag(VF.focusEnergy)) {
      stages++;
    }
    stages += user.base.item?.raiseCrit ?? 0;
    if (user.base.item?.boostCrit && user.base.item?.boostCrit === user.base.real.speciesId) {
      stages += 2;
    }
    return battle.rand255Good(DamageCalc.P(critStages[Math.min(stages, 4)] * 100));
  }

  override sleepTurns(battle: Battle) {
    let rng = battle.rng.int(0, 255);
    let sleepTurns = rng & 7;
    while (!sleepTurns || sleepTurns === 7) {
      rng = (rng * 5 + 1) & 255;
      sleepTurns = rng & 7;
    }
    return sleepTurns;
  }

  override disableTurns(battle: Battle) { return battle.rng.int(2, 8) + 1; }

  override thrashDuration(battle: Battle) { return battle.rng.int(2, 3); }

  override bindingMoveTurns(battle: Battle, _user: ActivePokemon) { return this.multiHitCount(battle) + 1; }
}

type BaseDamageParams = {
  explosion?: bool;
  power: number; // u8
  level: number; // u8
  A: number; // u8
  D: number; // u8
  typeboost?: number;
  isCrit?: bool;
};

type StabParams = {
  type: Type;
  user: ActivePokemon;
  target: ActivePokemon;
  weather?: Weather;
  move: DamagingMove;
};

class DamageCalc extends Gen1DamageCalc {
  // command damagestats (BattleCommand_DamageStats)
  static override getDamageVariables(
    user: ActivePokemon,
    target: ActivePokemon,
    special: bool,
    isCrit: bool,
  ) {
    // Metal powder can cause stat wraparound like light screen/reflect
    function applyMetalPowder(A: number, D: number) {
      let tmp = D + (D >> 1);
      const overflow = tmp > 255;

      tmp &= 0xff;
      D = tmp;
      if (overflow) {
        A = Math.max(1, A >> 1);
        D = (D >> 1) | (1 << 7);
      }

      return [A, D];
    }

    const [atks, defs] = special ? (["spa", "spd"] as const) : (["atk", "def"] as const);
    let A = user.v.stats[atks];
    let D = target.v.stats[defs];
    if (target.v.hasFlag(defs === "def" ? VF.reflect : VF.lightScreen)) {
      D <<= 1;
    }

    // TODO: > or >=?
    if (isCrit && target.v.stages[defs] > user.v.stages[atks]) {
      A = user.base.stats[atks];
      D = target.base.stats[defs];
    }

    [A, D] = DamageCalc.truncate(A, D);
    // Metal powder works for both transformed and untransformed Ditto in gen 2
    if (target.base.speciesId === "ditto" || target.base.real.speciesId === "ditto") {
      [A, D] = applyMetalPowder(A, D);
    }

    return {A, D, level: user.base.level & 0xff} as const;
  }

  // command damagecalc (BattleCommand_DamageCalc)
  static override calcBaseDamage({
    power,
    level,
    A,
    D,
    explosion,
    typeboost,
    isCrit,
  }: BaseDamageParams) {
    if (explosion) {
      D >>= 1;
    }

    D = Math.max(1, D);
    let dmg = idiv(idiv((idiv(level * 2, 5) + 2) * power * A, D), 50);
    if (typeboost) {
      dmg = idiv(dmg * (100 + typeboost), 100);
    }

    if (isCrit) {
      dmg = Math.min(dmg << 1, 0xffff);
    }

    return Math.min(dmg, 997) + 2;
  }

  // command stab (BattleCommand_Stab)
  static override applyTypeModifiers(dmg: number, {weather, type, user, target, move}: StabParams) {
    let modifier = weatherModifier[weather!]?.[type] ?? EFFECTIVE;
    if (move.charge === "sun" && weather && weather !== "sun") {
      modifier = NOT_VERY_EFFECTIVE;
    }

    dmg = idiv(dmg * modifier, 10);
    if (user.v.hasAnyType(type)) {
      dmg = (dmg + (dmg >> 1)) & 0xffff;
    }

    let eff = 1;
    for (const [atktype, deftype, modifier] of typeMatchupTable) {
      if (deftype === "ghost" && modifier === NO_EFFECT && target.v.identified) {
        break;
      } else if (atktype === type && target.v.hasAnyType(deftype)) {
        if (modifier === NO_EFFECT) {
          dmg = 0;
          eff *= modifier / 10;
          break;
        }

        dmg = Math.max(1, idiv(dmg * modifier, 10));
      }
    }
    return {dmg, eff, miss: false};
  }

  // TruncateHL_BC
  static truncate(A: number, D: number) {
    if (A > 0xff || D > 0xff) {
      // A / 4
      A = Math.max(A >> 2, 1);
      D = Math.max(D >> 2, 1);
    }

    // A, D, power, and level are all u8 values
    A &= 0xff;
    D &= 0xff;
    return [A, D];
  }
}

export class Generation2 extends Generation1 {
  static override Rng = Rng;

  override id = 2;
  override lastMoveIdx = this.moveList.zapcannon.idx!;
  override lastPokemon = 251;
  override rng = new Generation2.Rng();
  override accStageMultipliers = accStageMultipliers;

  constructor() {
    super();
    this.speciesList = merge(
      this.speciesList,
      speciesPatches as Partial<Record<SpeciesId, Partial<Species>>>,
    );
    this.moveList = merge(this.moveList, movePatches);
    this.typeChart = merge(this.typeChart, {
      ghost: {psychic: 2},
      poison: {bug: 1},
      bug: {poison: 0.5},
      ice: {fire: 0.5},
    });
    this.items = merge(this.items, items as Partial<Record<ItemId, ItemData>>);
    this.move = merge(this.move, {scripts: moveScripts, overrides: moveOverrides});
  }

  override beforeUseMove(battle: Battle, move: Move, user: ActivePokemon) {
    const resetVolatiles = () => {
      user.v.charging = undefined;
      user.v.invuln = false;
      user.v.bide = undefined;
      if (user.v.thrashing?.turns !== -1) {
        user.v.thrashing = undefined;
      }
      user.v.trapping = undefined;
      user.v.furyCutter = 0;
    };

    if (user.v.recharge) {
      battle.info(user, "recharge");
      user.v.recharge = undefined;
      resetVolatiles();
      return false;
    } else if (user.base.status === "slp") {
      if (--user.base.sleepTurns === 0) {
        user.unstatus(battle, "wake");
        resetVolatiles();
      } else {
        battle.info(user, "sleep");
        if (!move.sleepOnly) {
          resetVolatiles();
          return false;
        }
      }
    } else if (user.base.status === "frz" && !move.selfThaw) {
      battle.info(user, "frozen");
      resetVolatiles();
      return false;
    }

    if (user.v.flinch) {
      battle.info(user, "flinch");
      resetVolatiles();
      return false;
    }

    if (user.v.disabled && --user.v.disabled.turns === 0) {
      user.v.disabled = undefined;
      battle.info(user, "disable_end", [{id: user.id, v: {flags: user.v.cflags}}]);
    }

    if (user.handleConfusion(battle)) {
      resetVolatiles();
      return false;
    }

    if (user.v.attract) {
      battle.event({type: "in_love", src: user.id, target: user.v.attract.id});

      if (battle.gen.rng.tryAttract(battle)) {
        battle.info(user, "immobilized");
        resetVolatiles();
        return false;
      }
    }

    if (user.base.status === "par" && battle.gen.rng.tryFullPara(battle)) {
      battle.info(user, "paralyze");
      resetVolatiles();
      return false;
    }

    return true;
  }

  override isValidMove(battle: Battle, user: ActivePokemon, move: MoveId, i: number) {
    if (user.v.lockedIn() && user.v.lockedIn() !== battle.gen.moveList[move]) {
      return false;
    } else if (i === user.v.disabled?.indexInMoves) {
      return false;
    } else if (user.base.pp[i] === 0) {
      return false;
    } else if (user.v.encore && i !== user.v.encore.indexInMoves) {
      return false;
    } else if (user.v.choiceLock !== undefined && i !== user.v.choiceLock) {
      return false;
    } else if (user.v.tauntTurns && battle.gen.moveList[move].kind !== "damage") {
      return false;
    } else if (battle.allActive.some(p => p.isImprisoning(user, move))) {
      return false;
    } else if (
      user.v.hasFlag(VF.torment) &&
      i === user.v.lastMoveIndex &&
      user.v.lastMove !== user.v.thrashing?.move
    ) {
      return false;
    }

    return true;
  }

  override checkAccuracy(move: Move, battle: Battle, user: ActivePokemon, target: ActivePokemon) {
    if (target.v.invuln) {
      const charging = target.v.charging && target.v.charging.move.id;
      if (charging && (!move.ignore || !move.ignore.includes(charging))) {
        battle.miss(user, target);
        return false;
      }
    }

    const acc0 = this.getMoveAcc(move, battle.getWeather());
    if (!acc0) {
      return true;
    }

    let chance = DamageCalc.P(acc0);
    if (move.kind === "damage" && move.flag === "ohko") {
      chance = (user.base.level - target.base.level) * 2 + 76;
    }

    let acc = scaleAccuracy255(chance, user, target);
    if (target.base.itemId === "brightpowder") {
      acc -= 20;
    }

    debugLog(`[${user.base.name}] ${move.name} (Acc ${acc}/255)`);
    if (!battle.rand255Good(acc)) {
      battle.miss(user, target);
      return false;
    }
    return true;
  }

  override getDamage({
    battle,
    user,
    target,
    move,
    isCrit,
    power,
    rng,
    skipType,
    tripleKick,
    beatUp,
  }: GetDamageParams) {
    if ((move.flag === "drain" || move.flag === "dream_eater") && target.v.substitute) {
      return {dmg: 0, eff: 1, miss: true, type: move.type};
    }

    let res;
    if ((res = this.getFixedDamage(battle, user, target, move))) {
      return res;
    }

    let A, D, level;
    if (beatUp) {
      // These stats are already byte values
      A = beatUp.stats.atk;
      D = target.base.stats.def;
      level = beatUp.level;
    } else {
      ({A, D, level} = DamageCalc.getDamageVariables(user, target, this.isSpecial(move), isCrit));
    }

    const type = this.getMoveType(move, user.base, battle.getWeather());
    power ??= this.getMoveBasePower(move, user.base, target.base);

    if (move.flag === "present") {
      const result = randChoiceWeighted(battle.rng, [40, 80, 120, -4], [40, 30, 10, 20]);
      if (result < 0) {
        return {dmg: -Math.max(idiv(target.base.stats.hp, 4), 1), eff: 1, miss: false, type};
      }
      power = result;
    }

    let dmg = DamageCalc.calcBaseDamage({
      A,
      D,
      level,
      isCrit,
      power,
      explosion: move.flag === "explosion",
      typeboost: getTypeBoost(user, type),
    });

    if (tripleKick) {
      // command triplekick (BattleCommand_TripleKick)
      dmg = Math.min(dmg * tripleKick, 0xffff);
    }

    let eff = 1;
    if (move.id !== "struggle" && !skipType) {
      ({dmg, eff} = DamageCalc.applyTypeModifiers(dmg, {
        weather: battle.getWeather(),
        type,
        user,
        target,
        move,
      }));
    }

    if (move.flag === "fury_cutter" && user.v.furyCutter) {
      // command furycutter
      // technically, fury cutter should be incremented here
      // user.v.furyCutter++;
      dmg = Math.min(dmg << Math.min(user.v.furyCutter, 5), 0xffff);
    } else if (move.flag === "rollout") {
      // command rolloutpower
      const count = (user.v.thrashing?.turns ?? 0) + +user.v.usedDefenseCurl;
      dmg = Math.min(dmg << count, 0xffff);
    } else if (move.flag === "rage") {
      // command ragedamage
      dmg = Math.min(dmg * user.v.rage, 0xffff);
    }

    const random = !rng && rng !== null ? battle.rng : rng;
    if (random) {
      dmg = DamageCalc.randomizeDamage(dmg, random);
    }

    // commands doubleundergrounddamage, doubleflyingdamage, doubleminimizedamage, pursuit
    if (
      user.v.inPursuit ||
      (move.flag === "minimize" && target.v.usedMinimize) ||
      (move.punish && target.v.charging && move.ignore?.includes(target.v.charging.move.id))
    ) {
      dmg = Math.min(dmg << 1, 0xffff);
    }

    return {dmg, miss: false, eff, type};
  }

  override handleCrashDamage(
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    dmg: number,
  ) {
    dmg = Math.min(dmg, target.base.hp);
    user.damage(idiv(dmg, 8), user, battle, false, "crash", true);
  }

  override getConfusionSelfDamage(_battle: Battle, user: ActivePokemon) {
    let [A, D] = [user.v.stats.atk, user.v.stats.def];
    if (user.owner.screens.reflect) {
      D *= 2;
    }
    [A, D] = DamageCalc.truncate(A, D);
    // Confusion is affected by the user's type boosting items and explosion defense drop
    return DamageCalc.calcBaseDamage({
      A,
      D,
      level: user.base.level,
      isCrit: false,
      power: 40,
      explosion: user.choice?.move?.kind === "damage" && user.choice?.move?.flag === "explosion",
      typeboost: getTypeBoost(user, user.choice?.move?.type ?? "???"),
    });
  }

  override canOHKOHit(user: ActivePokemon, target: ActivePokemon) {
    return target.base.level <= user.base.level;
  }

  override recalculateStat(poke: ActivePokemon, battle: Battle, stat: StatStageId) {
    const [num, div] = battle.gen.stageMultipliers[poke.v.stages[stat]];
    poke.v.stats[stat] = clamp(idiv(poke.base.stats[stat] * num, div), 1, 999);
  }

  override getGender(
    _desired: Gender | undefined,
    species: Species,
    atk: number,
  ): Gender | undefined {
    if (species.genderRatio) {
      return atk < 15 - Math.floor(species.genderRatio * 15) ? "F" : "M";
    } else if (species.genderRatio === 0) {
      return "F";
    } else {
      return "N";
    }
  }

  override getShiny(_desired: bool | undefined, dvs: Partial<Stats>) {
    return (
      dvs.def === 10 &&
      dvs.spe === 10 &&
      dvs.spa === 10 &&
      [2, 3, 6, 7, 10, 11, 14, 15].includes(dvs.atk)
    );
  }

  override accumulateBide() {}

  override tryDamage = tryDamage;

  override handleRage(battle: Battle, poke: ActivePokemon) {
    if (poke.v.lastMove?.kind === "damage" && poke.v.lastMove.flag === "rage") {
      battle.info(poke, "rage");
      poke.v.rage++;
    }
  }
}

const SUPER_EFFECTIVE = 20;
const MORE_EFFECTIVE = 15;
const EFFECTIVE = 10;
const NOT_VERY_EFFECTIVE = 5;
const NO_EFFECT = 0;

const weatherModifier: Partial<Record<Weather, Partial<Record<Type, number>>>> = {
  rain: {
    water: MORE_EFFECTIVE,
    fire: NOT_VERY_EFFECTIVE,
  },
  sun: {
    fire: MORE_EFFECTIVE,
    water: NOT_VERY_EFFECTIVE,
  },
};

const typeMatchupTable: [Type, Type, number][] = [
  ["normal", "rock", NOT_VERY_EFFECTIVE],
  ["normal", "steel", NOT_VERY_EFFECTIVE],
  ["fire", "fire", NOT_VERY_EFFECTIVE],
  ["fire", "water", NOT_VERY_EFFECTIVE],
  ["fire", "grass", SUPER_EFFECTIVE],
  ["fire", "ice", SUPER_EFFECTIVE],
  ["fire", "bug", SUPER_EFFECTIVE],
  ["fire", "rock", NOT_VERY_EFFECTIVE],
  ["fire", "dragon", NOT_VERY_EFFECTIVE],
  ["fire", "steel", SUPER_EFFECTIVE],
  ["water", "fire", SUPER_EFFECTIVE],
  ["water", "water", NOT_VERY_EFFECTIVE],
  ["water", "grass", NOT_VERY_EFFECTIVE],
  ["water", "ground", SUPER_EFFECTIVE],
  ["water", "rock", SUPER_EFFECTIVE],
  ["water", "dragon", NOT_VERY_EFFECTIVE],
  ["electric", "water", SUPER_EFFECTIVE],
  ["electric", "electric", NOT_VERY_EFFECTIVE],
  ["electric", "grass", NOT_VERY_EFFECTIVE],
  ["electric", "ground", NO_EFFECT],
  ["electric", "flying", SUPER_EFFECTIVE],
  ["electric", "dragon", NOT_VERY_EFFECTIVE],
  ["grass", "fire", NOT_VERY_EFFECTIVE],
  ["grass", "water", SUPER_EFFECTIVE],
  ["grass", "grass", NOT_VERY_EFFECTIVE],
  ["grass", "poison", NOT_VERY_EFFECTIVE],
  ["grass", "ground", SUPER_EFFECTIVE],
  ["grass", "flying", NOT_VERY_EFFECTIVE],
  ["grass", "bug", NOT_VERY_EFFECTIVE],
  ["grass", "rock", SUPER_EFFECTIVE],
  ["grass", "dragon", NOT_VERY_EFFECTIVE],
  ["grass", "steel", NOT_VERY_EFFECTIVE],
  ["ice", "water", NOT_VERY_EFFECTIVE],
  ["ice", "grass", SUPER_EFFECTIVE],
  ["ice", "ice", NOT_VERY_EFFECTIVE],
  ["ice", "ground", SUPER_EFFECTIVE],
  ["ice", "flying", SUPER_EFFECTIVE],
  ["ice", "dragon", SUPER_EFFECTIVE],
  ["ice", "steel", NOT_VERY_EFFECTIVE],
  ["ice", "fire", NOT_VERY_EFFECTIVE],
  ["fight", "normal", SUPER_EFFECTIVE],
  ["fight", "ice", SUPER_EFFECTIVE],
  ["fight", "poison", NOT_VERY_EFFECTIVE],
  ["fight", "flying", NOT_VERY_EFFECTIVE],
  ["fight", "psychic", NOT_VERY_EFFECTIVE],
  ["fight", "bug", NOT_VERY_EFFECTIVE],
  ["fight", "rock", SUPER_EFFECTIVE],
  ["fight", "dark", SUPER_EFFECTIVE],
  ["fight", "steel", SUPER_EFFECTIVE],
  ["poison", "grass", SUPER_EFFECTIVE],
  ["poison", "poison", NOT_VERY_EFFECTIVE],
  ["poison", "ground", NOT_VERY_EFFECTIVE],
  ["poison", "rock", NOT_VERY_EFFECTIVE],
  ["poison", "ghost", NOT_VERY_EFFECTIVE],
  ["poison", "steel", NO_EFFECT],
  ["ground", "fire", SUPER_EFFECTIVE],
  ["ground", "electric", SUPER_EFFECTIVE],
  ["ground", "grass", NOT_VERY_EFFECTIVE],
  ["ground", "poison", SUPER_EFFECTIVE],
  ["ground", "flying", NO_EFFECT],
  ["ground", "bug", NOT_VERY_EFFECTIVE],
  ["ground", "rock", SUPER_EFFECTIVE],
  ["ground", "steel", SUPER_EFFECTIVE],
  ["flying", "electric", NOT_VERY_EFFECTIVE],
  ["flying", "grass", SUPER_EFFECTIVE],
  ["flying", "fight", SUPER_EFFECTIVE],
  ["flying", "bug", SUPER_EFFECTIVE],
  ["flying", "rock", NOT_VERY_EFFECTIVE],
  ["flying", "steel", NOT_VERY_EFFECTIVE],
  ["psychic", "fight", SUPER_EFFECTIVE],
  ["psychic", "poison", SUPER_EFFECTIVE],
  ["psychic", "psychic", NOT_VERY_EFFECTIVE],
  ["psychic", "dark", NO_EFFECT],
  ["psychic", "steel", NOT_VERY_EFFECTIVE],
  ["bug", "fire", NOT_VERY_EFFECTIVE],
  ["bug", "grass", SUPER_EFFECTIVE],
  ["bug", "fight", NOT_VERY_EFFECTIVE],
  ["bug", "poison", NOT_VERY_EFFECTIVE],
  ["bug", "flying", NOT_VERY_EFFECTIVE],
  ["bug", "psychic", SUPER_EFFECTIVE],
  ["bug", "ghost", NOT_VERY_EFFECTIVE],
  ["bug", "dark", SUPER_EFFECTIVE],
  ["bug", "steel", NOT_VERY_EFFECTIVE],
  ["rock", "fire", SUPER_EFFECTIVE],
  ["rock", "ice", SUPER_EFFECTIVE],
  ["rock", "fight", NOT_VERY_EFFECTIVE],
  ["rock", "ground", NOT_VERY_EFFECTIVE],
  ["rock", "flying", SUPER_EFFECTIVE],
  ["rock", "bug", SUPER_EFFECTIVE],
  ["rock", "steel", NOT_VERY_EFFECTIVE],
  ["ghost", "normal", NO_EFFECT],
  ["ghost", "psychic", SUPER_EFFECTIVE],
  ["ghost", "dark", NOT_VERY_EFFECTIVE],
  ["ghost", "steel", NOT_VERY_EFFECTIVE],
  ["ghost", "ghost", SUPER_EFFECTIVE],
  ["dragon", "dragon", SUPER_EFFECTIVE],
  ["dragon", "steel", NOT_VERY_EFFECTIVE],
  ["dark", "fight", NOT_VERY_EFFECTIVE],
  ["dark", "psychic", SUPER_EFFECTIVE],
  ["dark", "ghost", SUPER_EFFECTIVE],
  ["dark", "dark", NOT_VERY_EFFECTIVE],
  ["dark", "steel", NOT_VERY_EFFECTIVE],
  ["steel", "fire", NOT_VERY_EFFECTIVE],
  ["steel", "water", NOT_VERY_EFFECTIVE],
  ["steel", "electric", NOT_VERY_EFFECTIVE],
  ["steel", "ice", SUPER_EFFECTIVE],
  ["steel", "rock", SUPER_EFFECTIVE],
  ["steel", "steel", NOT_VERY_EFFECTIVE],
  ["normal", "ghost", NO_EFFECT],
  ["fight", "ghost", NO_EFFECT],
] as const;

const getTypeBoost = (user: ActivePokemon, type: Type) => {
  if (user.base.item?.typeBoost?.type === type) {
    return user.base.item.typeBoost.percent;
  }
  return 0;
};
