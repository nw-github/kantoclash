import speciesPatches from "./species.json";
import items from "./items.json";
import type {Species, SpeciesId} from "../species";
import {merge} from "../gen2";
import {movePatches, moveScripts, moveOverrides, isAffectedBySheerForce} from "./moves";
import {DamageCalc as Gen3DamageCalc, createItemMergeList} from "../gen3";
import {Generation4} from "../gen4";
import {ActivePokemon, type Battle} from "../battle";
import {
  c,
  clamp,
  debugLog,
  DMF,
  Endure,
  idiv,
  idiv1,
  MC,
  n,
  randChoiceWeighted,
  Range,
  VF,
  type TypeEffectiveness,
  type Type,
  type Weather,
} from "../utils";
import {applyMod, chainMod, chainModIf, Mod} from "./modifier";
import type {Generation} from "../gen";
import type {Random} from "random";
import type {GetDamageParams} from "../gen1";
import type {DamagingMove} from "../moves";

// prettier-ignore
class Rng extends Generation4.Rng {
  override disableTurns(_: Battle) { return 4 + 1; }
  override multiHitCount(battle: Battle) { return randChoiceWeighted(battle.rng, [2, 3, 4, 5], [35, 35, 15, 15]); }
  override bindingMoveTurns(battle: Battle, user: ActivePokemon) {
    if (user.base.itemId === "gripclaw") {
      return 7 + 1;
    }
    return super.bindingMoveTurns(battle, user);
  }
}

type BoostedAttackParams = BoostedDefenseParams & {type: Type};
type BoostedDefenseParams = {
  battle: Battle;
  user: ActivePokemon;
  target: ActivePokemon;
  move: DamagingMove;
  isCrit?: bool;
};
type BoostedPowerParams = BoostedDefenseParams & {type: Type; power: number};
type DamageParams = {
  move: DamagingMove;
  power: number;
  type: Type;
  battle: Battle;
  user: ActivePokemon;
  target: ActivePokemon;
  isCrit?: bool;
  rng?: Random | number | null;
};
type FinalModifierParams = {
  move: DamagingMove;
  user: ActivePokemon;
  target: ActivePokemon;
  isCrit?: bool;
  eff: TypeEffectiveness;
};

// Based on this document: https://www.smogon.com/bw/articles/bw_complete_damage_formula#stab
class DamageCalc {
  private static getBoostedAttack({battle, user, target, isCrit, move, type}: BoostedAttackParams) {
    const targetAbilityId = target.getAbilityId(user);
    const userAbility = user.getAbility();
    const userAbilityId = user.getAbilityId();
    const weather = battle.getWeather();

    const special = move.category === MC.special;
    const atks = special ? "spa" : "atk";

    const statSource = move.id === "foulplay" ? target : user;
    let statChange = statSource.v.stages[atks];
    if (targetAbilityId === "unaware" || (isCrit && statChange < 0)) {
      statChange = 0;
    }

    const A = applyStatStages(battle.gen, statSource.v.stats[atks], statChange);
    const hustle = !special && userAbilityId === "hustle" ? Mod.ATK_HUSTLE : Mod.NONE;
    let mod = Mod.NONE;
    // prettier-ignore
    {
      mod = chainModIf(mod, Mod.ATK_THICKFAT, targetAbilityId === "thickfat" && (type === "ice" || type === "fire"));
      mod = chainModIf(mod, Mod.ATK_PINCHBOOST, userAbility?.pinchBoostType && userAbility.pinchBoostType === type && user.base.belowHp(3));
      mod = chainModIf(mod, Mod.ATK_GUTS, !special && user.base.status && userAbilityId === "guts");
      mod = chainModIf(mod, Mod.ATK_PLUS, special && (userAbilityId === "plus" || userAbilityId === "minus") && user.hasAllyAbility(null, "plus", "minus"));
      mod = chainModIf(mod, Mod.ATK_DEFEATIST, userAbilityId === "defeatist" && user.base.belowHp(2));
      mod = chainModIf(mod, Mod.ATK_PUREPOWER, !special && userAbility?.doubleAtk);
      mod = chainModIf(mod, Mod.ATK_SOLARPOWER, special && weather === "sun" && userAbilityId === "solarpower");
      mod = chainModIf(mod, Mod.ATK_FLASHFIRE, user.v.hasFlag(VF.flashFire) && type === "fire");
      mod = chainModIf(mod, Mod.ATK_SLOWSTART, !special && userAbilityId === "slowstart" && user.v.slowStartTurns < 5);
      mod = chainModIf(mod, Mod.ATK_FLOWERGIFT, !special && weather === "sun" && user.owner.sideHasAbility("flowergift"));
      mod = chainModIf(mod, Mod.ATK_LIGHTBALL, user.base.itemId === "lightball" && user.v.speciesId === "pikachu");
      mod = chainModIf(mod, Mod.ATK_CHOICE, user.base.item?.choice === atks);
      mod = chainModIf(mod, Mod.ATK_DEEPSEATOOTH, special && user.base.itemId === "deepseatooth" && user.v.speciesId === "clamperl");
      mod = chainModIf(mod, Mod.ATK_SOULDEW, special && user.base.itemId === "souldew" && (user.v.speciesId === "latios" || user.v.speciesId === "latias"));
    }
    return applyMod(applyMod(A, hustle), mod);
  }

