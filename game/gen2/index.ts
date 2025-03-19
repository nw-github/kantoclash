import defu from "defu";
import { GENERATION1, type CalcDamageParams, type Generation } from "../gen1";
import { moveList as baseMoveList } from "../moves";
import { speciesList as baseSpeciesList, type Species, type SpeciesId } from "../species";
import { floatTo255, clamp, scaleAccuracy255, idiv, imul } from "../utils";
import { movePatches } from "./moves";
import __speciesPatches from "./species.json";

const speciesPatches = __speciesPatches as Partial<Record<SpeciesId, Partial<Species>>>;

const typeChartPatch: Partial<typeof GENERATION1.typeChart> = {
  ghost: { psychic: 2 },
  poison: { bug: 1 },
  bug: { poison: 0.5 },
  ice: { fire: 0.5 },
};

const critStages: Record<number, number> = {
  [0]: 17 / 256,
  [1]: 1 / 8,
  [2]: 1 / 4,
  [3]: 85 / 256,
  [4]: 1 / 2,
};

const calcDamage = ({
  lvl,
  pow,
  atk,
  def,
  eff,
  isCrit,
  isStab,
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
  const stab = isStab ? 1.5 : 1;
  const w = weather === "bonus" ? 1.5 : weather === "penalty" ? 0.5 : 1;

  let dmg = imul(idiv(idiv((idiv(2 * lvl, 5) + 2) * pow * atk, def), 50), item) * crit + 2;
  // TODO: something about type priority
  dmg = imul(imul(imul(dmg * tk, w), stab), eff) * (moveMod ?? 1);

  let r = typeof rand === "number" ? rand : 255;
  if (rand && typeof rand !== "number" && dmg > 1) {
    r = rand.int(217, 255);
  }
  return idiv(dmg * r, 255) * (doubleDmg ? 2 : 1);
};

const createGeneration = (): Generation => {
  const speciesList = defu(speciesPatches, baseSpeciesList) as typeof baseSpeciesList;
  const moveList = defu(movePatches, baseMoveList) as typeof baseMoveList;
  const typeChart = defu(typeChartPatch, GENERATION1.typeChart) as typeof GENERATION1.typeChart;

  return {
    id: 2,
    speciesList,
    moveList,
    typeChart,
    getCritChance(user, hc) {
      let stages = hc ? 2 : 0;
      if (user.v.flags.focus) {
        stages++;
      }

      /*
      if (user.base.item === "scope_lens") {
        stages++;
      }
      */
      return floatTo255(critStages[clamp(stages, 0, 4)]);
    },
    checkAccuracy(move, battle, user, target) {
      if (target.v.invuln) {
        const charging = target.v.charging && battle.moveIdOf(target.v.charging);
        if (!charging || !move.ignore || !move.ignore.includes(charging)) {
          battle.info(user, "miss");
          return false;
        }
      }

      if (!move.acc) {
        return true;
      }

      let chance = move.acc;
      if (move.rainAcc && battle.weather?.kind === "rain") {
        return true;
      } else if (move.rainAcc && battle.weather?.kind === "sun") {
        chance = 50;
      }

      if (!battle.rand255Good(scaleAccuracy255(floatTo255(chance), user, target))) {
        battle.info(user, "miss");
        return false;
      }
      return true;
    },
    calcDamage,
    getDamageVariables(special, user, target, isCrit) {
      const [atks, defs] = special ? (["spa", "spd"] as const) : (["atk", "def"] as const);

      const ls = special && !!target.owner.light_screen;
      const reflect = !special && !!target.owner.reflect;

      let atk = user.getStat(atks, isCrit);
      // Crits ignore defensive boosts but not drops
      let def = target.getStat(defs, isCrit && target.v.stages[defs] > 0, true, ls || reflect);
      if (atk >= 256 || def >= 256) {
        atk = Math.max(Math.floor(atk / 4) % 256, 1);
        def = Math.max(Math.floor(def / 4) % 256, 1);
      }
      return [atk, def] as const;
    },
    validSpecies: species => species.dexId <= 251,
    getMaxPP: GENERATION1.getMaxPP,
  };
};

export const GENERATION2 = createGeneration();
