import speciesPatches from "./species.json";
import items from "./items.json";
import {GENERATION1, type Generation} from "../gen1";
import type {Species, SpeciesId} from "../species";
import {merge, type GenPatches} from "../gen2";
import {moveFunctionPatches, movePatches} from "./moves";
import {GENERATION3, createItemMergeList} from "../gen3";
import {dmgFlags, debugLog, idiv, MC, screens, VF} from "../utils";
import {TurnType} from "../battle";
import {tryDamage} from "./damaging";
import {Range} from "../moves";

const createGeneration = (): Generation => {
  const patches: Partial<GenPatches> = {
    id: 4,
    speciesList: speciesPatches as Partial<
      Record<SpeciesId, Partial<Species>>
    > as typeof GENERATION1.speciesList,
    moveList: movePatches as typeof GENERATION1.moveList,
    lastMoveIdx: GENERATION1.moveList.zenheadbutt.idx!,
    lastPokemon: 493,
    moveFunctions: moveFunctionPatches as typeof GENERATION1.moveFunctions,
    items: createItemMergeList(items),
    rng: {
      disableTurns: battle => battle.rng.int(4, 7) + 1,
    },
    tryDamage,
    getCategory: move => ("category" in move ? move.category : MC.status),
    isSpecial: move => "category" in move && move.category === MC.special,
    afterBeforeUseMove: (battle, user) => {
      battle.checkFaint(user);
      return false;
    },
    afterUseMove(battle, user, isReplacement) {
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
    },
    betweenTurns(battle) {
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
            VF.protect | VF.endure | VF.helpingHand | VF.followMe | VF.snatch | VF.magicCoat;
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
          poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, battle, "recover");
        } else if (weather === "rain" && ability === "hydration" && poke.base.status) {
          battle.ability(poke);
          poke.unstatus(battle);
        }

        // TODO: Dry Skin
      }

      // TODO: Gravity

      // A bunch of stuff
      const hasUproar = battle.allActive.some(p => p.v.thrashing?.move?.flag === "uproar");
      for (const poke of turnOrder) {
        const ability = poke.getAbilityId();
        if (!poke.v.fainted) {
          if (poke.v.hasFlag(VF.ingrain)) {
            poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, battle, "ingrain");
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
              dmg: Math.max(1, idiv(poke.base.stats.hp, 8)),
              src: opp,
              why: "baddreams",
              direct: true,
            });
          }
        }

        if (poke.base.hp) {
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

        if (poke.v.drowsy && --poke.v.drowsy === 0) {
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
      technician,
    }) {
      pow = Math.floor(pow * (moveMod || 1));
      pow = Math.floor(pow * (itemBonus || 1));
      pow = Math.floor(pow * (tripleKick || 1));
      pow = Math.floor(pow * (flashFire ? 1.5 : 1));
      pow = Math.floor(pow * (stockpile || 1));
      pow = Math.floor(pow * (helpingHand ? 1.5 : 1));
      pow = Math.floor(pow * (doubleDmg ? 2 : 1));
      // TODO: should this be floored?
      pow = Math.floor(pow * (technician && pow <= 60 ? 1.5 : 1));

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
            tech: technician,
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
    },
  };

  return merge(patches as any, GENERATION3);
};

export const GENERATION4 = createGeneration();
