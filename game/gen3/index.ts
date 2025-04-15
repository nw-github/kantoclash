import {shouldReturn, type Generation, GENERATION1} from "../gen1";
import {GENERATION2, merge, type GenPatches} from "../gen2";
import {applyItemStatBoost, Nature, natureTable} from "../pokemon";
import {abilityList, type Species, type SpeciesId} from "../species";
import {clamp, idiv, MC, screens, VF} from "../utils";
import {moveFunctionPatches, movePatches} from "./moves";
import speciesPatches from "./species.json";
import items from "./items.json";
import {reduceAccItem} from "../item";
import {tryDamage} from "./damaging";
import type {ActivePokemon} from "../active";

const critStages: Record<number, number> = {
  [0]: 1 / 16,
  [1]: 1 / 8,
  [2]: 1 / 4,
  [3]: 1 / 3,
  [4]: 1 / 2,
};

const stageMultipliers: Record<number, number> = {
  [-6]: 2 / 8,
  [-5]: 2 / 7,
  [-4]: 2 / 6,
  [-3]: 2 / 5,
  [-2]: 2 / 4,
  [-1]: 2 / 3,
  0: 2 / 2,
  1: 3 / 2,
  2: 4 / 2,
  3: 5 / 2,
  4: 6 / 2,
  5: 7 / 2,
  6: 8 / 2,
};

