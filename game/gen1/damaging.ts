import type {ActivePokemon, Battle} from "../battle";
import {idiv, isSpecial, randChoiceWeighted, VF} from "../utils";
import type {Random} from "random";
import type {CalcDamageParams} from "../gen";
import type {DamagingMove} from "../moves";
import type {Pokemon} from "../pokemon";

export function use(
  this: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  moveIndex?: number,
) {
  if (user.v.trapping && target.v.trapped) {
    const dead = target.damage(battle.gen1LastDamage, user, battle, false, "trap").dead;
    if (dead || --user.v.trapping.turns === 0) {
      user.v.trapping = undefined;
    }
    return;
  }

  if (this.charge && user.v.charging !== this) {
    battle.event({type: "charge", src: user.owner.id, move: battle.moveIdOf(this)!});
    if (Array.isArray(this.charge)) {
      user.modStages(this.charge, battle);
    }

    if (this.charge !== "sun" || battle.weather?.kind !== "sun") {
      user.v.charging = this;
      user.v.invuln = this.charge === "invuln" || user.v.invuln;
      return;
    }
  }

  user.v.charging = undefined;
  user.v.trapping = undefined;
  if (this.charge === "invuln") {
    user.v.invuln = false;
  }
  return battle.defaultUseMove(this, user, target, moveIndex);
}

export function exec(
  this: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
) {
  const checkThrashing = () => {
    if (user.v.thrashing && user.v.thrashing.turns !== -1 && --user.v.thrashing.turns === 0) {
      user.v.rollout = 0;
      user.v.furyCutter = 0;
      if (!user.owner.screens.safeguard && this.flag !== "rollout") {
        user.confuse(battle, user.v.thrashing.max ? "cConfusedFatigueMax" : "cConfusedFatigue");
      }
      user.v.thrashing = undefined;
    }
  };

  if (this.flag === "multi_turn" && !user.v.thrashing) {
    user.v.thrashing = {move: this, turns: battle.rng.int(2, 3), max: false};
    user.v.thrashing.max = user.v.thrashing.turns == 3;
  } else if (this.flag === "bide") {
    if (!user.v.bide) {
      user.v.bide = {move: this, turns: battle.rng.int(2, 3) + 1, dmg: 0};
      return;
    }

    user.v.bide.dmg += battle.gen1LastDamage;
    user.v.bide.dmg &= 0xffff;
    if (--user.v.bide.turns !== 0) {
      // silent on cart
      battle.info(user, "bide_store");
      return;
    }

    battle.info(user, "bide");
  }

  if (this.flag === "trap") {
    target.v.recharge = undefined;
  }

  if (target.v.hasFlag(VF.protect)) {
    battle.info(target, "protect");
    checkThrashing();
    return false;
  }

  // eslint-disable-next-line prefer-const
  let {dmg, isCrit, eff, endured} = getDamage(this, battle, user, target);
  if (dmg < 0) {
    if (target.base.hp === target.base.stats.hp) {
      return battle.info(target, "fail_present");
    }

    return target.recover(Math.max(idiv(target.base.stats.hp, 4), 1), user, battle, "present");
  }

  if (dmg === 0 || !battle.checkAccuracy(this, user, target)) {
    battle.gen1LastDamage = 0;
    if (dmg === 0) {
      if (eff === 0) {
        battle.info(target, "immune");
        if (this.flag === "trap") {
          trapTarget(this, battle.rng, user, target);
        }
      } else {
        battle.info(user, "miss");
      }

      if (this.flag === "crash" && eff === 0) {
        return checkThrashing();
      }
    }

    if (this.flag === "crash") {
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    } else if (this.flag === "explosion") {
      // according to showdown, explosion also boosts rage even on miss/failure
      target.handleRage(battle);
      user.damage(user.base.hp, user, battle, false, "explosion", true);
    }
    return checkThrashing();
  }

  target.v.lastHitBy = this;

  checkThrashing();
  if (this.flag === "rage") {
    user.v.thrashing = {move: this, max: false, turns: -1};
  }

  const hadSub = target.v.substitute !== 0;
  // eslint-disable-next-line prefer-const
  let {dealt, brokeSub, dead, event} = target.damage(
    dmg,
    user,
    battle,
    isCrit,
    this.flag === "ohko" ? "ohko" : "attacked",
    false,
    eff,
  );

  if (this.flag === "multi" || this.flag === "double") {
    event.hitCount = 1;
  }

  if (!brokeSub) {
    if (this.recoil) {
      dead =
        user.damage(
          Math.max(Math.floor(dealt / this.recoil), 1),
          user,
          battle,
          false,
          "recoil",
          true,
        ).dead || dead;
    }

    if (this.flag === "drain" || this.flag === "dream_eater") {
      // https://www.smogon.com/forums/threads/past-gens-research-thread.3506992/#post-5878612
      //  - DRAIN HP SIDE EFFECT
      const dmg = Math.max(Math.floor(dealt / 2), 1);
      battle.gen1LastDamage = dmg;
      user.recover(dmg, target, battle, "drain");
    } else if (this.flag === "explosion") {
      dead = user.damage(user.base.hp, user, battle, false, "explosion", true).dead || dead;
    } else if (this.flag === "double" || this.flag === "multi") {
      const count = this.flag === "double" ? 2 : multiHitCount(battle.rng);
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
    } else if (this.flag === "payday") {
      battle.info(user, "payday");
    }
  }

  if (endured) {
    battle.info(target, "endure_hit");
  }

  if (dead && target.v.hasFlag(VF.destinyBond)) {
    user.damage(user.base.hp, target, battle, false, "destiny_bond", true);
    // user should die first
    battle.checkFaint(target, user);
  }

  if (dead || brokeSub) {
    return;
  }

  if (this.flag === "recharge") {
    user.v.recharge = this;
  } else if (this.flag === "trap") {
    trapTarget(this, battle.rng, user, target);
  }

  if (this.effect) {
    // eslint-disable-next-line prefer-const
    let [chance, effect, effectSelf] = this.effect;
    if (effect === "tri_attack") {
      effect = battle.rng.choice(["brn", "par", "frz"] as const)!;
    }

    if (effect === "brn" && target.base.status === "frz") {
      target.unstatus(battle, "thaw");
      // TODO: can you thaw and then burn?
      return;
    }

    if (!battle.rand100(chance)) {
      return;
    }

    if (effect === "confusion") {
      if (target.v.confusion === 0 && !user.owner.screens.safeguard) {
        target.confuse(battle);
      }
      return;
    } else if (hadSub) {
      return;
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
        return;
      }

      battle.event({
        type: "thief",
        src: user.owner.id,
        target: target.owner.id,
        item: target.base.item,
      });
      user.base.item = target.base.item;
      target.base.item = undefined;
    } else {
      if (
        target.owner.screens.safeguard ||
        target.base.status ||
        target.v.types.includes(this.type)
      ) {
        return;
      }

      target.status(effect, battle);
    }
  }
}