  private static getBoostedDefense({battle, user, target, isCrit, move}: BoostedDefenseParams) {
    const weather = battle.getWeather();
    const special = move.category === MC.special;
    // TODO: Apply Wonder Room here
    const defs = special && move.flag !== DMF.hits_defense ? "spd" : "def";
    let statChange = target.v.stages[defs];
    if (
      user.getAbilityId() === "unaware" ||
      (isCrit && statChange > 0) ||
      move.flag === DMF.ignore_defeva
    ) {
      statChange = 0;
    }

    let D = applyStatStages(battle.gen, target.v.stats[defs], statChange);
    if (special && weather === "sand" && target.v.hasAnyType("rock")) {
      D = applyMod(D, Mod.DEF_SANDSTORM);
    }

    let mod = Mod.NONE;
    // prettier-ignore
    {
      mod = chainModIf(mod, Mod.DEF_MARVELSCALE, !special && target.getAbilityId(user) === "marvelscale" && target.base.status);
      mod = chainModIf(mod, Mod.DEF_FLOWERGIFT, special && weather === "sun" && target.owner.sideHasAbility("flowergift"));
      mod = chainModIf(mod, Mod.DEF_DEEPSEASCALE, special && target.base.itemId === "deepseascale" && target.v.speciesId === "clamperl");
      mod = chainModIf(mod, Mod.DEF_METALPOWDER, !special && target.base.itemId === "metalpowder" && target.v.speciesId === "ditto");
      mod = chainModIf(mod, Mod.DEF_EVIOLITE, target.base.itemId === "eviolite" && target.v.species.evolvesTo);
      mod = chainModIf(mod, Mod.DEF_SOULDEW, special && target.base.itemId === "souldew" && (target.v.speciesId === "latios" || target.v.speciesId === "latias"));
    }
    return applyMod(D, mod);
  }

