import {type GetDamageParams, shouldReturn} from "../gen1";
import {Generation2, merge} from "../gen2";
import {
  Nature,
  natureTable,
  SAWSBUCK_FORM,
  UNOWN_FORM,
  type Pokemon,
  type Gender,
} from "../pokemon";
import {abilityList, type Species, type SpeciesId} from "../species";
import {
  clamp,
  c,
  n,
  debugLog,
  idiv,
  MC,
  screens,
  VF,
  TypeMod,
  isSpecialType,
  Range,
  type StatStageId,
  type Stats,
  type Type,
  type Weather,
  Endure,
  randChoiceWeighted,
  DMF,
  idiv1,
  TypeEffectiveness,
} from "../utils";
import {moveScripts, moveOverrides, movePatches, tryDamage} from "./moves";
import speciesPatches from "./species.json";
import items from "./items.json";
import {itemList, type ItemId} from "../item";
import type {ActivePokemon} from "../active";
import {TurnType, type Battle} from "../battle";
import type {DamagingMove, Move, MoveId} from "../moves";
import type {Generation} from "../gen";
import type {Random} from "random";

const critStages: Record<number, number> = {
  [0]: 1 / 16,
  [1]: 1 / 8,
  [2]: 1 / 4,
  [3]: 1 / 3,
  [4]: 1 / 2,
};

const stageMultipliers: Record<number, [num: number, div: number]> = {
  [-6]: [2, 8],
  [-5]: [2, 7],
  [-4]: [2, 6],
  [-3]: [2, 5],
  [-2]: [2, 4],
  [-1]: [2, 3],
  0: [2, 2],
  1: [3, 2],
  2: [4, 2],
  3: [5, 2],
  4: [6, 2],
  5: [7, 2],
  6: [8, 2],
};

enum BetweenTurns {
  Begin,
  Weather,
  PartialTrapping,
  FutureSight,
  PerishSong,
}

export const createItemMergeList = (items: any) => {
  for (const item in itemList) {
    if (!(item in items)) {
      items[item as ItemId] = {exists: false};
    }
  }
  return items as typeof itemList;
};

// prettier-ignore
class Rng extends Generation2.Rng {
  override tryDefrost(battle: Battle) { return battle.rand100(20); }
  override tryCrit(battle: Battle, user: ActivePokemon, hc: boolean) {
    let stages = hc ? 2 : 0;
    if (user.v.hasFlag(VF.focusEnergy)) {
      stages += 2;
    }
    stages += user.base.item?.raiseCrit ?? 0;
    if (user.base.item?.boostCrit && user.base.item?.boostCrit === user.base.real.speciesId) {
      stages += 2;
    }
    if (user.hasAbility("superluck")) {
      stages++;
    }
    return battle.rand100(critStages[Math.min(stages, 4)] * 100);
  }
  override sleepTurns(battle: Battle) { return battle.rng.int(1, 4); }
  override disableTurns(battle: Battle) { return battle.rng.int(2, 5) + 1; }
  override bideDuration() { return 2; }
}

type StabParams = {
  type: Type;
  user: ActivePokemon;
  target: ActivePokemon;
  gen: Generation;
};

type BaseDamageParams = {
  move: DamagingMove;
  power: number;
  type: Type;
  battle: Battle;
  user: ActivePokemon;
  target: ActivePokemon;
  isCrit?: bool;
  explosion: bool;
};

type MiscModsParams = {
  isCrit: bool;
  battle: Battle;
  user: ActivePokemon;
  target: ActivePokemon;
  move: DamagingMove;
};

