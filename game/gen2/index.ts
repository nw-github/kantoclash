import {createDefu} from "defu";
import {GENERATION1, scaleAccuracy255, type CalcDamageParams, type Generation} from "../gen1";
import type {Species, SpeciesId} from "../species";
import {floatTo255, idiv, imul, VF} from "../utils";
import {moveFunctionPatches, movePatches} from "./moves";
import __speciesPatches from "./species.json";
import type {ActivePokemon, Battle} from "../battle";
import type {Move} from "../moves";
import items from "./items.json";
import {applyItemStatBoost} from "../pokemon";
import {tryDamage} from "./damaging";

const speciesPatches = __speciesPatches as Partial<Record<SpeciesId, Partial<Species>>>;

const typeChartPatch: Partial<typeof GENERATION1.typeChart> = {
  ghost: {psychic: 2},
  poison: {bug: 1},
  bug: {poison: 0.5},
  ice: {fire: 0.5},
};

const critStages: Record<number, number> = {
  [0]: 17 / 256,
  [1]: 1 / 8,
  [2]: 1 / 4,
  [3]: 85 / 256,
  [4]: 1 / 2,
};

const accStageMultipliers: Record<number, number> = {
  [-6]: 33 / 100,
  [-5]: 36 / 100,
  [-4]: 43 / 100,
  [-3]: 50 / 100,
  [-2]: 60 / 100,
  [-1]: 75 / 100,
  0: 100 / 100,
  1: 133 / 100,
  2: 266 / 100,
  3: 200 / 100,
  4: 233 / 100,
  5: 266 / 100,
  6: 300 / 100,
};

const calcDamage = ({
  lvl,
  pow,
  atk,
  def,
  eff,
  isCrit,
  hasStab,
  rand,
  itemBonus,
  tripleKick,
  weather,
  moveMod,
  doubleDmg,
}: CalcDamageParams) => {
  if (eff === 0) {
    return 0;
  }

  const item = itemBonus ? 1.1 : 1;
  const crit = isCrit ? 2 : 1;
  const tk = tripleKick ?? 1;
  const stab = hasStab ? 1.5 : 1;
  const w = weather === "bonus" ? 1.5 : weather === "penalty" ? 0.5 : 1;
  const double = doubleDmg ? 2 : 1;

  let dmg = imul(idiv(idiv((idiv(2 * lvl, 5) + 2) * pow * atk, def), 50), item) * crit + 2;
  // TODO: something about type priority
  dmg = imul(imul(imul(dmg * tk, w), stab), eff) * (moveMod ?? 1);

  let r = typeof rand === "number" ? rand : 255;
  if (rand && typeof rand !== "number" && dmg > 1) {
    r = rand.int(217, 255);
  }

  // console.log({item, crit, tk, stab, w, double, r, moveMod: moveMod ?? 1});
  return idiv(dmg * r, 255) * double;
};

export const merge = createDefu((obj, key, value) => {
  if (Array.isArray(obj[key])) {
    obj[key] = value;
    return true;
  }
});