  private static getBoostedPower({move, battle, user, target, type, power}: BoostedPowerParams) {
    const hasTypeBoostingItem = () => {
      const typeBoost = user.base.item?.typeBoost;
      return (
        typeBoost &&
        (typeBoost.type === type || typeBoost.type2 === type) &&
        (!typeBoost.species || typeBoost.species.includes(user.v.speciesId))
      );
    };

    const targetAbilityId = target.getAbilityId(user);
    const userAbilityId = user.getAbilityId();
    const weather = battle.getWeather();
    const special = move.category === MC.special;
    let mod = Mod.NONE;
    // prettier-ignore
    {
      mod = chainModIf(mod, Mod.BP_TECHNICIAN, userAbilityId === "technician" && power <= 60);
      mod = chainModIf(mod, Mod.BP_FLAREBOOST, special && user.base.status === "brn" && userAbilityId === "flareboost");
      mod = chainModIf(mod, Mod.BP_ANALYTIC, userAbilityId === "analytic" && move.flag !== DMF.futuresight && target.choice?.executed);
      mod = chainModIf(mod, Mod.BP_RECKLESS, userAbilityId === "reckless" && (move.flag === DMF.crash || move.recoil));
      mod = chainModIf(mod, Mod.BP_IRONFIST, userAbilityId === "ironfist" && move.punch);
      mod = chainModIf(mod, Mod.BP_TOXICBOOST, !special && userAbilityId === "toxicboost" && (user.base.status === "psn" || user.base.status === "tox"));
      let rivalry = Mod.NONE;
      if (userAbilityId === "rivalry" && user.v.gender !== "N" && target.v.gender !== "N") {
        rivalry = user.v.gender === target.v.gender ? Mod.BP_RIVALRY_SAME : Mod.BP_RIVALRY_OPPOSITE;
      }
      mod = chainMod(mod, rivalry);
      mod = chainModIf(mod, Mod.BP_SAND_FORCE, weather === "sand" && userAbilityId === "sandforce" && (type === "rock" || type === "steel" || type === "ground"));
      mod = chainModIf(mod, Mod.BP_HEATPROOF, targetAbilityId === "heatproof" && type === "fire");
      mod = chainModIf(mod, Mod.BP_DRY_SKIN, targetAbilityId === "dryskin" && type === "fire");
      mod = chainModIf(mod, Mod.BP_SHEER_FORCE, userAbilityId === "sheerforce" && isAffectedBySheerForce(move));
      mod = chainModIf(mod, Mod.BP_TYPE_BOOST, hasTypeBoostingItem()); // This covers orbs too
      mod = chainModIf(mod, Mod.BP_MUSCLE_BAND, !special && user.base.itemId === "muscleband");
      mod = chainModIf(mod, Mod.BP_WISE_GLASSES, special && user.base.itemId === "wiseglasses");
      // mod = chainModIf(mod, Mod.BP_GEM, );
      mod = chainModIf(mod, Mod.BP_FACADE, move.id === "facade" && (user.base.status === "brn" || user.base.status === "par" || user.base.status === "psn" || user.base.status === "tox"));
      mod = chainModIf(mod, Mod.BP_BRINE, move.id === "brine" && target.base.belowHp(2));
      mod = chainModIf(mod, Mod.BP_VENOSHOCK, move.id === "venoshock" && (target.base.status === "psn" || target.base.status === "tox"));
      // mod = chainModIf(mod, Mod.BP_RETALIATE, );
      // mod = chainModIf(mod, Mod.BP_FUSION, );
      // mod = chainModIf(mod, Mod.BP_ME_FIRST, );
      mod = chainModIf(mod, Mod.BP_SOLARBEAM_PENALTY, move.charge === "sun" && weather && weather !== "sun");
      mod = chainModIf(mod, Mod.BP_CHARGE, user.v.hasFlag(VF.charge) && type === "electric");
      mod = chainModIf(mod, Mod.BP_HELPINGHAND, user.v.hasFlag(VF.helpingHand));
      if (type === "electric" && battle.allActive.some(poke => poke.v.hasFlag(VF.mudSport))) {
        mod = chainMod(mod, Mod.BP_SPORT);
      } else if (type === "fire" && battle.allActive.some(poke => poke.v.hasFlag(VF.waterSport))) {
        mod = chainMod(mod, Mod.BP_SPORT);
      }
    }
    return applyMod(power, mod);
  }