export class DamageCalc {
  private static getBoostedAttack(
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    type: Type,
  ) {
    const ability = user.getAbility();
    const abilityId = user.getAbilityId();
    const item = user.base.item;

    let {atk, spa} = user.v.stats;
    if (ability?.doubleAtk) {
      atk <<= 1;
    }

    if (item?.typeBoost && item.typeBoost.type === type) {
      if (isSpecialType(type)) {
        spa = idiv(spa * (100 + item.typeBoost.percent), 100);
      } else {
        atk = idiv(atk * (100 + item.typeBoost.percent), 100);
      }
    }

    if (item?.choice === "atk") {
      atk = idiv(atk * 150, 100);
    } else if (item?.boostStats?.[user.base.speciesId]) {
      // soul dew, deep sea tooth, light ball, thick club
      const boost = item.boostStats[user.base.speciesId]!;
      // Technically this will result in an (A * 200 / 100) operation where the game actually does (A * 2),
      // but since the multiplication will not overflow in JS at the 32 bit boundary it will be identical.
      if (boost.stats.includes("atk")) {
        atk = idiv(atk * (100 + boost.percent), 100);
      } else if (boost.stats.includes("spa")) {
        spa = idiv(spa * (100 + boost.percent), 100);
      }
    }

    if (abilityId === "hustle" || (abilityId === "guts" && user.base.status)) {
      atk = idiv(atk * 150, 100);
    } else if (
      abilityId === "plus" &&
      battle.allActive.some(poke => !poke.v.fainted && poke.getAbilityId() === "minus")
    ) {
      spa = idiv(spa * 150, 100);
    } else if (
      abilityId === "minus" &&
      battle.allActive.some(poke => !poke.v.fainted && poke.getAbilityId() === "plus")
    ) {
      spa = idiv(spa * 150, 100);
    }

    if (target.getAbilityId() === "thickfat" && (type === "ice" || type === "fire")) {
      spa >>= 1;
    }

    return {atk, spa};
  }

  private static getBoostedDefense(target: ActivePokemon) {
    const abilityId = target.getAbilityId();
    const item = target.base.item;

    let {def, spd} = target.v.stats;
    if (item?.boostStats?.[target.base.speciesId]) {
      // soul dew, deep sea scale, metal powder
      const boost = item.boostStats[target.base.speciesId]!;
      if (boost.stats.includes("def")) {
        def = idiv(def * (100 + boost.percent), 100);
      } else if (boost.stats.includes("spd")) {
        spd = idiv(spd * (100 + boost.percent), 100);
      }
    }

    if (abilityId === "marvelscale" && target.base.status) {
      def = idiv(def * 150, 100);
    }
    return {def, spd};
  }

  private static getBoostedPower(battle: Battle, user: ActivePokemon, type: Type, power: number) {
    if (type === "electric" && battle.allActive.some(poke => poke.v.hasFlag(VF.mudSport))) {
      power >>= 1;
    } else if (type === "fire" && battle.allActive.some(poke => poke.v.hasFlag(VF.waterSport))) {
      power >>= 1;
    }

    if (user.base.belowHp(3) && user.getAbility()?.pinchBoostType === type) {
      power = idiv(power * 150, 100);
    }
    return power;
  }

  static gen34DoubleDmgOrPower(
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    move: DamagingMove,
  ) {
    // Gen 3:
    // This is the combination of many different battle scripts
    // Look in `data/battle_scripts_1.s` for `setbyte sDMG_MULTIPLIER, 2`,
    // or in `src/battle_script_commands.c` for `gBattleScripting.dmgMultiplier`
    // + Cmd_doubledamagedealtifdamaged

    // TODO: the game keeps track of the last hit for physical and special moves separately.
    // lastHitBy needs to be updated to model this
    const revenge =
      move.flag === DMF.revenge &&
      user.v.lastHitBy?.poke === target &&
      target.choice?.move.kind === "damage" &&
      target.choice?.executed;

    return (
      user.v.inPursuit ||
      revenge ||
      (move.id === "weatherball" && battle.getWeather()) ||
      (move.id === "facade" && user.base.status) ||
      (move.clearTargetStatus &&
        !target.v.substitute &&
        target.base.status === move.clearTargetStatus) ||
      (move.id === "wakeupslap" && !target.v.substitute && target.base.status === "slp") ||
      (move.flag === DMF.minimize && target.v.usedMinimize) ||
      (move.punish && target.v.charging && move.ignore?.includes(target.v.charging.move.id)) ||
      (move.id === "brine" && target.base.belowHp(2))
    );
  }

