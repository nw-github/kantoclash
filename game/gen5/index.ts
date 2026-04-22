import speciesPatches from "./species.json";
import items from "./items.json";
import type {Species, SpeciesId} from "../species";
import {merge} from "../gen2";
import {movePatches, moveScripts, moveOverrides, isAffectedBySheerForce} from "./moves";
import {DamageCalc as Gen3DamageCalc, createItemMergeList} from "../gen3";
import {Generation4} from "../gen4";
import type {Battlemon, Battle} from "../battle";
import {
  c,
  applyStatStages,
  debugLog,
  DMF,
  Endure,
  idiv,
  idiv1,
  MC,
  n,
  randChoiceWeighted,
  Range,
  TypeEffectiveness,
  VF,
  type Type,
  type Weather,
} from "../utils";
import {applyMod, chainMod, chainModIf, Mod} from "./modifier";
import type {GetDamageParams, TryEndureParams} from "../gen1";
import type {DamagingMove, Move} from "../moves";
import type {Calc} from "../calc";
import type {Pokemon} from "../pokemon";

// prettier-ignore
class Rng extends Generation4.Rng {
  override disableTurns(_: Battle) { return 4 + 1; }
  override multiHitCount(battle: Battle) { return randChoiceWeighted(battle.rng, [2, 3, 4, 5], [35, 35, 15, 15]); }
  override bindingMoveTurns(battle: Battle, user: Battlemon) {
    if (user.hasItem("gripclaw")) {
      return 7 + 1;
    }
    return super.bindingMoveTurns(battle, user);
  }
}

type BoostedAttackParams = BoostedDefenseParams & {type: Type};
type BoostedDefenseParams = {
  battle: Battle;
  user: Battlemon;
  target: Battlemon;
  move: DamagingMove;
  isCrit?: bool;
};
type BoostedPowerParams = BoostedDefenseParams & {type: Type; power: number};

type FinalModifierParams = {
  move: DamagingMove;
  user: Battlemon;
  target: Battlemon;
  isCrit?: bool;
  eff: TypeEffectiveness;
};

// Based on this document: https://www.smogon.com/bw/articles/bw_complete_damage_formula#stab
class DamageCalc {
  static getBoostedAttack({battle, user, target, isCrit, move, type}: BoostedAttackParams) {
    let m_atk = Mod.NONE;
    let m_spa = Mod.NONE;

    const chainBoth = (mod: number, cond: any) => {
      m_atk = chainModIf(m_atk, mod, cond);
      m_spa = chainModIf(m_spa, mod, cond);
    };

    const targetAbilityId = target.getAbilityId(user);
    const userAbility = user.getAbility();
    const userAbilityId = user.getAbilityId();
    const {id: userItemId, data: userItemData} = user.getItemIdAndData();
    const weather = battle.getWeather();

    const statSource = move.id === "foulplay" ? target : user;
    let {atk: statChangeAtk, spa: statChangeSpa} = statSource.v.stages;
    if (targetAbilityId === "unaware" || (isCrit && statChangeAtk < 0)) {
      statChangeAtk = 0;
    }
    if (targetAbilityId === "unaware" || (isCrit && statChangeSpa < 0)) {
      statChangeSpa = 0;
    }

    const atk = applyStatStages(battle.gen, statSource.v.stats.atk, statChangeAtk);
    const spa = applyStatStages(battle.gen, statSource.v.stats.spa, statChangeSpa);

    // prettier-ignore
    {
      chainBoth(Mod.ATK_THICKFAT, targetAbilityId === "thickfat" && (type === "ice" || type === "fire"));
      chainBoth(Mod.ATK_PINCHBOOST, userAbility?.pinchBoostType && userAbility.pinchBoostType === type && user.base.belowHp(3));
      m_atk = chainModIf(m_atk, Mod.ATK_GUTS, user.base.status && userAbilityId === "guts");
      m_spa = chainModIf(m_spa, Mod.ATK_PLUS, (userAbilityId === "plus" || userAbilityId === "minus") && user.hasAllyAbility(null, "plus", "minus"));
      chainBoth(Mod.ATK_DEFEATIST, userAbilityId === "defeatist" && user.base.belowHp(2));
      m_atk = chainModIf(m_atk, Mod.ATK_PUREPOWER, userAbility?.doubleAtk);
      m_spa = chainModIf(m_spa, Mod.ATK_SOLARPOWER, weather === "sun" && userAbilityId === "solarpower");
      chainBoth(Mod.ATK_FLASHFIRE, user.v.hasFlag(VF.flashFire) && type === "fire");
      m_atk = chainModIf(m_atk, Mod.ATK_SLOWSTART, userAbilityId === "slowstart" && user.v.slowStartTurns < 5);
      m_atk = chainModIf(m_atk, Mod.ATK_FLOWERGIFT, weather === "sun" && user.owner.sideHasAbility("flowergift"));
      chainBoth(Mod.ATK_LIGHTBALL, userItemId === "lightball" && user.v.speciesId === "pikachu");
      m_atk = chainModIf(m_atk, Mod.ATK_CHOICE, userItemData?.choice === "atk");
      m_spa = chainModIf(m_spa, Mod.ATK_CHOICE, userItemData?.choice === "spa");
      m_spa = chainModIf(m_spa, Mod.ATK_DEEPSEATOOTH, userItemId === "deepseatooth" && user.v.speciesId === "clamperl");
      m_spa = chainModIf(m_spa, Mod.ATK_SOULDEW, userItemId === "souldew" && (user.v.speciesId === "latios" || user.v.speciesId === "latias"));
    }

    const hustle = userAbilityId === "hustle" ? Mod.ATK_HUSTLE : Mod.NONE;
    return {atk: applyMod(applyMod(atk, hustle), m_atk), spa: applyMod(spa, m_spa)};
  }

