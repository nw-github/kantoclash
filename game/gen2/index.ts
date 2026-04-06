import {createDefu} from "defu";
import {
  Generation1,
  scaleAccuracy255,
  DamageCalc as Gen1DamageCalc,
  type GetDamageParams,
} from "../gen1";
import type {Species, SpeciesId} from "../species";
import {
  c,
  clamp,
  debugLog,
  DMF,
  idiv1,
  idiv,
  n,
  TypeMod,
  VF,
  type Stats,
  type StatStageId,
  type Type,
  type Weather,
  TypeEffectiveness,
} from "../utils";
import {moveOverrides, moveScripts, movePatches, tryDamage} from "./moves";
import speciesPatches from "./species.json";
import items from "./items.json";
import type {Battlemon, Battle} from "../battle";
import type {DamagingMove, Move, MoveId} from "../moves";
import type {Gender} from "../pokemon";
import type {ItemData, ItemId} from "../item";
import type {Calc} from "../calc";

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

  override tryCrit(battle: Battle, user: Battlemon, hc: boolean) {
    let stages = hc ? 2 : 0;
    if (user.v.hasFlag(VF.focusEnergy)) {
      stages++;
    }
    stages += user.base.item?.raiseCrit ?? 0;
    if (user.base.item?.boostCrit && user.base.item?.boostCrit === user.v.speciesId) {
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

  override bindingMoveTurns(battle: Battle, _user: Battlemon) { return this.multiHitCount(battle) + 1; }
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
  user: Battlemon;
  target: Battlemon;
  weather?: Weather;
  move: DamagingMove;
};

class DamageCalc extends Gen1DamageCalc {
  static override getBoostedDefense({target}: {target: Battlemon}) {
    return {def: target.v.stats.def, spd: target.v.stats.spd};
  }

  // command damagestats (BattleCommand_DamageStats)
  static override getDamageVariables(
    user: Battlemon,
    target: Battlemon,
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
    if (target.owner.screens[special ? "light_screen" : "reflect"]) {
      D <<= 1;
    }

    // TODO: > or >=?
    if (isCrit && target.v.stages[defs] > user.v.stages[atks]) {
      A = user.v.baseStats[atks];
      D = target.v.baseStats[defs];
    }

    [A, D] = DamageCalc.truncate(A, D);
    // Metal powder works for both transformed and untransformed Ditto in gen 2
    if (target.base.speciesId === "ditto") {
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
    let modifier = weatherModifier[weather!]?.[type] ?? TypeMod.EFFECTIVE;
    if (move.charge === "sun" && weather && weather !== "sun") {
      modifier = TypeMod.NOT_VERY_EFFECTIVE;
    }

    dmg = idiv(dmg * modifier, 10);
    if (user.v.hasAnyType(type)) {
      dmg = (dmg + (dmg >> 1)) & 0xffff;
    }

    const eff = new TypeEffectiveness();
    for (const [atktype, deftype, modifier] of typeMatchupTable) {
      if (deftype === "ghost" && modifier === TypeMod.NO_EFFECT && target.v.identified) {
        break;
      } else if (atktype === type && target.v.hasAnyType(deftype)) {
        eff.modify(modifier);
        if (modifier === TypeMod.NO_EFFECT) {
          dmg = 0;
          break;
        }

        dmg = idiv1(dmg * modifier, 10);
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
  override calc: Calc = DamageCalc;
  override accStageMultipliers = accStageMultipliers;
  override typeMatchupTable = typeMatchupTable;

  constructor() {
    super();
    this.speciesList = merge(
      this.speciesList,
      speciesPatches as Partial<Record<SpeciesId, Partial<Species>>>,
    );
    this.moveList = merge(this.moveList, movePatches);
    this.items = merge(this.items, items as Partial<Record<ItemId, ItemData>>);
    this.move = merge(this.move, {scripts: moveScripts, overrides: moveOverrides});
  }

  override beforeUseMove(battle: Battle, move: Move, user: Battlemon) {
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
      battle.info(user, "disable_end");
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

  override isValidMove(battle: Battle, user: Battlemon, move: MoveId, i: number) {
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
      user.v.lastMove !== user.v.thrashing?.move &&
      user.v.lastMove?.id !== "struggle"
    ) {
      return false;
    }

    return true;
  }

  override checkAccuracy(move: Move, battle: Battle, user: Battlemon, target: Battlemon) {
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
    if (move.kind === "damage" && move.flag === DMF.ohko) {
      if (target.base.level > user.base.level) {
        battle.miss(user, target);
        return false;
      }

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
    tripleKick,
    beatUp,
  }: GetDamageParams) {
    if (
      (move.flag === DMF.drain && target.v.substitute) ||
      (move.id === "dreameater" && target.base.status !== "slp")
    ) {
      return {dmg: 0, eff: 1, miss: true, type: move.type};
    }

    let res;
    if ((res = this.getFixedDamage(battle, user, target, move))) {
      return res;
    }

    const type = this.getMoveType(move, user.base, battle.getWeather());

    let A, D, level;
    if (beatUp) {
      // These stats are already byte values
      A = beatUp.species.stats.atk;
      D = target.v.species.stats.def;
      level = beatUp.level;
    } else if (move.id === "present") {
      // https://github.com/pret/pokecrystal/blob/c73ab9e9c9a8b6eaee38f19fdcf956c1baf268ea/engine/battle/move_effects/present.asm#L2
      //
      // In GS and Crystal link battles, BattleCommand_Present calls BattleCommand_Stab without
      // preserving bc and de. (at this point, b = attack, c = defense, d = power, e = level)
      //
      // BattleCommand_Stab clobbers bc and de, so this ends up with:
      // b = [wTypeMatchup]  ; Present is normal type, so it will only be 0/5/10
      // c = attacker type 2 ; if the Pokémon has one type, both types have the same value
      //  - Note:
      //          I haven't tested this theory, but BattleCommand_Stab loads the attacker's second type into
      //          `c` very early into the function. It is preserved to the end of call *unless* the STAB check
      //          passes, in which case `bc` gets overwritten with `wCurDamage` and shifted right 1.
      //
      //          Before Present's script calls BattleCommand_Present, it calls BattleCommand_DamageStats,
      //          which zeroes out the wCurDamage. (and loads the damage variables into b, c, and d in the first place)
      //
      //          Ultimately, this results in 0 going into `c`, which is the same as if we had used
      //          attacker type 2, since there aren't any Present users that have normal as a first
      //          type and something else as a secondary type.
      //
      //          If someone wants to test this, try hacking Present onto Girafarig and attacking a non steel/rock type.
      //          If this theory is correct   b = 10, c = 0   ((wCurDamage >> 1) & 0xff)
      //          Otherwise                   b = 10, c = 24  (index of type psychic)
      // e = defender type 2
      //
      // The power gets randomly determined after this, so that isn't affected by the bug
      A = target.v.hasAnyType("rock", "steel") ? TypeMod.NOT_VERY_EFFECTIVE : TypeMod.EFFECTIVE;
      D = typeIndexNumber[user.v.types[1] ?? user.v.types[0]];
      level = typeIndexNumber[target.v.types[1] ?? target.v.types[0]];
    } else {
      ({A, D, level} = DamageCalc.getDamageVariables(
        user,
        target,
        this.isSpecial(move, type),
        isCrit,
      ));
    }

    power ??= this.getMoveBasePower(move, battle, user, target);
    if (power < 0) {
      return {dmg: -idiv1(target.base.maxHp, 4), eff: 1, miss: false, type};
    }

    let dmg = DamageCalc.calcBaseDamage({
      A,
      D,
      level,
      isCrit,
      power,
      explosion: move.flag === DMF.explosion,
      typeboost: getTypeBoost(user, type),
    });

    if (tripleKick) {
      // command triplekick (BattleCommand_TripleKick)
      dmg = Math.min(dmg * tripleKick, 0xffff);
    }

    let eff = new TypeEffectiveness();
    if (move.id !== "struggle" && move.flag !== DMF.futuresight) {
      ({dmg, eff} = DamageCalc.applyTypeModifiers(dmg, {
        weather: battle.getWeather(),
        type,
        user,
        target,
        move,
      }));
    }

    if (move.id === "furycutter" && user.v.furyCutter) {
      // command furycutter
      user.v.furyCutter = (user.v.furyCutter + 1) & 0xff;
      dmg = Math.min(dmg << Math.min(user.v.furyCutter, 5), 0xffff);
    } else if (move.flag === DMF.rollout) {
      // command rolloutpower
      const count = 5 - (user.v.thrashing?.turns ?? 5) + +user.v.hasFlag(VF.defenseCurl);
      dmg = Math.min(dmg << count, 0xffff);
    } else if (move.id === "rage") {
      // command ragedamage
      dmg = Math.min(dmg * user.v.rage, 0xffff);
    }

    const random = !rng && rng !== null ? battle.rng : rng;
    if (random && move.flag !== DMF.norand) {
      dmg = DamageCalc.randomizeDamage(dmg, random);
    }

    // commands doubleundergrounddamage, doubleflyingdamage, doubleminimizedamage, pursuit
    if (
      user.v.inPursuit ||
      (move.flag === DMF.minimize && target.v.hasFlag(VF.minimize)) ||
      (move.punish && target.v.charging && move.ignore?.includes(target.v.charging.move.id))
    ) {
      dmg = Math.min(dmg << 1, 0xffff);
    }

    debugLog(`\n${c(user.base.name, 32)} => ${c(target.base.name, 31)} (${c(move.name, 34)})`);
    debugLog(`- P: ${n(power)} | A: ${n(A)} | D: ${n(D)} | L: ${n(level)}`);
    debugLog(`- DMG: ${n(dmg)} | EFF: ${n(eff)} | CRIT: ${n(isCrit)} | Type: ${n(type)}`);
    return {dmg, miss: false, eff: eff.toFloat(), type};
  }

  override handleCrashDamage(battle: Battle, user: Battlemon, target: Battlemon, dmg: number) {
    dmg = Math.min(dmg, target.base.hp);
    user.damage(idiv1(dmg, 8), user, battle, false, "crash", true);
  }

  override rollCrit(battle: Battle, user: Battlemon, _target: Battlemon, move: DamagingMove) {
    if (move.fixedDamage || this.move.overrides.dmg[move.id!]) {
      return false;
    }
    return this.rng.tryCrit(battle, user, move.flag === DMF.high_crit);
  }

  override getConfusionSelfDamage(_battle: Battle, user: Battlemon) {
    let [A, D] = [user.v.stats.atk, user.v.stats.def];
    if (user.owner.screens.reflect) {
      D *= 2;
    }
    [A, D] = DamageCalc.truncate(A, D);
    // Confusion is affected by the user's type boosting items and explosion defense drop
    const dmg = DamageCalc.calcBaseDamage({
      A,
      D,
      level: user.base.level,
      isCrit: false,
      power: 40,
      explosion: user.choice?.move?.kind === "damage" && user.choice?.move?.flag === DMF.explosion,
      typeboost: getTypeBoost(user, user.choice?.move?.type ?? "???"),
    });
    return {dmg};
  }

  override recalculateStat(poke: Battlemon, battle: Battle, stat: StatStageId) {
    const [num, div] = battle.gen.stageMultipliers[poke.v.stages[stat]];
    poke.v.stats[stat] = clamp(idiv(poke.v.baseStats[stat] * num, div), 1, 999);
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

  override getEffectiveness(type: Type, target: Battlemon) {
    return DamageCalc.applyTypeModifiers(0, {
      type,
      user: target,
      target,
      move: this.moveList.pound as DamagingMove /* only used for solarbeam */,
    }).eff;
  }

  override accumulateBide() {}

  override tryDamage = tryDamage;

  override handleRage(battle: Battle, poke: Battlemon) {
    if (poke.v.lastMove?.kind === "damage" && poke.v.lastMove.id === "rage") {
      battle.info(poke, "rage");
      poke.v.rage++;
    }
  }
}

const weatherModifier: Partial<Record<Weather, Partial<Record<Type, number>>>> = {
  rain: {
    water: TypeMod.MORE_EFFECTIVE,
    fire: TypeMod.NOT_VERY_EFFECTIVE,
  },
  sun: {
    fire: TypeMod.MORE_EFFECTIVE,
    water: TypeMod.NOT_VERY_EFFECTIVE,
  },
};

const typeMatchupTable: [Type, Type, number][] = [
  ["normal", "rock", TypeMod.NOT_VERY_EFFECTIVE],
  ["normal", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["fire", "fire", TypeMod.NOT_VERY_EFFECTIVE],
  ["fire", "water", TypeMod.NOT_VERY_EFFECTIVE],
  ["fire", "grass", TypeMod.SUPER_EFFECTIVE],
  ["fire", "ice", TypeMod.SUPER_EFFECTIVE],
  ["fire", "bug", TypeMod.SUPER_EFFECTIVE],
  ["fire", "rock", TypeMod.NOT_VERY_EFFECTIVE],
  ["fire", "dragon", TypeMod.NOT_VERY_EFFECTIVE],
  ["fire", "steel", TypeMod.SUPER_EFFECTIVE],
  ["water", "fire", TypeMod.SUPER_EFFECTIVE],
  ["water", "water", TypeMod.NOT_VERY_EFFECTIVE],
  ["water", "grass", TypeMod.NOT_VERY_EFFECTIVE],
  ["water", "ground", TypeMod.SUPER_EFFECTIVE],
  ["water", "rock", TypeMod.SUPER_EFFECTIVE],
  ["water", "dragon", TypeMod.NOT_VERY_EFFECTIVE],
  ["electric", "water", TypeMod.SUPER_EFFECTIVE],
  ["electric", "electric", TypeMod.NOT_VERY_EFFECTIVE],
  ["electric", "grass", TypeMod.NOT_VERY_EFFECTIVE],
  ["electric", "ground", TypeMod.NO_EFFECT],
  ["electric", "flying", TypeMod.SUPER_EFFECTIVE],
  ["electric", "dragon", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "fire", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "water", TypeMod.SUPER_EFFECTIVE],
  ["grass", "grass", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "poison", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "ground", TypeMod.SUPER_EFFECTIVE],
  ["grass", "flying", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "bug", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "rock", TypeMod.SUPER_EFFECTIVE],
  ["grass", "dragon", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["ice", "water", TypeMod.NOT_VERY_EFFECTIVE],
  ["ice", "grass", TypeMod.SUPER_EFFECTIVE],
  ["ice", "ice", TypeMod.NOT_VERY_EFFECTIVE],
  ["ice", "ground", TypeMod.SUPER_EFFECTIVE],
  ["ice", "flying", TypeMod.SUPER_EFFECTIVE],
  ["ice", "dragon", TypeMod.SUPER_EFFECTIVE],
  ["ice", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["ice", "fire", TypeMod.NOT_VERY_EFFECTIVE],
  ["fight", "normal", TypeMod.SUPER_EFFECTIVE],
  ["fight", "ice", TypeMod.SUPER_EFFECTIVE],
  ["fight", "poison", TypeMod.NOT_VERY_EFFECTIVE],
  ["fight", "flying", TypeMod.NOT_VERY_EFFECTIVE],
  ["fight", "psychic", TypeMod.NOT_VERY_EFFECTIVE],
  ["fight", "bug", TypeMod.NOT_VERY_EFFECTIVE],
  ["fight", "rock", TypeMod.SUPER_EFFECTIVE],
  ["fight", "dark", TypeMod.SUPER_EFFECTIVE],
  ["fight", "steel", TypeMod.SUPER_EFFECTIVE],
  ["poison", "grass", TypeMod.SUPER_EFFECTIVE],
  ["poison", "poison", TypeMod.NOT_VERY_EFFECTIVE],
  ["poison", "ground", TypeMod.NOT_VERY_EFFECTIVE],
  ["poison", "rock", TypeMod.NOT_VERY_EFFECTIVE],
  ["poison", "ghost", TypeMod.NOT_VERY_EFFECTIVE],
  ["poison", "steel", TypeMod.NO_EFFECT],
  ["ground", "fire", TypeMod.SUPER_EFFECTIVE],
  ["ground", "electric", TypeMod.SUPER_EFFECTIVE],
  ["ground", "grass", TypeMod.NOT_VERY_EFFECTIVE],
  ["ground", "poison", TypeMod.SUPER_EFFECTIVE],
  ["ground", "flying", TypeMod.NO_EFFECT],
  ["ground", "bug", TypeMod.NOT_VERY_EFFECTIVE],
  ["ground", "rock", TypeMod.SUPER_EFFECTIVE],
  ["ground", "steel", TypeMod.SUPER_EFFECTIVE],
  ["flying", "electric", TypeMod.NOT_VERY_EFFECTIVE],
  ["flying", "grass", TypeMod.SUPER_EFFECTIVE],
  ["flying", "fight", TypeMod.SUPER_EFFECTIVE],
  ["flying", "bug", TypeMod.SUPER_EFFECTIVE],
  ["flying", "rock", TypeMod.NOT_VERY_EFFECTIVE],
  ["flying", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["psychic", "fight", TypeMod.SUPER_EFFECTIVE],
  ["psychic", "poison", TypeMod.SUPER_EFFECTIVE],
  ["psychic", "psychic", TypeMod.NOT_VERY_EFFECTIVE],
  ["psychic", "dark", TypeMod.NO_EFFECT],
  ["psychic", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "fire", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "grass", TypeMod.SUPER_EFFECTIVE],
  ["bug", "fight", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "poison", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "flying", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "psychic", TypeMod.SUPER_EFFECTIVE],
  ["bug", "ghost", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "dark", TypeMod.SUPER_EFFECTIVE],
  ["bug", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["rock", "fire", TypeMod.SUPER_EFFECTIVE],
  ["rock", "ice", TypeMod.SUPER_EFFECTIVE],
  ["rock", "fight", TypeMod.NOT_VERY_EFFECTIVE],
  ["rock", "ground", TypeMod.NOT_VERY_EFFECTIVE],
  ["rock", "flying", TypeMod.SUPER_EFFECTIVE],
  ["rock", "bug", TypeMod.SUPER_EFFECTIVE],
  ["rock", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["ghost", "normal", TypeMod.NO_EFFECT],
  ["ghost", "psychic", TypeMod.SUPER_EFFECTIVE],
  ["ghost", "dark", TypeMod.NOT_VERY_EFFECTIVE],
  ["ghost", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["ghost", "ghost", TypeMod.SUPER_EFFECTIVE],
  ["dragon", "dragon", TypeMod.SUPER_EFFECTIVE],
  ["dragon", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["dark", "fight", TypeMod.NOT_VERY_EFFECTIVE],
  ["dark", "psychic", TypeMod.SUPER_EFFECTIVE],
  ["dark", "ghost", TypeMod.SUPER_EFFECTIVE],
  ["dark", "dark", TypeMod.NOT_VERY_EFFECTIVE],
  ["dark", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["steel", "fire", TypeMod.NOT_VERY_EFFECTIVE],
  ["steel", "water", TypeMod.NOT_VERY_EFFECTIVE],
  ["steel", "electric", TypeMod.NOT_VERY_EFFECTIVE],
  ["steel", "ice", TypeMod.SUPER_EFFECTIVE],
  ["steel", "rock", TypeMod.SUPER_EFFECTIVE],
  ["steel", "steel", TypeMod.NOT_VERY_EFFECTIVE],
  ["normal", "ghost", TypeMod.NO_EFFECT],
  ["fight", "ghost", TypeMod.NO_EFFECT],
] as const;

const typeIndexNumber: Record<Type, number> = {
  normal: 0,
  fight: 1,
  flying: 2,
  poison: 3,
  ground: 4,
  rock: 5,
  bug: 7,
  ghost: 8,
  steel: 9,
  "???": 19,
  fire: 20,
  water: 21,
  grass: 22,
  electric: 23,
  psychic: 24,
  ice: 25,
  dragon: 26,
  dark: 27,
};

const getTypeBoost = (user: Battlemon, type: Type) => {
  if (user.base.item?.typeBoost?.type === type) {
    return user.base.item.typeBoost.percent;
  }
  return 0;
};
