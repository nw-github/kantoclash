import {shouldReturn, type CalcDamageParams} from "../gen1";
import {Generation2, merge} from "../gen2";
import {
  applyItemStatBoost,
  Nature,
  natureTable,
  SAWSBUCK_FORM,
  UNOWN_FORM,
  type Gender,
} from "../pokemon";
import {abilityList, type Species, type SpeciesId} from "../species";
import {
  clamp,
  dmgFlags,
  debugLog,
  idiv,
  MC,
  screens,
  VF,
  type StatStageId,
  type Stats,
} from "../utils";
import {moveScripts, moveOverrides, movePatches} from "./moves";
import speciesPatches from "./species.json";
import items from "./items.json";
import {itemList, type ItemId} from "../item";
import {tryDamage} from "./damaging";
import type {ActivePokemon} from "../active";
import {TurnType, type Battle} from "../battle";
import type {Move, MoveId} from "../moves";

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

  override getDamageVariables(
    spc: bool,
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    isCrit: bool,
  ) {
    const atk = user.base.gen.getStat(battle, user, spc ? "spa" : "atk", isCrit);
    const def = user.base.gen.getStat(battle, target, spc ? "spd" : "def", isCrit, true);
    return [atk, def] as const;
  }

  override handleCrashDamage(
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    dmg: number,
  ) {
    dmg = Math.min(dmg, target.base.hp);
    user.damage(Math.floor(dmg / 2), user, battle, false, "crash", true);
  }

  override canOHKOHit() {
    return true;
  }

  override getStat(
    battle: Battle,
    poke: ActivePokemon,
    stat: StatStageId,
    isCrit: boolean | undefined,
  ) {
    const def = stat === "def" || stat === "spd";
    const [num, div] = poke.base.gen.stageMultipliers[poke.v.stages[stat]];
    let value = idiv(poke.base.stats[stat] * num, div);

    if (poke.base.status === "brn" && stat === "atk" && !poke.hasAbility("guts")) {
      value = Math.max(idiv(value, 2), 1);
    } else if (poke.base.status === "par" && stat === "spe") {
      value = Math.max(idiv(value, 4), 1);
    }

    if (isCrit && def && poke.v.stages[stat] > 0) {
      value = poke.base.stats[stat];
    }
    if (isCrit && !def && poke.v.stages[stat] < 0) {
      value = poke.base.stats[stat];
      if (poke.base.status === "brn" && stat === "atk") {
        value = Math.max(idiv(value, 2), 1);
      }
    }
    if (stat === "spe" && poke.owner.screens.tailwind) {
      value *= 2;
    }

    value = poke.applyAbilityStatBoost(battle, stat, value);
    return applyItemStatBoost(poke.base, stat, value);
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
    return move.pp === 1 ? 1 : Math.floor((move.pp * 8) / 5);
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
    }

    if (move.kind === "damage" && move.flag === "ohko") {
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
      acc -= Math.floor(acc * (targetItem.reduceAcc / 100));
    }

    const userItem = user.base.item;
    if (userItem?.boostAcc) {
      acc += Math.floor(acc * (userItem.boostAcc / 100));
    }

    if (user.hasAbility("compoundeyes")) {
      acc += Math.floor(acc * 0.3);
    }

    phys ??= battle.gen.getCategory(move) === MC.physical;
    if (user.hasAbility("hustle") && phys) {
      acc -= Math.floor(acc * 0.2);
    }

    const weatherEva = target.getAbility()?.weatherEva;
    if (weatherEva && battle.getWeather() === weatherEva) {
      acc = Math.floor((acc * 4) / 5);
    }

    // debugLog(`[${user.base.name}] ${move.name} (Acc ${acc}/255)`);
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
            poke.recover(
              Math.max(1, Math.floor(poke.base.stats.hp / 2)),
              poke,
              battle,
              `wish:${poke.base.name}`,
            );
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
      const hasUproar = battle.allActive.some(p => p.v.thrashing?.move?.flag === "uproar");
      for (const poke of turnOrder) {
        const ability = poke.getAbilityId();
        if (!poke.v.fainted) {
          if (poke.v.hasFlag(VF.ingrain)) {
            poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, battle, "ingrain");
          }

          if (battle.hasWeather("rain") && ability === "raindish" && !poke.base.isMaxHp()) {
            battle.ability(poke);
            poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, battle, "recover");
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
            if (poke.v.thrashing.move.flag === "uproar") {
              battle.info(poke, done ? "uproar_end" : "uproar_continue");
            }

            if (done) {
              if (poke.v.thrashing.move.flag === "multi_turn" && ability !== "owntempo") {
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

        if (poke.v.drowsy && --poke.v.drowsy === 0) {
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

  override calcDamage({
    lvl,
    pow,
    atk,
    def,
    eff,
    isCrit,
    hasStab,
    rand,
    itemBonus,
    weather,
    tripleKick,
    flashFire,
    moveMod,
    doubleDmg,
    stockpile,
    helpingHand,
    screen,
    spread,
  }: CalcDamageParams) {
    pow = Math.floor(pow * (moveMod || 1));
    pow = Math.floor(pow * (itemBonus || 1));
    pow = Math.floor(pow * (tripleKick || 1));
    pow = Math.floor(pow * (flashFire ? 1.5 : 1));

    let dmg = idiv(idiv((idiv(2 * lvl, 5) + 2) * pow * atk, def), 50);
    // TODO: brn should be applied here
    if (screen && !isCrit) {
      if (spread) {
        dmg = idiv(dmg, 3) * 2;
      } else {
        dmg = idiv(dmg, 2);
      }
    }

    if (spread) {
      dmg = idiv(dmg, 2);
    }

    if (weather === "penalty") {
      dmg = idiv(dmg, 2);
    } else if (weather === "bonus") {
      dmg += idiv(dmg, 2);
    }

    // TODO: for physical attacks only???
    dmg = Math.max(dmg, 1);
    dmg += 2;

    if (isCrit) {
      dmg *= 2;
    }
    if (doubleDmg) {
      dmg *= 2;
    }
    dmg *= stockpile || 1;
    if (helpingHand) {
      dmg += idiv(dmg, 2);
    }
    if (hasStab) {
      dmg += idiv(dmg, 2);
    }
    dmg = Math.floor(dmg * eff);
    const r = typeof rand === "number" ? rand : rand ? rand.int(85, 100) : 100;
    dmg = Math.max(1, idiv(dmg * r, 100));

    if (import.meta.dev) {
      debugLog(
        `flag: ${dmgFlags({
          crit: isCrit,
          stab: hasStab,
          ff: flashFire,
          double: doubleDmg,
          hh: helpingHand,
          screen: screen,
          spread: spread,
          [`item:${itemBonus}`]: (itemBonus || 1) > 1,
          [`weather:${weather}`]: !!weather,
          [`TK:${tripleKick}`]: (tripleKick || 1) > 1,
          [`MM:${moveMod}`]: (moveMod || 1) > 1,
          [`SP:${stockpile}`]: (stockpile || 1) > 1,
        })}`,
      );
      debugLog("vars:", {dmg, lvl, pow, atk, def, eff, r});
    }
    return dmg;
  }

  override handleRage(battle: Battle, poke: ActivePokemon) {
    if (poke.v.lastMove?.kind === "damage" && poke.v.lastMove.flag === "rage") {
      battle.info(poke, "rage");
      poke.modStages([["atk", +1]], battle);
    }
  }
}
