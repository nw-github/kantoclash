import type {ActivePokemon, Battle} from "../battle";
import {isSpecial, randChoiceWeighted, VolatileFlag} from "../utils";
import type {Random} from "random";
import type {CalcDamageParams} from "../gen";
import type {DamagingMove} from "../moves";

export function use(
  this: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  moveIndex?: number,
) {
  if (user.v.trapping && target.v.trapped) {
    const dead = target.damage(target.lastDamage, user, battle, false, "trap").dead;
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
  target.lastDamage = 0;
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
  if (this.flag === "multi_turn" && !user.v.thrashing) {
    user.v.thrashing = {move: this, turns: battle.rng.int(2, 3)};
  } else if (user.v.thrashing && user.v.thrashing.turns !== -1) {
    if (--user.v.thrashing.turns === 0) {
      user.v.thrashing = undefined;
      if (!user.owner.screens.safeguard) {
        user.confuse(battle, true);
      }
    }
  }

  if (this.flag === "trap") {
    target.v.recharge = undefined;
  }

  if (target.v.hasFlag(VolatileFlag.protect)) {
    battle.info(target, "protect");
    return false;
  }

  // eslint-disable-next-line prefer-const
  let {dmg, isCrit, eff, endured} = getDamage(this, battle, user, target);
  if (dmg === 0 || !battle.checkAccuracy(this, user, target)) {
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
        return;
      }
    }

    if (this.flag === "crash") {
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    } else if (this.flag === "explosion") {
      // according to showdown, explosion also boosts rage even on miss/failure
      target.handleRage(battle);
      user.damage(user.base.hp, user, battle, false, "explosion", true);
    }
    return;
  }

  if (this.flag === "rage") {
    user.v.thrashing = {move: this, turns: -1};
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
      target.lastDamage = dmg;
      user.recover(dmg, target, battle, "drain");
    } else if (this.flag === "explosion") {
      dead = user.damage(user.base.hp, user, battle, false, "explosion", true).dead || dead;
    } else if (this.flag === "double" || this.flag === "multi") {
      const count = this.flag === "double" ? 2 : multiHitCount(battle.rng);
      for (let hits = 1; !dead && !brokeSub && !endured && hits < count; hits++) {
        if (dmg > 0 && dmg > target.base.hp && target.v.hasFlag(VolatileFlag.endure)) {
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

  if (dead && target.v.hasFlag(VolatileFlag.destinyBond)) {
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
    const [chance, effect] = this.effect;
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
      const poke = this.effect_self ? user : target;
      poke.modStages(effect, battle);
    } else if (effect === "flinch") {
      target.v.flinch = true;
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
  } else if (this.flag === "tri_attack") {
    const choice = battle.rng.choice(["brn", "par", "frz"] as const)!;
    if (target.base.status === "frz" && choice === "brn") {
      target.unstatus(battle, "thaw");
    } else if (!target.base.status && !target.owner.screens.safeguard && battle.rand100(20)) {
      // In Gen 2, tri attack can burn fire types and freeze ice types
      target.status(choice, battle);
    }
  }
}

export function getDamage(
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
) {
  const type = self.getType ? self.getType(user.base) : self.type;
  let pow = self.getPower ? self.getPower(user.base) : self.power;
  let eff = battle.getEffectiveness(type, target);
  const realEff = eff;
  let dmg = 0;
  let isCrit = battle.gen.tryCrit(battle, user, self.flag === "high_crit");
  if (self.flag === "dream_eater" && target.base.status !== "slp") {
    eff = 1;
    isCrit = false;
  } else if (typeof self.getDamage === "number") {
    dmg = self.getDamage;
    eff = 1;
    isCrit = false;
  } else if (self.getDamage) {
    isCrit = false;
    const result = self.getDamage(battle, user, target, eff);
    if (typeof result === "number") {
      dmg = result;
      eff = 1;
    } else {
      eff = 1;
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

    const explosion = self.flag === "explosion" ? 2 : 1;
    const [atk, def] = battle.gen.getDamageVariables(isSpecial(type), user, target, isCrit);
    dmg = battle.gen.calcDamage({
      lvl: user.base.level,
      pow,
      atk,
      def: Math.max(Math.floor(def / explosion), 1),
      isCrit,
      isStab: user.v.types.includes(type),
      rand,
      eff,
      weather,
      doubleDmg,
    });

    if (self.flag === "false_swipe" && dmg >= target.base.hp && !target.v.substitute) {
      dmg = target.base.hp - 1;
    }
  }

  // TODO: What happens when a pokemon that is 0 HP as a result of the perish song+spikes bug uses
  // endure?
  const endured = dmg > 0 && dmg > target.base.hp && target.v.hasFlag(VolatileFlag.endure);
  if (endured) {
    dmg = Math.max(target.base.hp - 1, 0);
  }

  return {dmg, isCrit, eff, endured, realEff};
}

function trapTarget(self: DamagingMove, rng: Random, user: ActivePokemon, target: ActivePokemon) {
  target.v.trapped = {move: self, turns: -1, user};
  user.v.trapping = {move: self, turns: multiHitCount(rng) - 1};
}

export function multiHitCount(rng: Random) {
  return randChoiceWeighted(rng, [2, 3, 4, 5], [37.5, 37.5, 12.5, 12.5]);
}
