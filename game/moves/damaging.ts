import type {Random} from "random";
import type {CalcDamageParams} from "../gen";
import {abilityList} from "../species";
import {isSpecial, VF} from "../utils";
import type {DamagingMove} from ".";
import type {ActivePokemon, Battle} from "../battle";
import type {Pokemon} from "../pokemon";

export function checkUsefulness(
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
) {
  let type = self.getType ? self.getType(user.base, battle.getWeather()) : self.type;
  let fail = false;
  if (self.flag === "beatup") {
    type = "???";
  }

  let eff = battle.getEffectiveness(type, target);
  let abilityImmunity = false;
  if (type === "ground" && eff !== 0 && target.v.ability === "levitate") {
    eff = 0;
    abilityImmunity = true;
  }

  if (eff <= 1 && type !== "???" && target.v.ability === "wonderguard") {
    eff = 0;
    abilityImmunity = true;
  }

  if (self.flag === "dream_eater" && target.base.status !== "slp") {
    eff = 1;
    fail = true;
  } else if (self.flag === "ohko" && !battle.gen.canOHKOHit(battle, user, target)) {
    fail = true;
  } else if (typeof self.getDamage === "number") {
    if (battle.gen.id === 1 || eff !== 0) {
      eff = 1;
    }
  } else if (self.getDamage) {
    if ((battle.gen.id === 1 && self.flag !== "ohko") || eff !== 0) {
      eff = 1;
    }

    const result = self.getDamage(battle, user, target);
    if (result === 0) {
      fail = true;
    }
  }

  return {type, eff, fail, abilityImmunity};
}

type DamageExtras = {
  tripleKick?: number;
  band?: bool;
  beatUp?: Pokemon;
  power?: number;
  spread?: bool;
};

export function getDamage(
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  extras: DamageExtras,
) {
  const {type, eff, fail} = checkUsefulness(self, battle, user, target);
  let dmg = 0;
  let isCrit = battle.gen.rng.tryCrit(battle, user, self.flag === "high_crit");
  if (target.v.ability && abilityList[target.v.ability].preventsCrit) {
    isCrit = false;
  }

  if (self.getDamage) {
    dmg =
      typeof self.getDamage === "number" ? self.getDamage : self.getDamage(battle, user, target);
    isCrit = false;
  } else {
    let pow = extras.power ?? (self.getPower ? self.getPower(user.base) : self.power);
    let rand: number | false | Random = battle.rng;
    if (self.flag === "norand") {
      isCrit = false;
      rand = false;
    }

    if (
      user.base.belowHp(3) &&
      user.v.ability &&
      abilityList[user.v.ability].pinchBoostType === type
    ) {
      pow += Math.floor(pow / 2);
    }

    let weather: CalcDamageParams["weather"];
    const w = battle.getWeather();
    if (w === "rain") {
      weather =
        type === "fire" || self.charge === "sun"
          ? "penalty"
          : type === "water"
          ? "bonus"
          : undefined;
    } else if (w === "sun") {
      weather = type === "fire" ? "bonus" : type === "water" ? "penalty" : undefined;
    } else if ((w === "hail" || w === "sand") && battle.gen.id >= 3) {
      weather = self.charge === "sun" ? "penalty" : undefined;
    }

    let doubleDmg = user.v.inPursuit;
    if (target.v.charging && self.ignore && self.punish) {
      doubleDmg = doubleDmg || self.ignore.includes(battle.moveIdOf(target.v.charging.move));
    }
    if (target.v.usedMinimize && self.flag === "minimize") {
      doubleDmg = true;
    }
    if (["brn", "par", "psn", "tox"].includes(user.base.status) && self.flag === "facade") {
      doubleDmg = true;
    }

    const explosion = self.flag === "explosion" ? 2 : 1;
    // eslint-disable-next-line prefer-const
    let [atk, def] = extras.beatUp
      ? ([extras.beatUp.stats.atk, target.base.stats.def] as const)
      : battle.gen.getDamageVariables(isSpecial(type), battle, user, target, isCrit);
    if ((type === "ice" || type === "fire") && target.v.ability === "thickfat") {
      atk -= Math.floor(atk / 2);
    }

    let moveMod = 1;
    if (self.flag === "rollout") {
      moveMod = 2 ** (user.v.rollout + +user.v.usedDefenseCurl);
      user.v.rollout++;
    } else if (self.flag === "rage") {
      moveMod = user.v.rage;
    } else if (self.flag === "fury_cutter") {
      moveMod = 2 ** Math.min(user.v.furyCutter, 4);
    }

    dmg = battle.gen.calcDamage({
      lvl: extras.beatUp ? extras.beatUp.level : user.base.level,
      pow,
      atk,
      def: Math.max(Math.floor(def / explosion), 1),
      isCrit,
      isStab: user.v.types.includes(type),
      rand,
      eff,
      weather,
      moveMod,
      doubleDmg,
      tripleKick: extras.tripleKick ?? 1,
      itemBonus: user.base.item && battle.gen.itemTypeBoost[user.base.item]?.type === type,
    });

    if (self.flag === "false_swipe" && dmg >= target.base.hp && !target.v.substitute) {
      dmg = target.base.hp - 1;
    }
  }

  const deadly = dmg > 0 && dmg > target.base.hp;
  const endured = deadly && target.v.hasFlag(VF.endure);
  const band =
    extras.band ||
    (deadly && !endured && target.base.item === "focusband" && battle.gen.rng.tryFocusBand(battle));

  if (endured || band) {
    dmg = Math.max(target.base.hp - 1, 0);
  }
  return {dmg, isCrit, eff, endured, band, fail, type};
}
