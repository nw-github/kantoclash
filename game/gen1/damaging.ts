import type {ActivePokemon, Battle} from "../battle";
import {isSpecial, VF} from "../utils";
import type {DamagingMove} from "../moves";
import {getDamage} from "../moves";

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
  _power?: number,
): number {
  const checkThrashing = () => {
    if (user.v.thrashing && user.v.thrashing.turns !== -1 && --user.v.thrashing.turns === 0) {
      user.v.rollout = 0;
      user.v.furyCutter = 0;
      if (!user.owner.screens.safeguard && self.flag === "multi_turn") {
        user.confuse(battle, user.v.thrashing.max ? "cConfusedFatigueMax" : "cConfusedFatigue");
      }
      user.v.thrashing = undefined;
    }
  };

  if (self.flag === "trap") {
    target.v.recharge = undefined;
  }

  // eslint-disable-next-line prefer-const
  let {dmg, isCrit, eff, endured, type} = getDamage(self, battle, user, target, {});
  if (dmg === 0 || !battle.checkAccuracy(self, user, target, !isSpecial(type))) {
    battle.gen1LastDamage = 0;
    if (dmg === 0) {
      if (eff === 0) {
        battle.info(target, "immune");
        if (self.flag === "trap") {
          trapTarget(self, battle, user, target);
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

  target.v.lastHitBy = {move: self, poke: user, special: isSpecial(self.type)};

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
      const count = self.flag === "double" ? 2 : battle.gen.rng.multiHitCount(battle);
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

  if (dead || brokeSub) {
    return dealt;
  }

  if (self.flag === "recharge") {
    user.v.recharge = self;
  } else if (self.flag === "trap") {
    trapTarget(self, battle, user, target);
  }

  if (!self.effect) {
    return dealt;
  }

  // eslint-disable-next-line prefer-const
  let [chance, effect] = self.effect;
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
    target.modStages(effect, battle, user, true);
  } else if (effect === "flinch") {
    target.v.flinch = true;
  } else if (effect !== "knockoff" && effect !== "thief") {
    if (target.base.status || target.v.types.includes(self.type)) {
      return dealt;
    }

    target.status(effect, battle, user, {});
  }
  return dealt;
}

function trapTarget(
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
) {
  target.v.trapped = {move: self, turns: -1, user};
  user.v.trapping = {move: self, turns: battle.gen.rng.multiHitCount(battle) - 1};
}