const beforeUseMove = (battle: Battle, move: Move, user: ActivePokemon) => {
  const resetVolatiles = () => {
    user.v.charging = undefined;
    user.v.invuln = false;
    user.v.bide = undefined;
    if (user.v.thrashing?.turns !== -1) {
      user.v.thrashing = undefined;
    }
    user.v.trapping = undefined;
    user.v.furyCutter = 0;
    user.v.rollout = 0;
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
      if (!move.whileAsleep) {
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
};

export type GenPatches = {
  [P in keyof Generation]: Generation[P] extends object
    ? Generation[P] extends (...params: any[]) => any
      ? Generation[P]
      : Partial<Generation[P]>
    : Generation[P];
};

const createGeneration = (): Generation => {
  const patches: Partial<GenPatches> = {
    id: 2,
    speciesList: speciesPatches as typeof GENERATION1.speciesList,
    moveList: movePatches as typeof GENERATION1.moveList,
    typeChart: typeChartPatch as typeof GENERATION1.typeChart,
    lastMoveIdx: GENERATION1.moveList.zapcannon.idx!,
    moveFunctions: moveFunctionPatches as typeof GENERATION1.moveFunctions,
    items,
    accStageMultipliers,
    rng: {
      tryDefrost: battle => battle.rand255(25),
      tryCrit(battle, user, hc) {
        let stages = hc ? 2 : 0;
        if (user.v.hasFlag(VF.focusEnergy)) {
          stages++;
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
        return battle.rand255Good(floatTo255(critStages[Math.min(stages, 4)] * 100));
      },
      sleepTurns(battle) {
        let rng = battle.rng.int(0, 255);
        let sleepTurns = rng & 7;
        while (!sleepTurns || sleepTurns === 7) {
          rng = (rng * 5 + 1) & 255;
          sleepTurns = rng & 7;
        }
        return sleepTurns;
      },
      disableTurns: battle => battle.rng.int(2, 8) + 1,
      thrashDuration: battle => battle.rng.int(2, 3),
      maxThrash: 2,
    },
    canSubstitute: (user, hp) => hp < user.base.hp,
    beforeUseMove,
    isValidMove(battle, user, move, i) {
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
      }

      return true;
    },
    checkAccuracy(move, battle, user, target) {
      if (target.v.invuln) {
        const charging = target.v.charging && battle.moveIdOf(target.v.charging.move);
        if (charging && (!move.ignore || !move.ignore.includes(charging))) {
          battle.miss(user, target);
          return false;
        }
      }

      if (!move.acc || (move.rainAcc && battle.hasWeather("rain"))) {
        return true;
      }

      let chance = floatTo255(move.acc);
      if (move.kind === "damage" && move.flag === "ohko") {
        chance = (user.base.level - target.base.level) * 2 + 76;
      } else if (move.rainAcc && battle.hasWeather("sun")) {
        chance = 127;
      }

      let acc = scaleAccuracy255(chance, user, target);
      if (target.base.item === "brightpowder") {
        acc -= 20;
      }

      // console.log(`[${user.base.name}] ${move.name} (Acc ${acc}/255)`);
      if (!battle.rand255Good(acc)) {
        battle.miss(user, target);
        return false;
      }
      return true;
    },
    calcDamage,
    getDamageVariables(special, battle, user, target, isCrit) {
      const [atks, defs] = special ? (["spa", "spd"] as const) : (["atk", "def"] as const);
      if (isCrit && target.v.stages[defs] < user.v.stages[atks]) {
        isCrit = false;
      }

      let atk = user.base.gen.getStat(battle, user, atks, isCrit);
      let def = user.base.gen.getStat(battle, target, defs, isCrit, true);
      if (atk >= 256 || def >= 256) {
        atk = Math.max(Math.floor(atk / 4) % 256, 1);
        def = Math.max(Math.floor(def / 4) % 256, 1);
      }
      return [atk, def] as const;
    },
    handleCrashDamage(battle, user, target, dmg) {
      dmg = Math.min(dmg, target.base.hp);
      user.damage(Math.floor(dmg / 8), user, battle, false, "crash", true);
    },
    validSpecies: species => species.dexId <= 251,
    canOHKOHit: (_, user, target) => target.base.level <= user.base.level,
    getStat(battle, poke, stat, isCrit) {
      const def = stat === "def" || stat === "spd";
      const screen = def && !!poke.owner.screens[stat === "def" ? "reflect" : "light_screen"];

      let value = Math.floor(
        poke.base.stats[stat] * poke.base.gen.stageMultipliers[poke.v.stages[stat]],
      );

      if (poke.base.status === "brn" && stat === "atk" && poke.v.ability !== "guts") {
        value = Math.max(Math.floor(value / 2), 1);
      } else if (poke.base.status === "par" && stat === "spe") {
        value = Math.max(Math.floor(value / 4), 1);
      }

      // crit ignores brn in gen 2
      if (isCrit) {
        value = poke.base.stats[stat];
      } else if (screen) {
        value *= 2;
      }

      value = poke.applyAbilityStatBoost(battle, stat, value);
      value = applyItemStatBoost(poke.base, stat, value);

      // Screens & the species boosting moves all fail to cap the stat at 999, meaning they will
      // cause it to wrap around if the base stat is >= 512
      value %= 1024;
      return value;
    },
    getGender(_desired, species, atk) {
      if (species.genderRatio) {
        return atk < 15 - Math.floor(species.genderRatio * 15) ? "F" : "M";
      } else if (species.genderRatio === 0) {
        return "F";
      } else {
        return "N";
      }
    },
    getShiny(_desired, dvs) {
      return (
        dvs.def === 10 &&
        dvs.spe === 10 &&
        dvs.spa === 10 &&
        [2, 3, 6, 7, 10, 11, 14, 15].includes(dvs.atk)
      );
    },
    accumulateBide(_battle, user, bide) {
      // FIXME: this is wrong since retaliateDamage is reset at the end of the turn
      bide.dmg += user.v.retaliateDamage;
    },
    tryDamage,
  };

  return merge(patches as any, GENERATION1);
};

export const GENERATION2 = createGeneration();