export function getDamage(
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  tripleKick = 1,
  band = false,
  beatUp?: Pokemon,
) {
  let type = self.getType ? self.getType(user.base) : self.type;
  if (beatUp) {
    type = "???";
  }

  let pow = self.getPower ? self.getPower(user.base) : self.power;
  let eff = battle.getEffectiveness(type, target);
  const realEff = eff;
  let dmg = 0;
  let isCrit = battle.gen.tryCrit(battle, user, self.flag === "high_crit");
  let fail = false;
  if (self.flag === "dream_eater" && target.base.status !== "slp") {
    eff = 1;
    isCrit = false;
    fail = true;
  } else if (typeof self.getDamage === "number") {
    dmg = self.getDamage;
    eff = 1;
    isCrit = false;
  } else if (self.getDamage || self.flag === "ohko") {
    isCrit = false;
    const result = self.getDamage
      ? self.getDamage(battle, user, target)
      : battle.gen.getOHKODamage(user, target);
    if (typeof result === "number") {
      dmg = result;
      eff = 1;
    } else {
      if (self.flag !== "ohko") {
        eff = 1;
      }
      fail = true;
    }
  } else {
    let rand: number | false | Random = battle.rng;
    if (self.flag === "flail") {
      isCrit = false;
      rand = false;
    } else if (self.flag === "magnitude") {
      const magnitude = battle.rng.int(4, 10);
      pow = [10, 30, 50, 70, 90, 110, 150][magnitude - 4];
      battle.event({type: "magnitude", magnitude});
    } else if (self.flag === "present") {
      const result = randChoiceWeighted(battle.rng, [40, 80, 120, -4], [40, 30, 10, 20]);
      if (result < 0) {
        return {dmg: -1, isCrit: false, eff: 1, endured: false, realEff: 1};
      }
      pow = result;
    }

    if (user.base.item && battle.gen.itemTypeBoost[user.base.item] === type) {
      pow += idiv(pow, 10);
    }

    let weather: CalcDamageParams["weather"];
    if (battle.weather?.kind === "rain") {
      weather =
        type === "fire" || self.charge === "sun"
          ? "penalty"
          : type === "water"
          ? "bonus"
          : undefined;
    } else if (battle.weather?.kind === "sun") {
      weather = type === "fire" ? "bonus" : type === "water" ? "penalty" : undefined;
    }

    let doubleDmg = user.v.inPursuit;
    if (target.v.charging && self.ignore && self.punish) {
      doubleDmg = doubleDmg || self.ignore.includes(battle.moveIdOf(target.v.charging));
    }
    if (target.v.usedMinimize && self.flag === "minimize") {
      doubleDmg = true;
    }

    const explosion = self.flag === "explosion" ? 2 : 1;
    const [atk, def] = beatUp
      ? ([beatUp.stats.atk, target.base.stats.def] as const)
      : battle.gen.getDamageVariables(isSpecial(type), user, target, isCrit);
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
      lvl: beatUp ? beatUp.level : user.base.level,
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
      tripleKick,
    });

    if (self.flag === "false_swipe" && dmg >= target.base.hp && !target.v.substitute) {
      dmg = target.base.hp - 1;
    }
  }

  // TODO: What happens when a pokemon that is 0 HP as a result of the perish song+spikes bug uses
  // endure?
  const deadly = dmg > 0 && dmg > target.base.hp;
  const endured = deadly && target.v.hasFlag(VF.endure);
  band =
    band ||
    (deadly && !endured && target.base.item === "focusband" && battle.gen.rng.tryFocusBand(battle));

  if (endured || band) {
    dmg = Math.max(target.base.hp - 1, 0);
  }

  return {dmg, isCrit, eff, endured, band, realEff, fail};
}

function trapTarget(self: DamagingMove, rng: Random, user: ActivePokemon, target: ActivePokemon) {
  target.v.trapped = {move: self, turns: -1, user};
  user.v.trapping = {move: self, turns: multiHitCount(rng) - 1};
}

export function multiHitCount(rng: Random) {
  return randChoiceWeighted(rng, [2, 3, 4, 5], [37.5, 37.5, 12.5, 12.5]);
}
