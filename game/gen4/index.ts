import speciesPatches from "./species.json";
import items from "./items.json";
import type {Species, SpeciesId} from "../species";
import {merge} from "../gen2";
import {moveScripts, movePatches, moveOverrides, tryDamage} from "./moves";
import {Generation3, DamageCalc as Gen3DamageCalc, createItemMergeList} from "../gen3";
import {
  Range,
  idiv,
  MC,
  screens,
  VF,
  DMF,
  type Type,
  Endure,
  TypeMod,
  type Weather,
  randChoiceWeighted,
  c,
  n,
  debugLog,
  clamp,
  idiv1,
  TypeEffectiveness,
} from "../utils";
import {type ActivePokemon, type Battle, TurnType} from "../battle";
import type {DamagingMove, Move} from "../moves";
import type {GetDamageParams} from "../gen1";
import type {Pokemon} from "../pokemon";
import type {Random} from "random";
import type {Generation} from "../gen";

// prettier-ignore
class Rng extends Generation3.Rng {
  override disableTurns(battle: Battle) { return battle.rng.int(4, 7) + 1; }
  override bindingMoveTurns(battle: Battle, user: ActivePokemon) {
    if (user.base.itemId === "gripclaw") {
      return 5 + 1;
    }
    return super.bindingMoveTurns(battle, user);
  }
}

type StabParams = {
  type: Type;
  gen: Generation;
  user: ActivePokemon;
  target: ActivePokemon;
};

type BaseDamageParams = {
  move: DamagingMove;
  power: number;
  type: Type;
  battle: Battle;
  user: ActivePokemon;
  target: ActivePokemon;
  isCrit?: bool;
};

type MiscModsParams = {
  isCrit: bool;
  user: ActivePokemon;
  move: DamagingMove;
  rng: Random | number | null;
};

type BoostedPowerParams = {
  move: DamagingMove;
  battle: Battle;
  user: ActivePokemon;
  target: ActivePokemon;
  type: Type;
  power: number;
};

class DamageCalc {
  private static getBoostedAttack(battle: Battle, user: ActivePokemon) {
    const ability = user.getAbility();
    const abilityId = user.getAbilityId();
    const item = user.base.item;

    let {atk, spa} = user.v.stats;
    if (ability?.doubleAtk) {
      atk <<= 1;
    } else if (abilityId === "slowstart" && user.v.slowStartTurns < 5) {
      atk >>= 1;
    }

    if (item?.choice === "atk") {
      atk = idiv(atk * 150, 100);
    } else if (item?.choice === "spa") {
      spa = idiv(spa * 150, 100);
    } else if (item?.boostStats?.[user.base.speciesId]) {
      // soul dew, deep sea tooth, thick club
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
    } else if (abilityId === "plus" && user.owner.sideHasAbility("minus")) {
      spa = idiv(spa * 150, 100);
    } else if (abilityId === "minus" && user.owner.sideHasAbility("plus")) {
      spa = idiv(spa * 150, 100);
    }

    // The air lock check is not ignored by mold breaker
    if (battle.getWeather() === "sun") {
      if (abilityId === "solarpower") {
        spa = idiv(spa * 15, 10);
      }
      if (user.owner.sideHasAbility("flowergift")) {
        atk = idiv(atk * 15, 10);
      }
    }
    return {atk, spa};
  }

  private static getBoostedDefense(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
    const abilityId = target.getAbilityId(user);
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

    const weather = battle.getWeather();
    if (weather === "sand" && target.v.hasAnyType("rock")) {
      spd = idiv(spd * 15, 10);
    }
    if (!user.getAbility()?.moldBreaker && target.owner.sideHasAbility("flowergift")) {
      def = idiv(def * 15, 10);
    }
    return {def, spd};
  }

