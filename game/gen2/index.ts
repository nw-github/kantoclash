import {createDefu} from "defu";
import {GENERATION1, type CalcDamageParams, type Generation} from "../gen1";
import type {Species, SpeciesId} from "../species";
import {floatTo255, scaleAccuracy255, idiv, imul, VF} from "../utils";
import {moveFunctionPatches, movePatches} from "./moves";
import __speciesPatches from "./species.json";
import type {ActivePokemon, Battle} from "../battle";
import type {Move} from "../moves";
import {items} from "../item";

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

const merge = createDefu((obj, key, value) => {
  if (Array.isArray(obj[key])) {
    obj[key] = value;
    return true;
  }
});

const beforeUseMove = (battle: Battle, move: Move, user: ActivePokemon, _: ActivePokemon) => {
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
      const opp = battle.opponentOf(user.owner);
      if (opp.sleepClausePoke === user.base) {
        opp.sleepClausePoke = undefined;
      }
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
    battle.info(user, "disable_end", [{id: user.owner.id, v: {flags: user.v.cflags}}]);
  }

  if (user.v.confusion) {
    const done = --user.v.confusion === 0;
    const v = [{id: user.owner.id, v: {flags: user.v.cflags}}];
    battle.info(user, done ? "confused_end" : "confused", v);
    if (!done && battle.rng.bool()) {
      const move = user.owner.choice?.move;
      const explosion = move?.kind === "damage" && move.flag === "explosion" ? 2 : 1;
      const [atk, def] = battle.gen.getDamageVariables(false, user, user, false);
      const dmg = battle.gen.calcDamage({
        lvl: user.base.level,
        pow: 40,
        def: Math.max(Math.floor(def / explosion), 1),
        atk,
        eff: 1,
        rand: false,
        isCrit: false,
        isStab: false,
      });

      user.damage(dmg, user, battle, false, "confusion");
      resetVolatiles();
      return false;
    }
  }

  if (user.v.attract) {
    battle.event({type: "in_love", src: user.owner.id, target: user.v.attract.owner.id});

    if (battle.rand100(50)) {
      battle.info(user, "immobilized");
      resetVolatiles();
      return false;
    }
  }

  if (user.base.status === "par" && battle.rand100(25)) {
    battle.info(user, "paralyze");
    resetVolatiles();
    return false;
  }

  return true;
};

const createGeneration = (): Generation => {
  const patches: Partial<Generation> = {
    id: 2,
    speciesList: speciesPatches as typeof GENERATION1.speciesList,
    moveList: movePatches as typeof GENERATION1.moveList,
    typeChart: typeChartPatch as typeof GENERATION1.typeChart,
    lastMoveIdx: GENERATION1.moveList.zapcannon.idx!,
    moveFunctions: moveFunctionPatches as typeof GENERATION1.moveFunctions,
    items,
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
      }

      return true;
    },
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
      return battle.rand255Good(floatTo255(critStages[Math.min(stages, 4)] * 100));
    },
    checkAccuracy(move, battle, user, target) {
      if (target.v.invuln) {
        const charging = target.v.charging && battle.moveIdOf(target.v.charging);
        if (!charging || !move.ignore || !move.ignore.includes(charging)) {
          battle.info(user, "miss");
          return false;
        }
      }

      if (!move.acc || (move.rainAcc && battle.weather?.kind === "rain")) {
        return true;
      }

      let chance = move.acc;
      if (move.kind === "damage" && move.flag === "ohko") {
        chance = idiv((user.base.level - target.base.level) * 2 + 76, 256) * 100;
      } else if (move.rainAcc && battle.weather?.kind === "sun") {
        chance = 50;
      }

      let acc = scaleAccuracy255(floatTo255(chance), user, target);
      if (target.base.item === "brightpowder") {
        acc -= 20;
      }

      // console.log(`[${user.base.name}] ${move.name} (Acc ${acc}/255)`);
      if (!battle.rand255Good(acc)) {
        battle.info(user, "miss");
        return false;
      }
      return true;
    },
    calcDamage,
    getDamageVariables(special, user, target, isCrit) {
      const [atks, defs] = special ? (["spa", "spd"] as const) : (["atk", "def"] as const);
      if (isCrit && target.v.stages[defs] < user.v.stages[atks]) {
        isCrit = false;
      }

      let atk = this.getStat!(user, atks, isCrit);
      let def = this.getStat!(target, defs, isCrit, true);
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
    getSleepTurns(battle) {
      let rng = battle.rng.int(0, 255);
      let sleepTurns = rng & 7;
      while (!sleepTurns || sleepTurns === 7) {
        rng = (rng * 5 + 1) & 255;
        sleepTurns = rng & 7;
      }
      return sleepTurns;
    },
    getOHKODamage(user, target, eff) {
      return target.base.level > user.base.level || !eff ? false : 65535;
    },
    getStat(poke, stat, isCrit) {
      const def = stat === "def" || stat === "spd";
      const screen = def && !!poke.owner.screens[stat === "def" ? "reflect" : "light_screen"];

      let value = poke.v.stats[stat];
      if (isCrit) {
        value = poke.base.stats[stat];
      } else if (screen) {
        value *= 2;
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

      // Screens & the species boosting moves all fail to cap the stat at 999, meaning they will
      // cause it to wrap around if the base stat is >= 512
      value %= 1024;
      return value;
    },
  };

  return merge(patches, GENERATION1);
};

export const GENERATION2 = createGeneration();