  static getBoostedDefense({battle, user, target, isCrit, move}: BoostedDefenseParams) {
    // TODO: Apply Wonder Room here
    let {def: statChangeDef, spd: statChangeSpd} = target.v.stages;
    const unaware = user.getAbilityId() === "unaware";
    if (unaware || (isCrit && statChangeDef > 0) || move.flag === DMF.ignore_defeva) {
      statChangeDef = 0;
    }
    if (unaware || (isCrit && statChangeSpd > 0)) {
      statChangeSpd = 0;
    }

    let def = applyStatStages(battle.gen, target.v.stats.def, statChangeDef);
    let spd = applyStatStages(battle.gen, target.v.stats.spd, statChangeSpd);
    const weather = battle.getWeather();
    if (weather === "sand" && target.v.hasAnyType("rock")) {
      spd = applyMod(spd, Mod.DEF_SANDSTORM);
    }

    const targetItemId = target.getItemId();

    let m_def = Mod.NONE;
    let m_spd = Mod.NONE;
    // prettier-ignore
    {
      m_def = chainModIf(m_def, Mod.DEF_MARVELSCALE, target.getAbilityId(user) === "marvelscale" && target.base.status);
      m_spd = chainModIf(m_spd, Mod.DEF_FLOWERGIFT, weather === "sun" && target.owner.sideHasAbility("flowergift"));
      m_spd = chainModIf(m_spd, Mod.DEF_DEEPSEASCALE, targetItemId === "deepseascale" && target.v.speciesId === "clamperl");
      m_def = chainModIf(m_def, Mod.DEF_METALPOWDER, targetItemId === "metalpowder" && target.v.speciesId === "ditto");
      m_def = chainModIf(m_def, Mod.DEF_EVIOLITE, targetItemId === "eviolite" && target.v.species.evolvesTo);
      m_spd = chainModIf(m_spd, Mod.DEF_EVIOLITE, targetItemId === "eviolite" && target.v.species.evolvesTo);
      m_spd = chainModIf(m_spd, Mod.DEF_SOULDEW, targetItemId === "souldew" && (target.v.speciesId === "latios" || target.v.speciesId === "latias"));
    }

    def = applyMod(def, m_def);
    spd = move.flag === DMF.hits_defense ? def : applyMod(spd, m_spd);
    return {def, spd};
  }

  static getBoostedPower({move, battle, user, target, type, power}: BoostedPowerParams) {
    const {id: userItemId, data: userItemData} = user.getItemIdAndData();
    const hasTypeBoostingItem = () => {
      const typeBoost = userItemData?.typeBoost;
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
      mod = chainModIf(mod, Mod.BP_MUSCLE_BAND, !special && userItemId === "muscleband");
      mod = chainModIf(mod, Mod.BP_WISE_GLASSES, special && userItemId === "wiseglasses");
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

  static getFinalModifier({user, target, isCrit, move, eff}: FinalModifierParams) {
    const userItemId = user.getItemId();
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
      mod = chainModIf(mod, metronome, userItemId === "metronome");
      mod = chainModIf(mod, Mod.FINAL_EXPERT_BELT, userItemId === "expertbelt" && eff.superEffective());
      mod = chainModIf(mod, Mod.FINAL_LIFE_ORB, userItemId === "lifeorb");
      // mod = chainModIf(mod, Mod.FINAL_DMG_REDUCE_BERRY, );
      mod = chainModIf(mod, Mod.FINAL_DOUBLE_DMG,
        (move.flag === DMF.minimize && target.v.hasFlag(VF.minimize)) ||
        (move.punish && target.v.charging && move.ignore?.includes(target.v.charging.move.id)));
    }
    return mod;
  }
}

export class Generation5 extends Generation4 {
  static override Rng = Rng;

  override id = 5;
  override lastMoveIdx = this.moveList.workup.idx!;
  override lastPokemon = 649;
  override rng = new Generation5.Rng();
  override calc: Calc = DamageCalc;

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