  private static getBoostedPower({move, battle, user, target, type, power}: BoostedPowerParams) {
    const userAbility = user.getAbility();
    const userAbilityId = user.getAbilityId();

    let powerMultiplier = 10;
    if (Gen3DamageCalc.gen34DoubleDmgOrPower(battle, user, target, move)) {
      powerMultiplier = 20;
    } else if (
      userAbilityId === "reckless" &&
      (move.recoil || move.flag == DMF.crash) &&
      move.id !== "struggle"
    ) {
      powerMultiplier = 12;
    }

    power = idiv(power * powerMultiplier, 10);
    if (user.v.hasFlag(VF.charge) && type === "electric") {
      power <<= 1;
    }
    if (user.v.hasFlag(VF.helpingHand)) {
      power = idiv(power * 15, 10);
    }
    if (user.v.ability === "technician") {
      power = idiv(power * 15, 10);
    }

    const item = user.base.item;
    const itemId = user.base.itemId;
    // type boosting items + orbs
    if (
      item?.typeBoost &&
      (item.typeBoost.type === type || item.typeBoost.type2 === type) &&
      (!item.typeBoost.species || item.typeBoost.species.includes(user.base.speciesId))
    ) {
      power = idiv(power * (100 + item.typeBoost.percent), 100);
    }
    if (itemId === "lightball" && user.base.speciesId === "pikachu") {
      power <<= 1;
    }
    if (
      (move.category === MC.special && itemId === "wiseglasses") ||
      (move.category === MC.physical && itemId === "muscleband")
    ) {
      power = idiv(power * 110, 100);
    }

    const targetAbilityId = target.getAbilityId(user);
    if (targetAbilityId === "thickfat" && (type === "ice" || type === "fire")) {
      power >>= 1;
    }

    if (type === "electric" && battle.allActive.some(poke => poke.v.hasFlag(VF.mudSport))) {
      power >>= 1;
    } else if (type === "fire" && battle.allActive.some(poke => poke.v.hasFlag(VF.waterSport))) {
      power >>= 1;
    }

    if (user.base.belowHp(3) && userAbility?.pinchBoostType === type) {
      power = idiv(power * 150, 100);
    }

    if (targetAbilityId === "heatproof" && type === "fire") {
      power >>= 1;
    } else if (targetAbilityId === "dryskin" && type === "fire") {
      // Mold breaker ignores dry skin, even though it's positive
      power = idiv(power * 125, 100);
    }

    if (userAbilityId === "rivalry" && user.base.gender !== "N" && target.base.gender !== "N") {
      if (user.base.gender === target.base.gender) {
        power = idiv(power * 125, 100);
      } else {
        power = idiv(power * 75, 100);
      }
    }

    if (userAbilityId === "ironfist" && move.punch) {
      power = idiv(power * 12, 10);
    }

    return power;
  }

  // CalcMoveDamage
  static calcBaseDamage({power, type, battle, move, user, target, isCrit}: BaseDamageParams) {
    const level = user.base.level;
    const attacks = DamageCalc.getBoostedAttack(battle, user);
    const defenses = DamageCalc.getBoostedDefense(battle, user, target);
    power = DamageCalc.getBoostedPower({battle, user, target, type, power, move});

    if (move.flag === DMF.explosion) {
      defenses.def >>= 1;
    }

    const special = move.category === MC.special;
    const userAbilityId = user.getAbilityId();
    const targetAbilityId = target.getAbilityId(user);
    const [atks, defs] = special ? (["spa", "spd"] as const) : (["atk", "def"] as const);

    let statChangeA = user.v.stages[atks];
    let statChangeD = target.v.stages[defs];
    if (userAbilityId === "simple") {
      statChangeA *= 2;
    }
    if (targetAbilityId === "simple") {
      statChangeD *= 2;
    }
    if (userAbilityId === "unaware" || (isCrit && statChangeD > 0)) {
      statChangeD = 0;
    }
    if (targetAbilityId === "unaware" || (isCrit && statChangeA < 0)) {
      statChangeA = 0;
    }

    attacks[atks] = applyStatStages(user, attacks[atks], statChangeA);
    defenses[defs] = applyStatStages(target, defenses[defs], statChangeD);

    let damage = idiv(idiv(attacks[atks] * power * (idiv(2 * level, 5) + 2), defenses[defs]), 50);
    if (!special && user.base.status === "brn" && userAbilityId !== "guts") {
      damage >>= 1;
    }

    const targetAlive = target.owner.active.reduce((acc, poke) => acc + Number(!!poke.base.hp), 0);
    if (!isCrit && target.owner.screens[special ? "light_screen" : "reflect"]) {
      if (targetAlive > 1) {
        damage = idiv(2 * damage, 3);
      } else {
        damage >>= 1;
      }
    }

    if (move.range === Range.AllAdjacentFoe && targetAlive > 1) {
      damage = idiv(3 * damage, 4);
    } else if (
      move.range == Range.AllAdjacent &&
      battle.getTargets(user, Range.AllAdjacent).length >= 2
    ) {
      damage = idiv(3 * damage, 4);
    }

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

    debugLog(`\n${c(user.base.name, 32)} => ${c(target.base.name, 31)} (${c(move.name, 34)})`);
    debugLog(
      `- P: ${n(power)} | A: ${n(attacks[atks])} | D: ${n(defenses[defs])} | L: ${n(level)}`,
    );
    return damage + 2;
  }

