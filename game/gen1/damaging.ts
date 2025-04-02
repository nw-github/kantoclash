import type {ActivePokemon, Battle} from "../battle";
import {idiv, isSpecial, randChoiceWeighted, VF} from "../utils";
import type {Random} from "random";
import type {CalcDamageParams} from "../gen";
import type {DamagingMove} from "../moves";
import type {Pokemon} from "../pokemon";
import {abilityList} from "../species";

export function accumulateBide(
  battle: Battle,
  _user: ActivePokemon,
  bide: Required<ActivePokemon["v"]>["bide"],
) {
  bide.dmg += battle.gen1LastDamage;
  bide.dmg &= 0xffff;
}

export function tryDamage(
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  _spread: bool,
): number {
  const checkThrashing = () => {
    if (user.v.thrashing && user.v.thrashing.turns !== -1 && --user.v.thrashing.turns === 0) {
      user.v.rollout = 0;
      user.v.furyCutter = 0;
      if (!user.owner.screens.safeguard && self.flag !== "rollout") {
        user.confuse(battle, user.v.thrashing.max ? "cConfusedFatigueMax" : "cConfusedFatigue");
      }
      user.v.thrashing = undefined;
    }
  };

  if (self.flag === "trap") {
    target.v.recharge = undefined;
  }

  if (target.v.hasFlag(VF.protect)) {
    battle.info(target, "protect");
    checkThrashing();
    return 0;
  }

  // eslint-disable-next-line prefer-const
  let {dmg, isCrit, eff, endured, type} = getDamage(self, battle, user, target, {});
  if (dmg < 0) {
    if (target.base.hp === target.base.stats.hp) {
      battle.info(target, "fail_present");
      return 0;
    }

    target.recover(Math.max(idiv(target.base.stats.hp, 4), 1), user, battle, "present");
    return 0;
  }

  if (dmg === 0 || !battle.checkAccuracy(self, user, target, !isSpecial(type))) {
    battle.gen1LastDamage = 0;
    if (dmg === 0) {
      if (eff === 0) {
        battle.info(target, "immune");
        if (self.flag === "trap") {
          trapTarget(self, battle.rng, user, target);
        }
      } else {
        battle.miss(user, target);
      }

      if (self.flag === "crash" && eff === 0) {
        checkThrashing();
        return 0;
      }
    }

    if (self.flag === "crash") {
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    } else if (self.flag === "explosion") {
      // according to showdown, explosion also boosts rage even on miss/failure
      target.handleRage(battle);
      user.damage(user.base.hp, user, battle, false, "explosion", true);
    }
    checkThrashing();
    return 0;
  }

  target.v.lastHitBy = {move: self, user};

  checkThrashing();
  if (self.flag === "rage") {
    user.v.thrashing = {move: self, max: false, turns: -1};
  }

  const hadSub = target.v.substitute !== 0;
  // eslint-disable-next-line prefer-const
  let {dealt, brokeSub, dead, event} = target.damage(
    dmg,
    user,
    battle,
    isCrit,
    self.flag === "ohko" ? "ohko" : "attacked",
    false,
    eff,
  );

  if (self.flag === "multi" || self.flag === "double") {
    event.hitCount = 1;
  }

  if (!brokeSub) {
    if (self.recoil) {
      dead =
        user.damage(
          Math.max(Math.floor(dealt / self.recoil), 1),
          user,
          battle,
          false,
          "recoil",
          true,
        ).dead || dead;
    }

    if (self.flag === "drain" || self.flag === "dream_eater") {
      // https://www.smogon.com/forums/threads/past-gens-research-thread.3506992/#post-5878612
      //  - DRAIN HP SIDE EFFECT
      const dmg = Math.max(Math.floor(dealt / 2), 1);
      battle.gen1LastDamage = dmg;
      user.recover(dmg, target, battle, "drain");
    } else if (self.flag === "explosion") {
      dead = user.damage(user.base.hp, user, battle, false, "explosion", true).dead || dead;
    } else if (self.flag === "double" || self.flag === "multi") {
      const count = self.flag === "double" ? 2 : multiHitCount(battle.rng);
      for (let hits = 1; !dead && !brokeSub && !endured && hits < count; hits++) {
        if (dmg > 0 && dmg > target.base.hp && target.v.hasFlag(VF.endure)) {
          dmg = Math.max(target.base.hp - 1, 0);
          endured = true;
        }

        event.hitCount = 0;
        ({dead, brokeSub, event} = target.damage(
          dmg,
          user,
          battle,
          isCrit,
          "attacked",
          false,
          eff,
        ));
        event.hitCount = hits + 1;
      }
    } else if (self.flag === "payday") {
      battle.info(user, "payday");
    }
  }

  if (endured) {
    battle.info(target, "endure_hit");
  }

  if (dead && target.v.hasFlag(VF.destinyBond)) {
    user.damage(user.base.hp, target, battle, false, "destiny_bond", true);
    // user should die first
    battle.checkFaint(target);
  }

  if (dead || brokeSub) {
    return dealt;
  }

  if (self.flag === "recharge") {
    user.v.recharge = self;
  } else if (self.flag === "trap") {
    trapTarget(self, battle.rng, user, target);
  }

  if (self.effect) {
    // eslint-disable-next-line prefer-const
    let [chance, effect, effectSelf] = self.effect;
    if (effect === "tri_attack") {
      effect = battle.rng.choice(["brn", "par", "frz"] as const)!;
    }

    if (effect === "brn" && target.base.status === "frz") {
      target.unstatus(battle, "thaw");
      // TODO: can you thaw and then burn?
      return dealt;
    }

    if (!battle.rand100(chance)) {
      return dealt;
    }

    if (effect === "confusion") {
      if (target.v.confusion === 0 && !user.owner.screens.safeguard) {
        target.confuse(battle);
      }
      return dealt;
    } else if (hadSub) {
      return dealt;
    } else if (Array.isArray(effect)) {
      // BUG GEN2:
      // https://pret.github.io/pokecrystal/bugs_and_glitches.html#moves-that-do-damage-and-increase-your-stats-do-not-increase-stats-after-a-ko
      if (!(effectSelf && dead)) {
        (effectSelf ? user : target).modStages(effect, battle);
      }
    } else if (effect === "flinch") {
      target.v.flinch = true;
    } else if (effect === "thief") {
      if (user.base.item || !target.base.item || target.base.item.includes("mail")) {
        return dealt;
      }

      battle.event({type: "thief", src: user.id, target: target.id, item: target.base.item});
      user.base.item = target.base.item;
      target.base.item = undefined;
    } else {
      if (
        target.owner.screens.safeguard ||
        target.base.status ||
        target.v.types.includes(self.type)
      ) {
        return dealt;
      }

      target.status(effect, battle);
    }
  }
  return dealt;
}

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
    if (self.flag === "flail") {
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
    if (battle.hasWeather("rain")) {
      weather =
        type === "fire" || self.charge === "sun"
          ? "penalty"
          : type === "water"
          ? "bonus"
          : undefined;
    } else if (battle.hasWeather("sun")) {
      weather = type === "fire" ? "bonus" : type === "water" ? "penalty" : undefined;
    }

    let doubleDmg = user.v.inPursuit;
    if (target.v.charging && self.ignore && self.punish) {
      doubleDmg = doubleDmg || self.ignore.includes(battle.moveIdOf(target.v.charging.move));
    }
    if (target.v.usedMinimize && self.flag === "minimize") {
      doubleDmg = true;
    }

    const explosion = self.flag === "explosion" ? 2 : 1;
    const [atk, def] = extras.beatUp
      ? ([extras.beatUp.stats.atk, target.base.stats.def] as const)
      : battle.gen.getDamageVariables(isSpecial(type), battle, user, target, isCrit);
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

function trapTarget(self: DamagingMove, rng: Random, user: ActivePokemon, target: ActivePokemon) {
  target.v.trapped = {move: self, turns: -1, user};
  user.v.trapping = {move: self, turns: multiHitCount(rng) - 1};
}

export function multiHitCount(rng: Random) {
  return randChoiceWeighted(rng, [2, 3, 4, 5], [37.5, 37.5, 12.5, 12.5]);
}
