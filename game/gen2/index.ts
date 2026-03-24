import {createDefu} from "defu";
import {Generation1, scaleAccuracy255, type CalcDamageParams} from "../gen1";
import type {Species, SpeciesId} from "../species";
import {
  clamp,
  debugLog,
  dmgFlags,
  floatTo255,
  idiv,
  imul,
  VF,
  type Stats,
  type StatStageId,
} from "../utils";
import {moveOverrides, moveScripts, movePatches} from "./moves";
import speciesPatches from "./species.json";
import type {ActivePokemon, Battle} from "../battle";
import type {Move, MoveId} from "../moves";
import items from "./items.json";
import {applyItemStatBoost, type Gender} from "../pokemon";
import {tryDamage} from "./damaging";
import type {ItemData, ItemId} from "../item";

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

const __merge = createDefu((obj, key, value) => {
  if (Array.isArray(obj[key])) {
    obj[key] = value;
    return true;
  }
});

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] | undefined;
};

export const merge = <T extends object>(a: T, b: DeepPartial<T>): T => __merge(b, a) as any;

export class Generation2 extends Generation1 {
  // prettier-ignore
  static override Rng = class extends super.Rng {
    override maxThrash = 2;

    override tryDefrost(battle: Battle) { return battle.rand255(25) }

    override tryCrit(battle: Battle, user: ActivePokemon, hc: boolean) {
      let stages = hc ? 2 : 0;
      if (user.v.hasFlag(VF.focusEnergy)) {
        stages++;
      }
      stages += user.base.item?.raiseCrit ?? 0;
      if (user.base.itemId === "stick" && user.base.real.speciesId === "farfetchd") {
        stages += 2;
      }
      if (user.base.itemId === "luckypunch" && user.base.real.speciesId === "chansey") {
        stages += 2;
      }
      return battle.rand255Good(floatTo255(critStages[Math.min(stages, 4)] * 100));
    }

    override sleepTurns(battle: Battle) {
      let rng = battle.rng.int(0, 255);
      let sleepTurns = rng & 7;
      while (!sleepTurns || sleepTurns === 7) {
        rng = (rng * 5 + 1) & 255;
        sleepTurns = rng & 7;
      }
      return sleepTurns;
    }

    override disableTurns(battle: Battle) { return battle.rng.int(2, 8) + 1; }

    override thrashDuration(battle: Battle) { return battle.rng.int(2, 3); }
  }

  override id = 2;
  override lastMoveIdx = this.moveList.zapcannon.idx!;
  override lastPokemon = 251;
  override rng = new Generation2.Rng();
  override accStageMultipliers = accStageMultipliers;

  constructor() {
    super();
    this.speciesList = merge(
      this.speciesList,
      speciesPatches as Partial<Record<SpeciesId, Partial<Species>>>,
    );
    this.moveList = merge(this.moveList, movePatches);
    this.typeChart = merge(this.typeChart, {
      ghost: {psychic: 2},
      poison: {bug: 1},
      bug: {poison: 0.5},
      ice: {fire: 0.5},
    });
    this.items = merge(this.items, items as Partial<Record<ItemId, ItemData>>);
    this.move = merge(this.move, {scripts: moveScripts, overrides: moveOverrides});
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
        if (!move.sleepOnly) {
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
  }

  override isValidMove(battle: Battle, user: ActivePokemon, move: MoveId, i: number) {
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
    } else if (
      user.v.hasFlag(VF.torment) &&
      i === user.v.lastMoveIndex &&
      user.v.lastMove !== user.v.thrashing?.move
    ) {
      return false;
    }

    return true;
  }