  // BtlCmd_BeatUp
  static calcBaseDamageBeatUp(
    user: ActivePokemon,
    partyMon: Pokemon,
    target: ActivePokemon,
    power: number,
  ) {
    // https://github.com/pret/pokeheartgold/blob/a6a9655094d23d501b1477831d107f9d37727f33/src/battle/battle_command.c#L3730
    const level = partyMon.level;
    const A = partyMon.species.stats.atk;
    const D = target.base.species.stats.def;
    let dmg = idiv(idiv(A * power * (idiv(2 * level, 5) + 2), D), 50) + 2;
    // Beat up has a special damage calculation routine and uses the Gen 3 method of applying helping hand
    if (user.v.hasFlag(VF.helpingHand)) {
      dmg = idiv(dmg * 15, 10);
    }
    return dmg;
  }

  static applyMiscModifiers(dmg: number, {isCrit, user, move, rng}: MiscModsParams) {
    if (move.flag !== DMF.futuresight) {
      // DamageCalcDefault
      if (isCrit) {
        dmg *= move.id !== "beatup" && user.getAbilityId() === "sniper" ? 3 : 2;
      }

      if (user.base.itemId === "lifeorb") {
        dmg = idiv(dmg * 130, 100);
      } else if (user.base.itemId === "metronome") {
        dmg = idiv(dmg * (10 + user.v.metronomeCount), 10);
      }
    }

    if (rng !== null && move.flag !== DMF.norand) {
      // Damage randomization is identical to gen 4, now called ApplyDamageRange
      dmg = Gen3DamageCalc.randomizeDamage(dmg, rng);
    }

    return dmg;
  }

  // DoApplyTypeEffectiveness
  static applyTypeModifier(dmg: number, {type, gen, user, target}: StabParams) {
    // ov12_02251C74, modified
    const shouldUse = (deftype: Type, modifier: number) => {
      const immunity = modifier === TypeMod.NO_EFFECT;
      if (deftype === target.v.identified?.removeImmunities && immunity) {
        return false;
      } else if (deftype === "ghost" && immunity && user.getAbilityId() === "scrappy") {
        return false;
      } else if (deftype === "flying") {
        if (target.v.hasFlag(VF.roost)) {
          return false;
        } else if (immunity && target.isGrounded()) {
          return false;
        }
      }
      return true;
    };

    const abilityId = user.getAbilityId();
    if (user.v.hasAnyType(type)) {
      if (abilityId === "adaptability") {
        dmg <<= 1;
      } else {
        dmg = idiv(dmg * 15, 10);
      }
    }

    // Technically levitate, magnet rise, wonder guard get checked here

    const eff = new TypeEffectiveness();
    for (const [atktype, deftype, modifier] of gen.typeMatchupTable) {
      if (!shouldUse(deftype, modifier)) {
        continue;
      } else if (atktype === type && target.v.hasAnyType(deftype)) {
        eff.modify(modifier);
        if (modifier === TypeMod.NO_EFFECT) {
          dmg = 0;
          break;
        }

        dmg = idiv1(dmg * modifier, 10);
      }
    }

    if (user.base.itemId === "expertbelt" && eff.superEffective()) {
      dmg = idiv(dmg * 120, 100);
    }
    if (target.getAbility(user)?.reduceSE && eff.superEffective()) {
      dmg = idiv1(dmg * 3, 4);
    }
    if (abilityId === "tintedlens" && eff.notVeryEffective()) {
      dmg <<= 1;
    }

    return {dmg, eff};
  }
}

export class Generation4 extends Generation3 {
  static override Rng = Rng;

  override id = 4;
  override lastMoveIdx = this.moveList.zenheadbutt.idx!;
  override lastPokemon = 493;
  override rng = new Generation4.Rng();

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

  override tryDamage = tryDamage;

  override getCategory(move: Move) {
    return "category" in move ? move.category : MC.status;
  }

  override isSpecial(move: Move) {
    return "category" in move && move.category === MC.special;
  }

  override afterBeforeUseMove(battle: Battle, user: ActivePokemon) {
    battle.checkFaint(user);
    return false;
  }

  override afterUseMove(battle: Battle, user: ActivePokemon, isReplacement: boolean) {
    if (isReplacement) {
      if (user.faintIfNeeded(battle)) {
        return true;
      }
      user.handleBerry(battle, {pp: true, pinch: true, status: true});
      return false;
    }

    for (const poke of battle.allActive) {
      if (poke.base.hp) {
        poke.handleBerry(battle, {pp: true, pinch: true, status: true});
      }
    }

    battle.checkFaint(user);
    return !!user.v.inBatonPass;
  }

