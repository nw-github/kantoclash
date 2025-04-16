import speciesPatches from "./species.json";
import items from "./items.json";
import {GENERATION1, type Generation} from "../gen1";
import {abilityList, type Species, type SpeciesId} from "../species";
import {merge, type GenPatches} from "../gen2";
import {moveFunctionPatches, movePatches} from "./moves";
import {GENERATION3} from "../gen3";
import {idiv, MC, screens, VF} from "../utils";
import {TurnType} from "../battle";
import {tryDamage} from "./damaging";

const createGeneration = (): Generation => {
  const patches: Partial<GenPatches> = {
    id: 4,
    speciesList: speciesPatches as Partial<
      Record<SpeciesId, Partial<Species>>
    > as typeof GENERATION1.speciesList,
    moveList: movePatches as typeof GENERATION1.moveList,
    lastMoveIdx: GENERATION1.moveList.zenheadbutt.idx!,
    moveFunctions: moveFunctionPatches as typeof GENERATION1.moveFunctions,
    rng: {
      disableTurns: battle => battle.rng.int(4, 7) + 1,
    },
    tryDamage,
    validSpecies: species => species.dexId <= 493 && !species.unselectable,
    getCategory: move => ("category" in move ? move.category : MC.status),
    isSpecial: move => "category" in move && move.category === MC.special,
    afterBeforeUseMove: (battle, user) => {
      battle.checkFaint(user);
      return false;
    },
    afterUseMove(battle, user, isReplacement) {
      if (isReplacement) {
        if (user.base.hp === 0 && !user.v.fainted) {
          user.faint(battle);
          return true;
        }
        user.handleBerry(battle, {pp: true, pinch: true, status: true, heal: true});
        return false;
      }

      for (const poke of battle.allActive) {
        if (poke.base.hp !== 0) {
          poke.handleBerry(battle, {pp: true, pinch: true, status: true, heal: true});
        }
      }

      if (user.v.inBatonPass) {
        return true;
      }

      battle.checkFaint(user);
      return false;
    },

    betweenTurns(battle) {
      // TODO: should this turn order take into account priority/pursuit/etc. or should it use
      // out of battle speeed?
      const turnOrder = battle.turnOrder;

      // TODO: dont execute this twice if someone dies to spikes after being switched in
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

      if (battle.turnType !== TurnType.Normal) {
        for (const poke of battle.inTurnOrder()) {
          if (poke.choice?.isReplacement || battle.turnType === TurnType.Lead) {
            poke.handleWeatherAbility(battle);
            poke.handleSwitchInAbility(battle);
            poke.handleBerry(battle, {pp: true, pinch: true, status: true, heal: true});
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
          battle.checkFaint(poke);
        }
      }

      // Abilities
      for (const poke of turnOrder) {
        if (battle.hasWeather("rain") && poke.v.ability === "raindish") {
          battle.ability(poke);
          poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, battle, "none");
        }

        // TODO: Dry Skin/Hydration/Ice Body
      }

      // TODO: Gravity

      // A bunch of stuff
      const hasUproar = battle.allActive.some(p => p.v.thrashing?.move?.flag === "uproar");
      for (const poke of turnOrder) {
        if (!poke.v.fainted) {
          if (poke.v.hasFlag(VF.ingrain)) {
            poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, battle, "ingrain");
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
        battle.gen.handleResidualDamage(battle, poke);
        if (poke.base.hp) {
          poke.handlePartialTrapping(battle);
        }
        // TODO: Bad Dreams

        if (poke.base.hp) {
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

          if (hasUproar && poke.base.status === "slp" && poke.v.ability !== "soundproof") {
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
          if (!poke.base.status && abilityList[poke.v.ability!]?.preventsStatus !== "slp") {
            poke.status("slp", battle, poke, {ignoreSafeguard: true});
          }
        }

        // TODO: sticky barb

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
  };

  const r = merge(patches as any, GENERATION3);
  // r.items = items;
  return r;
};

export const GENERATION4 = createGeneration();