  private static getFinalModifier({user, target, isCrit, move, eff}: FinalModifierParams) {
    const userAbilityId = user.getAbilityId();
    const targetAlive = target.owner.active.reduce((acc, poke) => acc + Number(!!poke.base.hp), 0);
    const targetAbility = target.getAbility(user);
    const targetAbilityId = target.getAbilityId(user);

    let mod = Mod.NONE;
    // prettier-ignore
    {
      mod = chainModIf(
        mod,
        targetAlive > 1 ? Mod.FINAL_SCREEN_MULTI_TARGET : Mod.FINAL_SCREEN_SINGLE_TARGET,
        userAbilityId !== "infiltrator" && !isCrit && target.owner.screens[move.category === MC.special ? "light_screen" : "reflect"]
      );
      mod = chainModIf(mod, Mod.FINAL_MULTISCALE, target.base.hp === target.base.maxHp && targetAbilityId === "multiscale");
      mod = chainModIf(mod, Mod.FINAL_TINTED_LENS, userAbilityId === "tintedlens" && eff.notVeryEffective());
      mod = chainModIf(mod, Mod.FINAL_FRIEND_GUARD, target.hasAllyAbility(user, "friendguard"));
      mod = chainModIf(mod, Mod.FINAL_SNIPER, userAbilityId === "sniper" && isCrit);
      mod = chainModIf(mod, Mod.FINAL_SOLID_ROCK, targetAbility?.reduceSE && eff.superEffective());
      let metronome = Mod.NONE + Mod.FINAL_METRONOME_BONUS * user.v.metronomeCount;
      if (user.v.metronomeCount > 4) {
        metronome = Mod.FINAL_METRONOME_GT4;
      }
      mod = chainModIf(mod, metronome, user.base.itemId === "metronome");
      mod = chainModIf(mod, Mod.FINAL_EXPERT_BELT, user.base.itemId === "expertbelt" && eff.superEffective());
      mod = chainModIf(mod, Mod.FINAL_LIFE_ORB, user.base.itemId === "lifeorb");
      // mod = chainModIf(mod, Mod.FINAL_DMG_REDUCE_BERRY, );
      mod = chainModIf(mod, Mod.FINAL_DOUBLE_DMG,
        (move.flag === DMF.minimize && target.v.hasFlag(VF.minimize)) ||
        (move.punish && target.v.charging && move.ignore?.includes(target.v.charging.move.id)));
    }
    return mod;
  }

  static calcDamage({power, type, battle, move, user, target, isCrit, rng}: DamageParams) {
    const level = user.base.level;
    const userAbilityId = user.getAbilityId();
    const A = DamageCalc.getBoostedAttack({battle, user, target, isCrit, move, type});
    const D = DamageCalc.getBoostedDefense({battle, user, target, isCrit, move});
    power = DamageCalc.getBoostedPower({battle, user, target, type, power, move});

    let multiTarget = Mod.NONE;
    let stab = Mod.NONE;

    const targetAlive = target.owner.active.reduce((acc, poke) => acc + Number(!!poke.base.hp), 0);
    if (
      (move.range === Range.AllAdjacentFoe && targetAlive > 1) ||
      (move.range == Range.AllAdjacent && battle.getTargets(user, Range.AllAdjacent).length >= 2)
    ) {
      multiTarget = Mod.TARGET_MULTI;
    }

    if (user.v.hasAnyType(type)) {
      stab = userAbilityId === "adaptability" ? Mod.STAB_ADAPTABILITY : Mod.STAB;
    }

    const eff = battle.gen.getEffectiveness(type, target);
    let dmg = idiv(idiv(A * power * (idiv(2 * level, 5) + 2), D), 50) + 2;
    dmg = applyMod(dmg, multiTarget);
    dmg = applyMod(dmg, weatherModifier[battle.getWeather()!]?.[type] ?? Mod.NONE);
    dmg = isCrit ? dmg * 2 : dmg;
    const random = rng === undefined ? battle.rng : rng;
    if (random !== null && move.flag !== DMF.norand) {
      dmg = Gen3DamageCalc.randomizeDamage(dmg, random);
    }
    dmg = applyMod(dmg, stab);
    dmg = eff.shifts < 0 ? dmg >> -eff.shifts : dmg << eff.shifts;
    dmg = user.base.status === "brn" && userAbilityId !== "guts" ? idiv(dmg, 2) : dmg;
    dmg = Math.max(dmg, 1);
    dmg = applyMod(dmg, DamageCalc.getFinalModifier({user, target, isCrit, move, eff}));

    debugLog(`\n${c(user.base.name, 32)} => ${c(target.base.name, 31)} (${c(move.name, 34)})`);
    debugLog(`- P: ${n(power)} | A: ${n(A)} | D: ${n(D)} | L: ${n(level)}`);
    debugLog(`- DMG: ${n(dmg)} | EFF: ${n(eff)} | CRIT: ${n(isCrit)} | Type: ${n(type)}`);
    return {dmg, eff: eff.toFloat()};
  }
}

export class Generation5 extends Generation4 {
  static override Rng = Rng;

  override id = 5;
  override lastMoveIdx = this.moveList.workup.idx!;
  override lastPokemon = 649;
  override rng = new Generation5.Rng();