const createGeneration = (): Generation => {
  const patches: Partial<GenPatches> = {
    id: 3,
    speciesList: speciesPatches as Partial<
      Record<SpeciesId, Partial<Species>>
    > as typeof GENERATION1.speciesList,
    moveList: movePatches as typeof GENERATION1.moveList,
    lastMoveIdx: GENERATION1.moveList.yawn.idx!,
    moveFunctions: moveFunctionPatches as typeof GENERATION1.moveFunctions,
    maxIv: 31,
    maxEv: 255,
    maxTotalEv: 510,
    itemTypeBoost: {
      dragonscale: null,
      dragonfang: {type: "dragon", percent: 10},
    },
    statBoostItem: {metalpowder: {ditto: {stats: ["def", "spd"], transformed: false, amount: 0.5}}},
    stageMultipliers,
    rng: {
      tryDefrost: battle => battle.rand100(20),
      tryCrit(battle, user, hc) {
        let stages = hc ? 2 : 0;
        if (user.v.hasFlag(VF.focusEnergy)) {
          stages += 2;
        }
        if (user.base.item === "scopelens") {
          stages++;
        }
        if (user.base.item === "stick" && user.base.real.speciesId === "farfetchd") {
          stages += 2;
        }
        if (user.base.item === "luckypunch" && user.base.real.speciesId === "chansey") {
          stages += 2;
        }
        return battle.rand100(critStages[Math.min(stages, 4)] * 100);
      },
      sleepTurns: battle => battle.rng.int(1, 4),
      disableTurns: battle => battle.rng.int(2, 5) + 1,
      bideDuration: () => 2,
    },
    invalidSketchMoves: [],
    getDamageVariables(spc, battle, user, target, isCrit) {
      const atk = user.base.gen.getStat(battle, user, spc ? "spa" : "atk", isCrit);
      const def = user.base.gen.getStat(battle, target, spc ? "spd" : "def", isCrit, true);
      return [atk, def] as const;
    },
    handleCrashDamage(battle, user, target, dmg) {
      dmg = Math.min(dmg, target.base.hp);
      user.damage(Math.floor(dmg / 2), user, battle, false, "crash", true);
    },
    validSpecies: species => species.dexId <= 386,
    canOHKOHit: () => true,
    getStat(battle, poke, stat, isCrit) {
      const def = stat === "def" || stat === "spd";
      let value = Math.floor(
        poke.base.stats[stat] * poke.base.gen.stageMultipliers[poke.v.stages[stat]],
      );

      if (poke.base.status === "brn" && stat === "atk" && poke.v.ability !== "guts") {
        value = Math.max(Math.floor(value / 2), 1);
      } else if (poke.base.status === "par" && stat === "spe") {
        value = Math.max(Math.floor(value / 4), 1);
      }

      if (isCrit && def && poke.v.stages[stat] > 0) {
        value = poke.base.stats[stat];
      }
      if (isCrit && !def && poke.v.stages[stat] < 0) {
        value = poke.base.stats[stat];
        if (poke.base.status === "brn" && stat === "atk") {
          value = Math.max(Math.floor(value / 2), 1);
        }
      }

      value = poke.applyAbilityStatBoost(battle, stat, value);
      return applyItemStatBoost(poke.base, stat, value);
    },
    getHpIv: ivs => ivs?.hp ?? 31,
    calcStat(stat, bases, level, ivs, evs, nature) {
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
    },
    tryDamage,
    getShiny: desired => desired ?? false,
    getGender: (desired, species) => {
      // prettier-ignore
      switch (species.genderRatio) {
      case undefined: return "N";
      case 100: return "M";
      case 0: return "F";
      default: return desired;
      }
    },
    getMaxPP: move => (move.pp === 1 ? 1 : Math.floor((move.pp * 8) / 5)),
    checkAccuracy(move, battle, user, target, phys) {
      if (target.v.invuln) {
        const charging = target.v.charging && battle.moveIdOf(target.v.charging.move);
        if (charging && (!move.ignore || !move.ignore.includes(charging))) {
          battle.miss(user, target);
          return false;
        }
      }

      // TODO: does pursuit skip the invuln check? Could matter if:
      // Player 1: Pokémon A is flying, Pokémon B is switching out
      // Player 2: Pokémon C & D pursuit into B, C kills it, D retargets to A
      // This situation can't happen in Gen 3 though since B would be replaced before D moves
      if (!move.acc || user.v.inPursuit || (move.rainAcc && battle.hasWeather("rain"))) {
        return true;
      }

      if (move.kind === "damage" && move.flag === "ohko") {
        if (target.v.ability === "sturdy") {
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

      let chance = move.acc;
      if (move.rainAcc && battle.hasWeather("sun")) {
        chance = 50;
      }

      let eva = target.v.stages.eva;
      if (target.v.hasFlag(VF.identified)) {
        eva = 0;
      }

      let acc = Math.floor(
        chance * this.accStageMultipliers![clamp(user.v.stages.acc - eva, -6, 6)]!,
      );
      if (reduceAccItem[target.base.item!]) {
        acc -= Math.floor(acc * (reduceAccItem[target.base.item!]! / 100));
      }

      if (user.v.ability === "compoundeyes") {
        acc += Math.floor(acc * 0.3);
      }

      phys ??= battle.gen.getCategory(move) === MC.physical;
      if (user.v.ability === "hustle" && phys) {
        acc -= Math.floor(acc * 0.2);
      }

      if (
        abilityList[target.v.ability!]?.weatherEva &&
        battle.getWeather() === abilityList[target.v.ability!]?.weatherEva
      ) {
        acc = Math.floor((acc * 4) / 5);
      }

      // console.log(`[${user.base.name}] ${move.name} (Acc ${acc}/255)`);
      if (!battle.rand100(acc)) {
        battle.miss(user, target);
        return false;
      }
      return true;
    },

    beforeUseMove(battle, move, user) {
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

      if (user.v.recharge) {
        battle.info(user, "recharge");
        user.v.recharge = undefined;
        resetVolatiles();
        return false;
      }

      if (user.v.ability === "truant" && user.v.hasFlag(VF.loafing)) {
        battle.info(user, "loafing");
        resetVolatiles();
        return false;
      }

      if (user.v.flinch) {
        battle.info(user, "flinch");
        resetVolatiles();
        return false;
      }

      const moveId = battle.moveIdOf(move)!;
      if (moveId === user.base.moves[user.v.disabled?.indexInMoves ?? -1]) {
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
    },
    afterBeforeUseMove: (battle, user) => battle.checkFaint(user) && shouldReturn(battle, false),
    afterUseMove(battle, user, isReplacement) {
      if (isReplacement) {
        if (user.base.hp === 0 && !user.v.fainted) {
          user.faint(battle);
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
    },
    betweenTurns(battle) {
      const checkFaint = (poke: ActivePokemon) => {
        return (
          battle.checkFaint(poke, true) &&
          battle.allActive.some(p => p.v.fainted && p.canBeReplaced(battle))
        );
      };

      // TODO: should this turn order take into account priority/pursuit/etc. or should it use
      // out of battle speeed?
      const turnOrder = battle.turnOrder;

      if (import.meta.dev) {
        console.log(
          `\nbetweenTurns(${BetweenTurns[battle.betweenTurns]}):`,
          battle.turnOrder.map(t => t.base.name),
        );
      }

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
            battle.event({type: "weather", kind: "end", weather: battle.weather.kind});
            delete battle.weather;
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
          if (!poke.v.fainted) {
            if (poke.v.hasFlag(VF.ingrain)) {
              poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, battle, "ingrain");
            }

            if (battle.hasWeather("rain") && poke.v.ability === "raindish") {
              battle.ability(poke);
              poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, battle, "none");
            }

            if (poke.v.ability === "speedboost" && poke.v.canSpeedBoost && poke.v.stages.spe < 6) {
              battle.ability(poke);
              poke.modStages([["spe", +1]], battle);
            }

            if (poke.v.canSpeedBoost) {
              if (poke.v.hasFlag(VF.loafing)) {
                poke.v.clearFlag(VF.loafing);
              } else if (poke.v.ability === "truant") {
                poke.v.setFlag(VF.loafing);
              }
            }

            if (
              poke.base.status &&
              poke.v.ability === "shedskin" &&
              battle.gen.rng.tryShedSkin(battle)
            ) {
              battle.ability(poke);
              poke.unstatus(battle);
            }
          }

          poke.handleLeftovers(battle);
          poke.handleBerry(battle, {pinch: true, status: true, heal: true, pp: true});
          battle.gen.handleResidualDamage(battle, poke);
          if (poke.base.hp) {
            poke.handlePartialTrapping(battle);
          }

          if (poke.base.hp) {
            if (hasUproar && poke.base.status === "slp" && poke.v.ability !== "soundproof") {
              poke.unstatus(battle, "wake");
            }

            if (poke.v.thrashing) {
              const done = --poke.v.thrashing.turns === 0;
              if (poke.v.thrashing.move.flag === "uproar") {
                battle.info(poke, done ? "uproar_end" : "uproar_continue");
              }

              if (done) {
                if (poke.v.thrashing.move.flag === "multi_turn" && poke.v.ability !== "owntempo") {
                  poke.confuse(battle, "cConfusedFatigueMax");
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
            if (!poke.base.status && abilityList[poke.v.ability!]?.preventsStatus !== "slp") {
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
    },
    calcDamage({
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
    }) {
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
        let extra = "";
        const c = (n: string, b?: bool) => b && (extra += n + " ");
        c("crit", isCrit);
        c("stab", hasStab);
        c("ff", flashFire);
        c("double", doubleDmg);
        c("hh", helpingHand);
        c("screen", screen);
        c("spread", spread);
        c(`item:${itemBonus}`, (itemBonus || 1) > 1);
        c(`weather:${weather}`, !!weather);
        c(`TK:${tripleKick}`, (tripleKick || 1) > 1);
        c(`MM:${moveMod}`, (moveMod || 1) > 1);
        c(`SP:${stockpile}`, (stockpile || 1) > 1);
        console.log(`flag: ${extra}`);
        console.log("vars:", {dmg, lvl, pow, atk, def, eff, r});
      }
      return dmg;
    },
  };

  const r = merge(patches as any, GENERATION2);
  r.items = items;
  return r;
};

enum BetweenTurns {
  Begin,
  Weather,
  PartialTrapping,
  FutureSight,
  PerishSong,
}

export const GENERATION3 = createGeneration();
