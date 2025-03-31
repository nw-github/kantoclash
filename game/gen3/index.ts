import type {Generation, GENERATION1} from "../gen1";
import {GENERATION2, merge, type GenPatches} from "../gen2";
import {Nature, natureTable} from "../pokemon";
import type {Species, SpeciesId} from "../species";
import {idiv, VF} from "../utils";
import {moveFunctionPatches, movePatches} from "./moves";
import __speciesPatches from "./species.json";

const speciesPatches = __speciesPatches as Partial<Record<SpeciesId, Partial<Species>>>;

const critStages: Record<number, number> = {
  [0]: 1 / 16,
  [1]: 1 / 8,
  [2]: 1 / 4,
  [3]: 1 / 3,
  [4]: 1 / 2,
};

const createGeneration = (): Generation => {
  const patches: Partial<GenPatches> = {
    id: 3,
    speciesList: speciesPatches as typeof GENERATION1.speciesList,
    moveList: movePatches as typeof GENERATION1.moveList,
    // lastMoveIdx: GENERATION1.moveList.zapcannon.idx!,
    moveFunctions: moveFunctionPatches as typeof GENERATION1.moveFunctions,
    maxIv: 31,
    maxEv: 255,
    maxTotalEv: 510,
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
        poke.base.item === "metalpowder" &&
        def &&
        (poke.base.speciesId === "ditto" || poke.base.real.speciesId === "ditto")
      ) {
        value *= 2;
      } else if (
        poke.base.item === "lightball" &&
        stat === "spa" &&
        poke.base.real.speciesId === "pikachu"
      ) {
        value *= 2;
      } else if (
        poke.base.item === "thickclub" &&
        stat === "atk" &&
        poke.base.real.speciesId === "marowak"
      ) {
        value *= 2;
      }

      return value;
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
      case undefined: return;
      case 100: return "male";
      case 0: return "female";
      default: return desired ?? (Math.random() * 100 < species.genderRatio ? "male" : "female");
      }
    },
  };

  return merge(patches as any, GENERATION2);
};

export const GENERATION3 = createGeneration();