  // CalculateBaseDamage
  static calcBaseDamage({
    power,
    type,
    battle,
    move,
    user,
    target,
    isCrit,
    explosion,
  }: BaseDamageParams) {
    const level = user.base.level;
    const attacks = DamageCalc.getBoostedAttack(battle, user, target, type);
    const defenses = DamageCalc.getBoostedDefense(target);
    power = DamageCalc.getBoostedPower(battle, user, type, power);

    // The explosion check uses gCurrentMove instead of the move that was passed in
    if (explosion) {
      defenses.def >>= 1;
    }

    const special = isSpecialType(type);
    const [atks, defs] = special ? (["spa", "spd"] as const) : (["atk", "def"] as const);
    if (!isCrit || user.v.stages[atks] < 0) {
      attacks[atks] = applyStatStages(user, attacks[atks], atks);
    }

    if (!isCrit || target.v.stages[defs] > 0) {
      defenses[defs] = applyStatStages(target, defenses[defs], defs);
    }

    let damage = idiv(idiv(attacks[atks] * power * (idiv(2 * level, 5) + 2), defenses[defs]), 50);
    if (!special && user.base.status === "brn" && user.getAbilityId() !== "guts") {
      damage >>= 1;
    }

    const targetAlive = target.owner.active.reduce((acc, poke) => acc + Number(!!poke.base.hp), 0);
    if (!isCrit && target.owner.screens[special ? "light_screen" : "reflect"]) {
      if (targetAlive > 1) {
        damage = 2 * idiv(damage, 3);
      } else {
        damage >>= 1;
      }
    }

    if (move.range === Range.AllAdjacentFoe && targetAlive > 1) {
      // Moves that hit both targets but not your ally (like Surf in this generation) have damage
      // halved against two targets.
      damage >>= 1;
    }

    if (!special) {
      damage = Math.max(damage, 1);
    } else {
      const weather = battle.getWeather();
      let modifier = weatherModifier[weather!]?.[type] ?? TypeMod.EFFECTIVE;
      if (move.charge === "sun" && weather && weather !== "sun") {
        modifier = TypeMod.NOT_VERY_EFFECTIVE;
      }

      if (modifier === TypeMod.NOT_VERY_EFFECTIVE) {
        damage >>= 1;
      } else if (modifier === TypeMod.MORE_EFFECTIVE) {
        damage = idiv(damage * 15, 10);
      }

      if (user.v.hasFlag(VF.flashFire) && type === "fire") {
        damage = idiv(damage * 15, 10);
      }

      // XXX: The game forgets to apply a minimum damage of 1 here for special moves.
    }

    debugLog(`\n${c(user.base.name, 32)} => ${c(target.base.name, 31)} (${c(move.name, 34)})`);
    debugLog(
      `- P: ${n(power)} | A: ${n(attacks[atks])} | D: ${n(defenses[defs])} | L: ${n(level)}`,
    );
    return damage + 2;
  }

  static calcBaseDamageBeatUp(user: Pokemon, target: ActivePokemon, power: number) {
    const level = user.level;
    const A = user.species.stats.atk;
    const D = target.base.species.stats.def;
    return idiv(idiv(A * power * (idiv(2 * level, 5) + 2), D), 50) + 2;
  }

  // in Cmd_damagecalc, Cmd_stockpiletobasedamage, Cmd_trysetfutureattack
  static applyMiscModifiers(dmg: number, {isCrit, battle, user, target, move}: MiscModsParams) {
    if (move.flag !== DMF.futuresight && move.id !== "spitup" && isCrit) {
      dmg <<= 1;
    }

    if (move.flag !== DMF.futuresight && move.id !== "struggle" && move.id !== "spitup") {
      if (DamageCalc.gen34DoubleDmgOrPower(battle, user, target, move)) {
        dmg <<= 1;
      }

      // Charge checks `gBattleMoves[gCurrentMove].type` instead of gBattleStruct->dynamicMoveType
      if (user.v.hasFlag(VF.charge) && move.type === "electric") {
        dmg <<= 1;
      }
    } else if (move.id === "spitup") {
      dmg *= user.v.stockpile;
      battle.sv([user.setVolatile("stockpile", 0)]);
    }

    if (user.v.hasFlag(VF.helpingHand)) {
      dmg = idiv(dmg * 15, 10); // The game uses dmg * 15 / 10 instead of dmg * 150 / 100 here
    }
    return dmg;
  }