  override checkAccuracy(move: Move, battle: Battle, user: ActivePokemon, target: ActivePokemon) {
    if (target.v.invuln) {
      const charging = target.v.charging && battle.moveIdOf(target.v.charging.move);
      if (charging && (!move.ignore || !move.ignore.includes(charging))) {
        battle.miss(user, target);
        return false;
      }
    }

    const acc0 = this.getMoveAcc(battle, move);
    if (!acc0) {
      return true;
    }

    let chance = floatTo255(acc0);
    if (move.kind === "damage" && move.flag === "ohko") {
      chance = (user.base.level - target.base.level) * 2 + 76;
    }

    let acc = scaleAccuracy255(chance, user, target);
    if (target.base.itemId === "brightpowder") {
      acc -= 20;
    }

    debugLog(`[${user.base.name}] ${move.name} (Acc ${acc}/255)`);
    if (!battle.rand255Good(acc)) {
      battle.miss(user, target);
      return false;
    }
    return true;
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
    tripleKick,
    weather,
    moveMod,
    doubleDmg,
  }: CalcDamageParams) {
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

    if (import.meta.dev) {
      debugLog(
        `flag: ${dmgFlags({
          crit: isCrit,
          stab: hasStab,
          double: doubleDmg,
          [`item:${itemBonus}`]: (itemBonus || 1) > 1,
          [`weather:${weather}`]: !!weather,
          [`TK:${tripleKick}`]: (tripleKick || 1) > 1,
          [`MM:${moveMod}`]: (moveMod || 1) > 1,
        })}`,
      );
      debugLog("vars:", {dmg, lvl, pow, atk, def, eff, r});
    }
    return idiv(dmg * r, 255) * double;
  }

  override getDamageVariables(
    special: boolean,
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    isCrit: boolean,
  ) {
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
  }

  override handleCrashDamage(
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    dmg: number,
  ) {
    dmg = Math.min(dmg, target.base.hp);
    user.damage(Math.floor(dmg / 8), user, battle, false, "crash", true);
  }

  override canOHKOHit(_: Battle, user: ActivePokemon, target: ActivePokemon) {
    return target.base.level <= user.base.level;
  }

  override getStat(battle: Battle, poke: ActivePokemon, stat: StatStageId, isCrit?: boolean) {
    const def = stat === "def" || stat === "spd";
    const screen = def && !!poke.owner.screens[stat === "def" ? "reflect" : "light_screen"];

    let value = Math.floor(
      poke.base.stats[stat] * poke.base.gen.stageMultipliers[poke.v.stages[stat]],
    );

    if (poke.base.status === "brn" && stat === "atk" && !poke.hasAbility("guts")) {
      value = Math.max(Math.floor(value / 2), 1);
    } else if (poke.base.status === "par" && stat === "spe") {
      value = Math.max(Math.floor(value / 4), 1);
    }

    // crit ignores brn in gen 2
    if (isCrit) {
      value = poke.base.stats[stat];
    }

    value = clamp(value, 1, 999);
    if (!isCrit && screen) {
      value *= 2;
    }

    value = poke.applyAbilityStatBoost(battle, stat, value);
    value = applyItemStatBoost(poke.base, stat, value);

    // Screens & the species boosting items all fail to cap the stat at 999, meaning they will
    // cause it to wrap around if the base stat is >= 512
    value %= 1024;
    return value;
  }

  override getGender(
    _desired: Gender | undefined,
    species: Species,
    atk: number,
  ): Gender | undefined {
    if (species.genderRatio) {
      return atk < 15 - Math.floor(species.genderRatio * 15) ? "F" : "M";
    } else if (species.genderRatio === 0) {
      return "F";
    } else {
      return "N";
    }
  }

  override getShiny(_desired: bool | undefined, dvs: Partial<Stats>) {
    return (
      dvs.def === 10 &&
      dvs.spe === 10 &&
      dvs.spa === 10 &&
      [2, 3, 6, 7, 10, 11, 14, 15].includes(dvs.atk)
    );
  }

  override accumulateBide = () => {};

  override tryDamage = tryDamage;

  override handleRage(battle: Battle, poke: ActivePokemon) {
    if (poke.v.lastMove?.kind === "damage" && poke.v.lastMove.flag === "rage") {
      battle.info(poke, "rage");
      poke.v.rage++;
    }
  }
}