  override handleCrashDamage(battle: Battle, user: Battlemon) {
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

    const type = this.getMoveType(move, battle, user);
    if (!target.isGrounded(battle, user) && type === "ground") {
      return {dmg: 0, eff: 0, miss: false, type};
    }

    power ??= this.getMoveBasePower(move, battle, user, target);
    if (power < 0) {
      return {dmg: -idiv1(target.base.maxHp, 4), eff: 1, miss: false, type};
    }

    const level = user.base.level;
    const userAbilityId = user.getAbilityId();
    const special = move.category === MC.special;
    const [atks, defs] = special ? (["spa", "spd"] as const) : (["atk", "def"] as const);
    const A = DamageCalc.getBoostedAttack({battle, user, target, isCrit, move, type})[atks];
    const D = DamageCalc.getBoostedDefense({battle, user, target, isCrit, move})[defs];
    power = DamageCalc.getBoostedPower({battle, user, target, type, power, move});

    let multiTarget = Mod.NONE;
    let stab = Mod.NONE;

    if (
      (move.range === Range.AllAdjacentFoe || move.range == Range.AllAdjacent) &&
      battle.getTargets(user, Range.AllAdjacent).length >= 2
    ) {
      multiTarget = Mod.TARGET_MULTI;
    }

    if (user.v.hasAnyType(type)) {
      stab = userAbilityId === "adaptability" ? Mod.STAB_ADAPTABILITY : Mod.STAB;
    }

    const eff =
      move.id === "struggle"
        ? new TypeEffectiveness()
        : battle.gen.getEffectiveness(battle, type, target);
    let dmg = idiv(idiv(A * power * (idiv(2 * level, 5) + 2), D), 50) + 2;
    dmg = applyMod(dmg, multiTarget);
    dmg = applyMod(dmg, weatherModifier[battle.getWeather()!]?.[type] ?? Mod.NONE);
    dmg = isCrit ? dmg << 1 : dmg;
    const random = rng === undefined ? battle.rng : rng;
    if (random !== null && move.flag !== DMF.norand) {
      dmg = Gen3DamageCalc.randomizeDamage(dmg, random);
    }
    dmg = applyMod(dmg, stab);
    dmg = eff.shifts < 0 ? dmg >> -eff.shifts : dmg << eff.shifts;
    dmg = !special && user.base.status === "brn" && userAbilityId !== "guts" ? idiv(dmg, 2) : dmg;
    dmg = Math.max(dmg, 1);
    dmg = applyMod(dmg, DamageCalc.getFinalModifier({user, target, isCrit, move, eff}));

    debugLog(`\n${c(user.base.name, 32)} => ${c(target.base.name, 31)} (${c(move.name, 34)})`);
    debugLog(`- P: ${n(power)} | A: ${n(A)} | D: ${n(D)} | L: ${n(level)}`);
    debugLog(`- DMG: ${n(dmg)} | EFF: ${n(eff)} | CRIT: ${n(isCrit)} | Type: ${n(type)}`);
    return {dmg, eff: eff.toFloat(), miss: false, type};
  }

  override getConfusionSelfDamage(battle: Battle, user: Battlemon) {
    // Confusion no longer takes into account items, abilities, screens, etc.
    const level = user.base.level;
    const A = applyStatStages(battle.gen, user.v.stats.atk, user.v.stages.atk);
    const D = applyStatStages(battle.gen, user.v.stats.def, user.v.stages.def);
    const power = 40;

    let dmg = idiv(idiv(A * power * (idiv(2 * level, 5) + 2), D), 50) + 2;
    dmg = Gen3DamageCalc.randomizeDamage(dmg, battle.rng);
    dmg = Math.max(dmg, 1);
    return this.tryEndure({battle, user, target: user, dmg});
  }

  override handleFutureSight(
    battle: Battle,
    target: Battlemon,
    {move, user}: Battlemon["futureSight"] & {},
  ) {
    if (user !== target) {
      battle.event({type: "futuresight", src: target.id, move: move.id!, release: true});
      return this.move.scripts[move.kind].call(move, battle, user, [target]);
    }
  }

  override tryEndure({battle, user, target, dmg}: TryEndureParams) {
    if (!target.v.substitute && dmg >= target.base.hp) {
      const targetItemId = target.getItemId();
      if (target.v.hasFlag(VF.endure)) {
        return {dmg: target.base.hp - 1, endure: Endure.Endure};
      } else if (target.getAbilityId(user) === "sturdy" && target.base.hp === target.base.maxHp) {
        return {dmg: target.base.hp - 1, endure: Endure.Sturdy};
      } else if (targetItemId === "focusband" && battle.gen.rng.tryFocusBand(battle)) {
        return {dmg: target.base.hp - 1, endure: Endure.FocusBand};
      } else if (targetItemId === "focussash" && target.base.hp === target.base.maxHp) {
        return {dmg: target.base.hp - 1, endure: Endure.FocusSash};
      }
    }
    return {dmg, endure: Endure.None};
  }

  override getMoveType(
    move: Move,
    battle: Battle | Weather | undefined,
    user: Battlemon | Pokemon,
  ) {
    const userAbility = "base" in user ? user.getAbilityId() : user.ability;
    const override = this.move.overrides.type[move.id!];
    if (override) {
      return override.call(move, battle, user);
    } else if (userAbility === "normalize") {
      return "normal";
    }
    return move.type;
  }
}

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