  // Cmd_typecalc
  static applyTypeModifier(dmg: number, {type, user, target, gen}: StabParams) {
    if (user.v.hasAnyType(type)) {
      dmg = idiv(dmg * 15, 10);
    }

    const eff = new TypeEffectiveness();
    for (const [atktype, deftype, modifier] of gen.typeMatchupTable) {
      if (deftype === target.v.identified?.removeImmunities && modifier === TypeMod.NO_EFFECT) {
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
    return {dmg, eff};
  }

  // ApplyRandomDmgMultiplier
  static randomizeDamage(dmg: number, rng: Random | number) {
    if (dmg === 0) {
      return dmg;
    }

    const rand = typeof rng === "number" ? rng : rng.int(0, 15);
    return idiv1(dmg * (100 - rand), 100);
  }
}

export class Generation3 extends Generation2 {
  static override Rng = Rng;

  override id = 3;
  override lastMoveIdx = this.moveList.yawn.idx!;
  override lastPokemon = 386;
  override rng = new Generation3.Rng();
  override maxIv = 31;
  override maxEv = 255;
  override maxTotalEv = 510;
  override stageMultipliers = stageMultipliers;
  override invalidSketchMoves = [];

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

  override handleCrashDamage(
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    dmg: number,
  ) {
    dmg = Math.min(dmg, target.base.hp);
    user.damage(idiv1(dmg, 2), user, battle, false, "crash", true);
  }

  override getDamage({battle, user, target, move, isCrit, power, rng, beatUp}: GetDamageParams) {
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

    const type = this.getMoveType(move, user.base, battle.getWeather());

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
      const count = 5 - (user.v.thrashing?.turns ?? 5) + +user.v.usedDefenseCurl;
      power <<= count;
    }

    let dmg;
    if (beatUp) {
      dmg = DamageCalc.calcBaseDamageBeatUp(beatUp, target, power);
    } else {
      dmg = DamageCalc.calcBaseDamage({
        power,
        type,
        battle,
        move,
        user,
        target,
        isCrit,
        explosion: move.flag === DMF.explosion,
      });
    }

    dmg = DamageCalc.applyMiscModifiers(dmg, {isCrit, battle, user, target, move});
    let eff = new TypeEffectiveness();
    if (move.id !== "struggle" && move.flag !== DMF.futuresight && !beatUp) {
      ({dmg, eff} = DamageCalc.applyTypeModifier(dmg, {type, user, target, gen: this}));
    }

    const random = rng === undefined ? battle.rng : rng;
    if (random !== null && move.flag !== DMF.norand) {
      dmg = DamageCalc.randomizeDamage(dmg, random);
    }

    debugLog(`- DMG: ${n(dmg)} | EFF: ${n(eff)} | CRIT: ${n(isCrit)} | Type: ${n(type)}`);
    return {dmg, eff: eff.toFloat(), type, miss: false};
  }

  override getConfusionSelfDamage(battle: Battle, user: ActivePokemon) {
    let dmg = DamageCalc.calcBaseDamage({
      power: 40,
      type: "???",
      battle,
      user,
      target: user,
      isCrit: false,
      move: this.moveList.pound as DamagingMove,
      explosion: user.choice?.move?.kind === "damage" && user.choice?.move?.flag === DMF.explosion,
    });
    dmg = DamageCalc.randomizeDamage(dmg, battle.rng);
    let endure;
    if (dmg >= user.base.hp) {
      if (user.v.hasFlag(VF.endure)) {
        dmg = user.base.hp - 1;
        endure = Endure.Endure;
      } else if (this.rng.tryFocusBand(battle)) {
        dmg = user.base.hp - 1;
        endure = Endure.FocusBand;
      }
    }
    return {dmg, endure};
  }

  override getSpeed(battle: Battle, user: ActivePokemon) {
    // GetWhoStrikesFirst
    const ability = user.getAbility();
    const weather = battle.getWeather();
    const item = user.base.item;
    let speed = user.v.stats.spe;
    if (weather && ability?.weatherSpeedBoost === weather) {
      speed <<= 1;
    }

    speed = applyStatStages(user, speed, "spe");
    if (item?.halveSpeed) {
      speed >>= 1;
    }
    if (user.base.status === "par") {
      speed >>= 2;
    }
    return speed;
  }

  override getHpIv(ivs: Partial<Stats> | undefined) {
    return ivs?.hp ?? 31;
  }

  override calcStat(
    stat: keyof Stats,
    bases: Stats,
    level: number,
    ivs?: Partial<Stats>,
    evs?: Partial<Stats>,
    nature?: Nature,
  ) {
    if (bases[stat] === 1) {
      return 1;
    }

    const base = idiv(
      (2 * bases[stat] + (ivs?.[stat] ?? 31) + idiv(evs?.[stat] ?? 0, 4)) * level,
      100,
    );
    if (stat === "hp") {
      return base + level + 10;
    } else {
      return Math.floor((base + 5) * (natureTable[nature ?? Nature.hardy][stat] ?? 1));
    }
  }

  override tryDamage = tryDamage;

  override getForm(desired: string | undefined, id: string, _dvs: Partial<Stats>, item?: ItemId) {
    // prettier-ignore
    switch (id) {
      case "unown": return UNOWN_FORM.includes(desired) ? desired : undefined;
      case "deerling":
      case "sawsbuck": return SAWSBUCK_FORM.includes(desired) ? desired : undefined;
      case "genesect": return this.items[item!]?.drive;
      case "arceus": return this.items[item!]?.plate;
      default: return;
    }
  }

  override getShiny(desired: bool) {
    return desired ?? false;
  }

  override getGender(desired: Gender | undefined, species: Species) {
    // prettier-ignore
    switch (species.genderRatio) {
      case undefined: return "N";
      case 100: return "M";
      case 0: return "F";
      default: return desired;
    }
  }

  override getMaxPP(move: Move | MoveId) {
    move = typeof move === "string" ? this.moveList[move] : move;
    return move.pp === 1 ? 1 : idiv(move.pp * 8, 5);
  }

  override checkAccuracy(
    move: Move,
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    phys?: bool,
  ) {
    if (user.hasAbility("noguard") || target.hasAbility("noguard")) {
      return true;
    }

    if (
      target.v.charging &&
      target.v.charging.move.charge === "invuln" &&
      (!move.ignore || !move.ignore.includes(target.v.charging.move.id))
    ) {
      battle.miss(user, target);
      return false;
    }

    const chance = this.getMoveAcc(move, battle.getWeather());
    if (!chance || user.v.inPursuit) {
      return true;
    } else if (move.kind === "damage" && move.flag === DMF.ohko) {
      // In Gen 3/4, the type immunity message takes priority over the sturdy one
      if (target.hasAbility("sturdy")) {
        battle.ability(target);
        battle.info(target, "immune");
        return false;
      }

      // Starting from Gen 3, OHKO moves are no longer affected by accuracy/evasion stats
      if (!battle.rand100(user.base.level - target.base.level + 30)) {
        battle.miss(user, target);
        return false;
      }
      return true;
    }

    let eva = target.v.stages.eva;
    // Starting from Gen 4, Foresight/Odor Sleuth/Miracle Eye only ignore positive evasion changes
    if (target.v.identified && (eva > 0 || battle.gen.id <= 3)) {
      eva = 0;
    }

    const [num, div] = this.accStageMultipliers[clamp(user.v.stages.acc - eva, -6, 6)];
    let acc = idiv(chance * num, div);
    const targetItem = target.base.item;
    if (targetItem?.reduceAcc) {
      acc = idiv(acc * (100 - targetItem.reduceAcc), 100);
    }

    const userItem = user.base.item;
    if (userItem?.boostAcc) {
      acc = idiv(acc * (100 + userItem.boostAcc), 100);
    }

    if (user.base.itemId === "zoomlens" && target.choice?.executed) {
      acc = idiv(acc * 120, 100);
    }

    if (user.hasAbility("compoundeyes")) {
      acc = idiv(acc * 130, 100);
    }

    if (user.hasAbility("hustle") && (phys ?? battle.gen.getCategory(move) === MC.physical)) {
      acc = idiv(acc * 80, 100);
    }

    const weatherEva = target.getAbility()?.weatherEva;
    if (weatherEva && battle.getWeather() === weatherEva) {
      acc = idiv(acc * 4, 5);
    }

    debugLog(`[${user.base.name}] ${move.name} (Acc ${acc}/100)`);
    if (!battle.rand100(acc)) {
      battle.miss(user, target);
      return false;
    }
    return true;
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

    if (user.base.status === "slp") {
      if (--user.base.sleepTurns === 0 || battle.hasUproar(user)) {
        user.base.sleepTurns = 0;
        user.unstatus(battle, "wake");
      } else {
        battle.info(user, "sleep");
        if (!move.sleepOnly) {
          resetVolatiles();
          return false;
        }
      }
    } else if (user.base.status === "frz" && !move.selfThaw) {
      if (battle.gen.rng.tryDefrost(battle)) {
        user.unstatus(battle, "thaw");
      } else {
        battle.info(user, "frozen");
        resetVolatiles();
        return false;
      }
    }

    const moveId = move.id!;
    if (user.v.recharge) {
      battle.info(user, "recharge");
      user.v.recharge = undefined;
      resetVolatiles();
      return false;
    } else if (user.hasAbility("truant") && user.v.hasFlag(VF.loafing)) {
      battle.info(user, "loafing");
      resetVolatiles();
      return false;
    } else if (user.v.flinch) {
      battle.info(user, "flinch");
      resetVolatiles();
      return false;
    } else if (moveId === user.base.moves[user.v.disabled?.indexInMoves ?? -1]) {
      battle.event({move: moveId, type: "move", src: user.id, disabled: true});
      resetVolatiles();
      return false;
    } else if (move.kind !== "damage" && user.v.tauntTurns) {
      battle.event({move: moveId, type: "cantusetaunt", src: user.id});
      resetVolatiles();
      return false;
    } else if (battle.allActive.some(p => p.isImprisoning(user, moveId))) {
      battle.event({move: moveId, type: "cantuse", src: user.id});
      resetVolatiles();
      return false;
    } else if (user.handleConfusion(battle)) {
      resetVolatiles();
      return false;
    } else if (user.base.status === "par" && battle.gen.rng.tryFullPara(battle)) {
      battle.info(user, "paralyze");
      resetVolatiles();
      return false;
    } else if (user.v.attract) {
      battle.event({type: "in_love", src: user.id, target: user.v.attract.id});
      if (battle.gen.rng.tryAttract(battle)) {
        battle.info(user, "immobilized");
        resetVolatiles();
        return false;
      }
    }

    return true;
  }

  override afterBeforeUseMove(battle: Battle, user: ActivePokemon) {
    return battle.checkFaint(user) && shouldReturn(battle, false);
  }

  override afterUseMove(battle: Battle, user: ActivePokemon, isReplacement: bool) {
    if (isReplacement) {
      if (user.faintIfNeeded(battle)) {
        return true;
      }
      user.handleBerry(battle, {status: true});
      return false;
    }

    for (const poke of battle.allActive) {
      if (poke.base.hp !== 0) {
        poke.handleBerry(battle, {status: true});
      }
    }

    if (user.v.inBatonPass) {
      return true;
    }

    // Technically shell bell should happen here?
    return battle.checkFaint(user) && shouldReturn(battle, true);
  }

  override betweenTurns(battle: Battle) {
    const checkFaint = (poke: ActivePokemon) => {
      return (
        battle.checkFaint(poke, true) &&
        battle.allActive.some(p => p.v.fainted && p.canBeReplaced(battle))
      );
    };

    // TODO: should this turn order take into account priority/pursuit/etc. or should it use
    // out of battle speeed?
    const turnOrder = battle.turnOrder;

    debugLog(
      `\nbetweenTurns(${BetweenTurns[battle.betweenTurns]}):`,
      battle.turnOrder.map(t => t.base.name),
    );

    // Screens Wish & Weather
    if (battle.betweenTurns < BetweenTurns.Weather) {
      for (const player of battle.players) {
        for (const screen of screens) {
          if (player.screens[screen] && --player.screens[screen] === 0) {
            battle.event({type: "screen", user: player.id, screen, kind: "end"});
          }
        }
      }

      for (const poke of turnOrder) {
        if (poke.wish && --poke.wish.turns === 0) {
          if (!poke.v.fainted) {
            poke.recover(idiv1(poke.base.maxHp, 2), poke, battle, `wish:${poke.base.name}`);
          }
          poke.wish = undefined;
        }
      }

      let someoneDied = false;
      weather: if (battle.weather) {
        if (battle.weather.turns !== -1 && --battle.weather.turns === 0) {
          battle.endWeather();
          break weather;
        }

        battle.event({type: "weather", kind: "continue", weather: battle.weather.kind});
        if (!battle.hasWeather("sand") && !battle.hasWeather("hail")) {
          break weather;
        }

        for (const poke of turnOrder) {
          poke.handleWeather(battle, battle.weather!.kind);
          someoneDied = checkFaint(poke) || someoneDied;
        }
      }

      battle.betweenTurns = BetweenTurns.Weather;
      if (someoneDied) {
        return;
      }
    }

    // A bunch of stuff
    if (battle.betweenTurns < BetweenTurns.PartialTrapping) {
      let someoneDied = false;
      const hasUproar = battle.allActive.some(p => p.v.thrashing?.move?.id === "uproar");
      for (const poke of turnOrder) {
        const ability = poke.getAbilityId();
        if (!poke.v.fainted) {
          if (poke.v.hasFlag(VF.ingrain)) {
            poke.recover(idiv1(poke.base.maxHp, 16), poke, battle, "ingrain");
          }

          if (battle.hasWeather("rain") && ability === "raindish" && !poke.base.isMaxHp()) {
            battle.ability(poke);
            poke.recover(idiv1(poke.base.maxHp, 16), poke, battle, "recover");
          }

          if (ability === "speedboost" && poke.v.canSpeedBoost && poke.v.stages.spe < 6) {
            battle.ability(poke);
            poke.modStages([["spe", +1]], battle);
          }

          if (poke.v.canSpeedBoost) {
            if (poke.v.hasFlag(VF.loafing)) {
              poke.v.clearFlag(VF.loafing);
            } else if (ability === "truant") {
              poke.v.setFlag(VF.loafing);
            }
          }

          if (poke.base.status && ability === "shedskin" && battle.gen.rng.tryShedSkin(battle)) {
            battle.ability(poke);
            poke.unstatus(battle);
          }
        }

        poke.handleLeftovers(battle);
        poke.handleBerry(battle, {pinch: true, status: true, pp: true});
        battle.gen.handleResidualDamage(battle, poke);
        if (poke.base.hp) {
          poke.handlePartialTrapping(battle);
        }

        if (poke.base.hp) {
          if (hasUproar && poke.base.status === "slp" && ability !== "soundproof") {
            poke.unstatus(battle, "wake");
          }

          if (poke.v.thrashing) {
            const done = --poke.v.thrashing.turns === 0;
            if (poke.v.thrashing.move.id === "uproar") {
              battle.info(poke, done ? "uproar_end" : "uproar_continue");
            }

            if (done) {
              if (poke.v.thrashing.move.flag === DMF.multi_turn && ability !== "owntempo") {
                poke.confuse(battle, "fatigue_confuse_max");
              }
              poke.v.thrashing = undefined;
            }
          }

          if (poke.v.disabled && --poke.v.disabled.turns === 0) {
            poke.v.disabled = undefined;
            battle.info(poke, "disable_end", [{id: poke.id, v: {flags: poke.v.cflags}}]);
          }

          poke.handleEncore(battle);

          if (poke.v.tauntTurns && --poke.v.tauntTurns === 0) {
            battle.info(poke, "taunt_end", [{id: poke.id, v: {flags: poke.v.cflags}}]);
          }
        }

        // TODO: lockon/mind reader?

        if (poke.base.hp && poke.v.drowsy && --poke.v.drowsy === 0) {
          battle.event({type: "sv", volatiles: [{id: poke.id, v: {flags: poke.v.cflags}}]});
          if (!poke.base.status && abilityList[ability!]?.preventsStatus !== "slp") {
            poke.status("slp", battle, poke, {ignoreSafeguard: true});
          }
        }

        someoneDied = checkFaint(poke) || someoneDied;
      }

      battle.betweenTurns = BetweenTurns.PartialTrapping;
      if (someoneDied) {
        return;
      }
    }

    if (battle.betweenTurns < BetweenTurns.FutureSight) {
      let someoneDied = false;
      for (const poke of battle.switchOrder()) {
        poke.handleFutureSight(battle);
        // FIXME: after future sight, the affected pokemon should die and be forced to switch
        // immediately, even before other future sights go off
        someoneDied = checkFaint(poke) || someoneDied;
      }

      battle.betweenTurns = BetweenTurns.FutureSight;
      if (someoneDied) {
        return;
      }
    }

    if (battle.betweenTurns < BetweenTurns.PerishSong) {
      let someoneDied = false;
      for (const poke of turnOrder) {
        poke.handlePerishSong(battle);
        someoneDied = checkFaint(poke) || someoneDied;
      }

      // FIXME: after perish song the affected pokemon should die and be forced to switch
      // immediately, even before other ones go off

      battle.betweenTurns = BetweenTurns.PerishSong;
      if (someoneDied) {
        return;
      }
    }

    for (const poke of turnOrder) {
      // TODO: hyper beam?
      poke.v.flinch = false;
      poke.v.inPursuit = false;
      poke.v.retaliateDamage = 0;
      poke.v.hasFocus = true;
      if (poke.v.justSwitched) {
        poke.v.canSpeedBoost = true;
        poke.v.justSwitched = false;
      } else {
        poke.v.canFakeOut = false;
      }

      const flags =
        VF.protect | VF.endure | VF.helpingHand | VF.followMe | VF.snatch | VF.magicCoat;
      if (poke.v.hasFlag(flags)) {
        battle.event({type: "sv", volatiles: [poke.clearFlag(flags)]});
      }
    }

    battle.betweenTurns = BetweenTurns.Begin;
    if (battle.turnType === TurnType.Lead) {
      for (const poke of battle.inTurnOrder()) {
        poke.handleWeatherAbility(battle);
      }

      for (const user of battle.turnOrder) {
        user.handleSwitchInAbility(battle);
      }
    }
  }

  override handleRage(battle: Battle, poke: ActivePokemon) {
    if (poke.v.lastMove?.kind === "damage" && poke.v.lastMove.id === "rage") {
      battle.info(poke, "rage");
      poke.modStages([["atk", +1]], battle);
    }
  }

  override getEffectiveness(type: Type, target: ActivePokemon) {
    return DamageCalc.applyTypeModifier(0, {type, user: target, target, gen: this}).eff;
  }

  override applyStatusDebuff() {}

  override recalculateStat() {}

  override tryAbilityImmunity(
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    self: Move,
    type: Type,
    eff: number,
  ) {
    const targetAbility = target.getAbilityId(user);
    const skipsTypeCheck = self.id === "beatup" || self.id === "struggle";
    if (self.sound && targetAbility === "soundproof") {
      battle.ability(target, [target.setFlag(VF.flashFire)]);
      battle.info(target, "immune");
      return true;
    } else if (
      self.kind === "damage" &&
      ((skipsTypeCheck && eff <= 1 && targetAbility === "wonderguard") ||
        (type === "ground" && targetAbility === "levitate" && !target.isGrounded()) ||
        (type === "electric" && targetAbility === "voltabsorb") ||
        (type === "water" && targetAbility === "waterabsorb") ||
        (type === "fire" && targetAbility === "flashfire" && target.base.status !== "frz"))
    ) {
      battle.ability(
        target,
        targetAbility === "flashfire" ? [target.setFlag(VF.flashFire)] : undefined,
      );
      battle.info(target, "immune");

      if (targetAbility === "waterabsorb" || targetAbility === "voltabsorb") {
        target.recover(idiv1(target.base.maxHp, 4), user, battle, "none");
      }
      return true;
    }
    return false;
  }
}

const applyStatStages = (poke: ActivePokemon, stat: number, statId: StatStageId) => {
  const [num, div] = poke.base.gen.stageMultipliers[poke.v.stages[statId]];
  return idiv(stat * num, div);
};

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