  constructor() {
    super();
    this.speciesList = merge(
      this.speciesList,
      speciesPatches as Partial<Record<SpeciesId, Partial<Species>>>,
    );
    this.moveList = merge(this.moveList, movePatches);
    this.items = merge(this.items, createItemMergeList(items));
    this.move = merge(this.move, {scripts: moveScripts, overrides: moveOverrides});
  }

  override handleCrashDamage(battle: Battle, user: ActivePokemon) {
    user.damage(idiv1(user.base.maxHp, 2), user, battle, false, "crash", true);
  }

  override getDamage({battle, user, target, move, isCrit, power, rng}: GetDamageParams) {
    if (
      (move.id === "dreameater" && (target.v.substitute || target.base.status !== "slp")) ||
      (move.id === "spitup" && !user.v.stockpile)
    ) {
      return {dmg: 0, eff: 1, miss: true, type: move.type};
    }

    let res;
    if ((res = this.getFixedDamage(battle, user, target, move))) {
      return res;
    }

    let type = user.getAbilityId() === "normalize" ? "normal" : move.type;
    // Hidden Power, Weather Ball, Natural Gift, Judgment, and Techno Blast now overwrite Normalize
    const computed = this.getMoveType(move, user.base, battle.getWeather());
    if (computed !== move.type) {
      type = computed;
    }

    power ??= this.getMoveBasePower(move, user.base, target.base);
    if (move.id === "present") {
      const result = randChoiceWeighted(battle.rng, [40, 80, 120, -4], [40, 30, 10, 20]);
      if (result < 0) {
        return {dmg: -idiv1(target.base.maxHp, 4), eff: 1, miss: false, type};
      }
      power = result;
    } else if (move.id === "furycutter") {
      if (user.v.furyCutter < 5) {
        user.v.furyCutter++;
      }

      power <<= user.v.furyCutter - 1;
    } else if (move.flag === DMF.rollout) {
      const count = 5 - (user.v.thrashing?.turns ?? 5) + +user.v.hasFlag(VF.defenseCurl);
      power <<= count;
    } else if (move.id === "spitup") {
      power *= user.v.stockpile;
      user.v.stockpile = 0;
      battle.syncVolatiles();
    }

    const {eff, dmg} = DamageCalc.calcDamage({
      power,
      type,
      battle,
      move,
      user,
      target,
      isCrit,
      rng,
    });
    return {dmg, eff, miss: false, type};
  }

  // override getConfusionSelfDamage(battle: Battle, user: ActivePokemon) {}

  override handleFutureSight(
    battle: Battle,
    target: ActivePokemon,
    {move, user}: ActivePokemon["futureSight"] & {},
  ) {
    if (user === target) {
      return;
    }

    battle.event({type: "futuresight", src: target.id, move: move.id!, release: true});

    if (user.v.fainted) {
      // Ignore user ability and item if it fainted
      const oldUser = user;
      user = new ActivePokemon(user.base, user.owner, 0);
      user.id = oldUser.id;
      user.v.ability = undefined;
      // TODO: ignore user item
    }

    const isCrit = this.rollCrit(battle, user, target, move);
    const {dmg, eff, type} = this.getDamage({battle, user, target, isCrit, move});
    if (eff === 0) {
      return battle.info(target, "immune");
    } else if (this.tryAbilityImmunity(battle, user, target, move, type, eff)) {
      return;
    } else if (!battle.checkAccuracy(move, target, target)) {
      return;
    }

    target.damage2(battle, {dmg, src: user, isCrit, eff, why: "future_sight"});
    // TODO: endure/sturdy/focus sash/focus band
  }
}

const applyStatStages = (gen: Generation, stat: number, stages: number) => {
  const [num, div] = gen.stageMultipliers[clamp(stages, -6, 6)];
  return idiv(stat * num, div);
};

const weatherModifier: Partial<Record<Weather, Partial<Record<Type, number>>>> = {
  rain: {
    water: Mod.WEATHER_BONUS,
    fire: Mod.WEATHER_PENALTY,
  },
  sun: {
    fire: Mod.WEATHER_BONUS,
    water: Mod.WEATHER_PENALTY,
  },
};
