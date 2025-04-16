import type {Random} from "random";
import type {CalcDamageParams} from "../gen";
import {abilityList} from "../species";
import {VF} from "../utils";
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
  if (self.sound && target.v.ability === "soundproof") {
    eff = 0;
    abilityImmunity = true;
  } else if (
    (type !== "???" && eff <= 1 && target.v.ability === "wonderguard") ||
    (type === "ground" && eff !== 0 && target.v.ability === "levitate") ||
    (type === "electric" && target.v.ability === "voltabsorb") ||
    (type === "water" && target.v.ability === "waterabsorb") ||
    (type === "fire" && target.v.ability === "flashfire" && target.base.status !== "frz")
  ) {
    eff = 0;
    abilityImmunity = true;
  }

  if (self.flag === "dream_eater" && target.base.status !== "slp") {
    fail = true;
  } else if (self.flag === "spitup" && !user.v.stockpile) {
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

  if (target.owner.screens.luckychant) {
    isCrit = false;
  }

  if (self.getDamage) {
    dmg =
      typeof self.getDamage === "number" ? self.getDamage : self.getDamage(battle, user, target);
    isCrit = false;
  } else {
    let pow = extras.power ?? (self.getPower ? self.getPower(user.base, target.base) : self.power);
    let rand: false | Random = battle.rng;
    if (self.flag === "norand" || self.flag === "spitup") {
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
    if (
      type === "electric" &&
      battle.allActive.some(p => !p.v.fainted && p.v.hasFlag(VF.mudSport))
    ) {
      pow -= Math.floor(pow / 2);
    }
    if (type === "fire" && battle.allActive.some(p => !p.v.fainted && p.v.hasFlag(VF.waterSport))) {
      pow -= Math.floor(pow / 2);
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
    // Charge checks the original type?
    if (self.type === "electric" && user.v.hasFlag(VF.charge)) {
      doubleDmg = true;
    }
    if (self.flag === "smellingsalt" && !target.v.substitute && target.base.status === "par") {
      doubleDmg = true;
    }
    if (battle.moveIdOf(self) === "weatherball" && battle.getWeather()) {
      doubleDmg = true;
    }
    if (
      self.flag === "revenge" &&
      user.v.lastHitBy?.poke === target &&
      target.choice?.move.kind === "damage" &&
      target.choice?.executed
    ) {
      doubleDmg = true;
    }

    const explosion = self.flag === "explosion" ? 2 : 1;
    const spc = battle.gen.isSpecial(self, type);
    // eslint-disable-next-line prefer-const
    let [atk, def] = extras.beatUp
      ? ([extras.beatUp.stats.atk, target.base.stats.def] as const)
      : battle.gen.getDamageVariables(spc, battle, user, target, isCrit);
    if ((type === "ice" || type === "fire") && target.v.ability === "thickfat") {
      atk -= Math.floor(atk / 2);
    }

    let moveMod = 1;
    if (self.flag === "rollout") {
      moveMod = 2 ** (5 - (user.v.thrashing?.turns ?? 5) + +user.v.usedDefenseCurl);
    } else if (self.flag === "rage") {
      moveMod = user.v.rage;
    } else if (self.flag === "fury_cutter") {
      moveMod = 2 ** Math.min(user.v.furyCutter, 4);
    }

    let stockpile = 1;
    if (self.flag === "spitup") {
      stockpile = user.v.stockpile;
      battle.sv([user.setVolatile("stockpile", 0)]);
    }

    const itemBonus = user.base.item && battle.gen.itemTypeBoost[user.base.item];
    if (import.meta.dev) {
      console.log(`\n\x1b[0;32m${user.base.name}\x1b[0m => \x1b[0;31m${target.base.name}\x1b[0m`);
    }
    dmg = battle.gen.calcDamage({
      lvl: extras.beatUp ? extras.beatUp.level : user.base.level,
      pow,
      atk,
      def: Math.max(Math.floor(def / explosion), 1),
      isCrit,
      hasStab: user.v.types.includes(type),
      rand,
      eff,
      weather,
      moveMod,
      doubleDmg,
      tripleKick: extras.tripleKick,
      itemBonus: itemBonus?.type === type ? 1 + itemBonus.percent / 100 : 1,
      helpingHand: user.v.hasFlag(VF.helpingHand),
      spread: extras.spread,
      screen: !!target.owner.screens[spc ? "light_screen" : "reflect"],
      flashFire: user.v.hasFlag(VF.flashFire) && type === "fire",
      stockpile,
    });

    if (self.flag === "false_swipe" && dmg >= target.base.hp && !target.v.substitute) {
      dmg = target.base.hp - 1;
    }
  }

  const deadly = dmg > 0 && dmg >= target.base.hp;
  const endured = deadly && target.v.hasFlag(VF.endure);
  const band =
    extras.band ||
    (deadly && !endured && target.base.item === "focusband" && battle.gen.rng.tryFocusBand(battle));

  if (endured || band) {
    dmg = Math.max(target.base.hp - 1, 0);
  }
  return {dmg, isCrit, eff, endured, band, fail, type};
}