  override betweenTurns(battle: Battle) {
    // TODO: should this turn order take into account priority/pursuit/etc. or should it use
    // out of battle speeed?
    const turnOrder = battle.turnOrder;

    if (!battle.allActive.some(p => p.v.fainted && p.canBeReplaced(battle))) {
      for (const poke of turnOrder) {
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
          VF.protect |
          VF.endure |
          VF.helpingHand |
          VF.followMe |
          VF.snatch |
          VF.magicCoat |
          VF.roost;
        if (poke.v.hasFlag(flags)) {
          battle.event({type: "sv", volatiles: [poke.clearFlag(flags)]});
        }
      }
    }

    if (battle.turnType !== TurnType.Normal) {
      for (const poke of battle.inTurnOrder()) {
        if (poke.choice?.isReplacement || battle.turnType === TurnType.Lead) {
          poke.handleWeatherAbility(battle);
          poke.handleSwitchInAbility(battle);
          poke.handleBerry(battle, {pp: true, pinch: true, status: true});
        }
      }
      return;
    }

    // Screens + Tailwind + Lucky Chant
    for (const player of battle.players) {
      for (const screen of screens) {
        if (player.screens[screen] && --player.screens[screen] === 0) {
          battle.event({
            type: "screen",
            user: player.id,
            screen,
            kind: "end",
            volatiles:
              screen === "tailwind"
                ? player.active.map(p => ({id: p.id, v: {stats: p.clientStats(battle)}}))
                : undefined,
          });
        }
      }
    }

    // Wish
    for (const poke of turnOrder) {
      if (poke.wish && --poke.wish.turns === 0) {
        if (!poke.v.fainted) {
          poke.recover(idiv1(poke.base.maxHp, 2), poke, battle, `wish:${poke.base.name}`);
        }
        poke.wish = undefined;
      }
    }

    // Weather
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
        battle.checkFaint(poke);
      }
    }

    // Abilities
    const weather = battle.getWeather();
    for (const poke of turnOrder) {
      if (poke.v.fainted) {
        continue;
      }

      const ability = poke.getAbilityId();
      if (
        !poke.base.isMaxHp() &&
        ((weather === "rain" && ability === "raindish") ||
          (weather === "hail" && ability === "icebody"))
      ) {
        battle.ability(poke);
        poke.recover(idiv1(poke.base.maxHp, 16), poke, battle, "recover");
      } else if (weather === "rain" && ability === "hydration" && poke.base.status) {
        battle.ability(poke);
        poke.unstatus(battle);
      }

      // TODO: Dry Skin
    }

    // TODO: Gravity

    // A bunch of stuff
    const hasUproar = battle.allActive.some(p => p.v.thrashing?.move?.id === "uproar");
    for (const poke of turnOrder) {
      const ability = poke.getAbilityId();
      if (!poke.v.fainted) {
        if (poke.v.hasFlag(VF.ingrain)) {
          poke.recover(idiv1(poke.base.maxHp, 16), poke, battle, "ingrain");
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
      battle.gen.handleResidualDamage(battle, poke);
      if (poke.base.hp) {
        poke.handlePartialTrapping(battle);
      }
      if (poke.base.hp && poke.base.status === "slp") {
        const opp = battle
          .getTargets(poke, Range.AdjacentFoe)
          .find(opp => opp.hasAbility("baddreams"));
        if (opp) {
          battle.ability(opp);
          poke.damage2(battle, {
            dmg: idiv1(poke.base.maxHp, 8),
            src: opp,
            why: "baddreams",
            direct: true,
          });
        }
      }

      if (poke.base.hp) {
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

        if (hasUproar && poke.base.status === "slp" && ability !== "soundproof") {
          poke.unstatus(battle, "wake");
        }

        if (poke.v.disabled && --poke.v.disabled.turns === 0) {
          poke.v.disabled = undefined;
          battle.info(poke, "disable_end", [{id: poke.id, v: {flags: poke.v.cflags}}]);
        }

        poke.handleEncore(battle);

        if (poke.v.tauntTurns && --poke.v.tauntTurns === 0) {
          battle.info(poke, "taunt_end", [{id: poke.id, v: {flags: poke.v.cflags}}]);
        }

        // TODO: magnet rise, heal block, embargo
      }

      // TODO: lockon/mind reader?

      if (poke.base.hp && poke.v.drowsy && --poke.v.drowsy === 0) {
        battle.event({type: "sv", volatiles: [{id: poke.id, v: {flags: poke.v.cflags}}]});
        if (!poke.base.status && poke.getAbility()?.preventsStatus !== "slp") {
          poke.status("slp", battle, poke, {ignoreSafeguard: true});
        }
      }

      // TODO: sticky barb

      // TODO: this might not be the right place
      const statusOrb = poke.base.item?.statusOrb;
      if (statusOrb && !poke.base.status) {
        poke.status(statusOrb, battle, poke, {});
      }

      battle.checkFaint(poke);
    }

    for (const poke of turnOrder) {
      poke.handleFutureSight(battle);
      battle.checkFaint(poke);
    }

    for (const poke of turnOrder) {
      poke.handlePerishSong(battle);
      battle.checkFaint(poke);
    }

    // TODO: items?
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

    let type = this.getMoveType(move, user.base, battle.getWeather());
    if (user.getAbilityId() === "normalize") {
      type = "normal";
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
      const count = 5 - (user.v.thrashing?.turns ?? 5) + +user.v.usedDefenseCurl;
      power <<= count;
    } else if (move.id === "spitup") {
      power *= user.v.stockpile;
      battle.sv([user.setVolatile("stockpile", 0)]);
    }

    let dmg;
    if (beatUp) {
      dmg = DamageCalc.calcBaseDamageBeatUp(user, beatUp, target, power);
    } else {
      dmg = DamageCalc.calcBaseDamage({
        power,
        type,
        battle,
        move,
        user,
        target,
        isCrit,
      });
    }

    const random = rng === undefined ? battle.rng : rng;
    dmg = DamageCalc.applyMiscModifiers(dmg, {isCrit, user, move, rng: random});
    let eff = new TypeEffectiveness();
    if (move.id !== "struggle" && move.flag !== DMF.futuresight && !beatUp) {
      ({dmg, eff} = DamageCalc.applyTypeModifier(dmg, {type, gen: this, user, target}));
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
      move: this.moveList.struggle as DamagingMove,
    });
    dmg = Gen3DamageCalc.randomizeDamage(dmg, battle.rng);
    let endure;
    if (dmg >= user.base.hp) {
      if (user.v.hasFlag(VF.endure)) {
        dmg = user.base.hp - 1;
        endure = Endure.Endure;
      } else if (this.rng.tryFocusBand(battle)) {
        dmg = user.base.hp - 1;
        endure = Endure.FocusBand;
      } else if (user.base.itemId === "focussash" && user.base.hp === user.base.maxHp) {
        dmg = user.base.hp - 1;
        endure = Endure.FocusSash;
      }
    }
    return {dmg, endure};
  }

  override handleCrashDamage(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
    user.damage(idiv1(target.base.maxHp, 2), user, battle, false, "crash", true);
  }

  override getEffectiveness(type: Type, target: ActivePokemon) {
    return DamageCalc.applyTypeModifier(0, {type, user: target, target, gen: this}).eff;
  }

  // CheckSortSpeed
  override getSpeed(battle: Battle, user: ActivePokemon) {
    const ability = user.getAbility();
    const abilityId = user.getAbilityId();
    const weather = battle.getWeather();
    const item = user.base.item;

    let statChange = user.v.stages.spe;
    if (abilityId === "simple") {
      statChange *= 2;
    }

    let speed = applyStatStages(user, user.v.stats.spe, statChange);
    if (weather && ability?.weatherSpeedBoost === weather) {
      speed <<= 1;
    }

    if (item?.halveSpeed) {
      speed >>= 1;
    } else if (item?.choice === "spe") {
      speed <<= 1;
    }

    // quick powder
    const boost = item?.boostStats?.[user.base.speciesId];
    if (boost && boost.stats.includes("spe")) {
      speed = idiv(speed * (100 + boost.percent), 100);
    }

    if (abilityId === "quickfeet" && user.base.status) {
      speed = idiv(speed * 15, 10);
    } else if (user.base.status === "par") {
      speed >>= 2;
    }

    if (abilityId === "slowstart" && user.v.slowStartTurns < 5) {
      speed >>= 1;
    }
    // else if (abilityId === "unburden" && user.v.unburdenFlag) {
    //   speed <<= 1;
    // }
    if (user.owner.screens.tailwind) {
      speed <<= 1;
    }
    return speed;
  }
}

const applyStatStages = (poke: ActivePokemon, stat: number, stages: number) => {
  const [num, div] = poke.base.gen.stageMultipliers[clamp(stages, -6, 6)];
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
