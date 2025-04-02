import type {Generation, GENERATION1} from "../gen1";
import {GENERATION2, merge, type GenPatches} from "../gen2";
import {applyItemStatBoost, Nature, natureTable} from "../pokemon";
import type {Species, SpeciesId} from "../species";
import {clamp, idiv, VF} from "../utils";
import {moveFunctionPatches, movePatches} from "./moves";
import speciesPatches from "./species.json";
import items from "./items.json";
import {reduceAccItem} from "../item";

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
    // lastMoveIdx: GENERATION1.moveList.zapcannon.idx!,
    moveFunctions: moveFunctionPatches as typeof GENERATION1.moveFunctions,
    maxIv: 31,
    maxEv: 255,
    maxTotalEv: 510,
    itemTypeBoost: {
      dragonscale: null,
      dragonfang: {type: "dragon", percent: 10},
    },
    statBoostItem: {metalpowder: {ditto: {stats: ["def", "spd"], transformed: false}}},
    stageMultipliers,
    rng: {
      tryCrit(battle, user, hc) {
        let stages = hc ? 2 : 0;
        if (user.v.hasFlag(VF.focus)) {
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
        return battle.rand100(critStages[Math.min(stages, 4)] * 100);
      },
      sleepTurns: battle => battle.rng.int(1, 4),
    },
    getDamageVariables(special, user, target, isCrit) {
      const [atks, defs] = special ? (["spa", "spd"] as const) : (["atk", "def"] as const);
      if (isCrit && target.v.stages[defs] < user.v.stages[atks]) {
        isCrit = false;
      }

      const atk = this.getStat!(user, atks, isCrit);
      const def = this.getStat!(target, defs, isCrit, true);
      return [atk, def] as const;
    },
    handleCrashDamage(battle, user, target, dmg) {
      dmg = Math.min(dmg, target.base.hp);
      user.damage(Math.floor(dmg / 2), user, battle, false, "crash", true);
    },
    validSpecies: species => species.dexId <= 386,
    canOHKOHit: () => true,
    getStat(poke, stat, isCrit) {
      const def = stat === "def" || stat === "spd";
      let value = poke.v.stats[stat];
      if (isCrit && def && poke.v.stages[stat] > 0) {
        value = poke.base.stats[stat];
      }
      if (isCrit && !def && poke.v.stages[stat] < 0) {
        value = poke.base.stats[stat];
        if (poke.base.status === "brn" && stat === "atk") {
          value = Math.max(Math.floor(value / 2), 1);
        }
      }

      if (
        (poke.base.ability === "hugepower" || poke.base.ability === "purepower") &&
        stat === "atk"
      ) {
        value *= 2;
      }

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

      if (move.kind === "damage" && move.flag === "ohko") {
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

      let acc = Math.floor(
        chance * this.accStageMultipliers![clamp(user.v.stages.acc - target.v.stages.eva, -6, 6)]!,
      );
      if (reduceAccItem[target.base.item!]) {
        acc -= Math.floor(acc * (reduceAccItem[target.base.item!]! / 100));
      }

      // console.log(`[${user.base.name}] ${move.name} (Acc ${acc}/255)`);
      if (!battle.rand100(acc)) {
        battle.miss(user, target);
        return false;
      }
      return true;
    },
  };

  const r = merge(patches as any, GENERATION2);
  r.items = items;
  return r;
};

export const GENERATION3 = createGeneration();
