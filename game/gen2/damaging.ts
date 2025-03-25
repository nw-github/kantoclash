import type {ActivePokemon, Battle} from "../battle";
import {getDamage, multiHitCount, type DamagingMove} from "../moves";
import {idiv, VolatileFlag} from "../utils";

export function exec(
  this: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
) {
  if (this.flag === "multi_turn" && !user.v.thrashing) {
    user.v.thrashing = {move: this, turns: battle.rng.int(2, 3)};
  } else if (this.flag === "rollout" && !user.v.thrashing) {
    user.v.thrashing = {move: this, turns: 5};
    user.v.rollout = 0;
  } else if (this.flag === "fury_cutter") {
    user.v.furyCutter++;
  }

  if (this.flag === "drain" && target.v.substitute) {
    return battle.info(user, "miss");
  }

  const protect = target.v.hasFlag(VolatileFlag.protect);
  // eslint-disable-next-line prefer-const
  let {dmg, isCrit, eff, realEff, endured, fail, band} = getDamage(this, battle, user, target);
  if (user.v.thrashing && --user.v.thrashing.turns === 0) {
    user.v.thrashing = undefined;
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    if (!user.owner.screens.safeguard && this.flag !== "rollout") {
      user.confuse(battle, true);
    }
  }

  if (dmg < 0) {
    if (target.base.hp === target.base.stats.hp) {
      return battle.info(target, "fail_present");
    }

    target.recover(Math.max(idiv(target.base.stats.hp, 4), 1), user, battle, "present");
    return;
  }

  if (eff === 0 || realEff === 0 || (this.flag === "ohko" && user.base.level < target.base.level)) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    return battle.info(target, "immune");
  } else if (fail) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    return battle.info(user, "fail_generic");
  } else if (protect || !battle.checkAccuracy(this, user, target)) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    if (protect) {
      return battle.info(target, "protect");
    }

    if (this.flag === "crash") {
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    } else if (this.flag === "explosion") {
      user.damage(user.base.hp, user, battle, false, "explosion", true);
    } else if (this.flag === "ohko" && this !== battle.gen.moveList.guillotine) {
      // In Gen 2, Horn Drill and Fissure can be countered for max damage on miss
      target.v.retaliateDamage = 65535;
    }
    return;
  }

  let hadSub = target.v.substitute !== 0;
  // eslint-disable-next-line prefer-const
  let {dealt, dead, event} = target.damage(
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

  if (this.recoil) {
    user.damage(Math.max(Math.floor(dealt / this.recoil), 1), user, battle, false, "recoil", true);
  }

  if (this.flag === "drain" || this.flag === "dream_eater") {
    user.recover(Math.max(Math.floor(dealt / 2), 1), target, battle, "drain");
  } else if (this.flag === "explosion") {
    dead = user.damage(user.base.hp, user, battle, false, "explosion", true).dead || dead;
  } else if (this.flag === "double" || this.flag === "triple" || this.flag === "multi") {
    const counts = {
      double: 2,
      triple: battle.rng.int(1, 3),
      multi: multiHitCount(battle.rng),
    };
    event.hitCount = 1;

    const count = counts[this.flag];
    for (let hits = 1; !dead && !endured && hits < count; hits++) {
      hadSub = target.v.substitute !== 0;
      ({dmg, isCrit, endured, band} = getDamage(
        this,
        battle,
        user,
        target,
        this.flag === "triple" ? hits + 1 : 1,
        band,
      ));

      event.hitCount = 0;
      ({dead, event} = target.damage(dmg, user, battle, isCrit, "attacked", false, eff));
      event.hitCount = hits + 1;
    }
  } else if (this.flag === "payday") {
    battle.info(user, "payday");
  } else if (this.flag === "rapid_spin" && user.base.hp) {
    if (user.owner.spikes) {
      user.owner.spikes = false;
      battle.info(user, "spin_spikes");
    }

    if (user.v.hasFlag(VolatileFlag.seeded)) {
      battle.event({type: "sv", volatiles: [user.clearFlag(VolatileFlag.seeded)]});
    }

    if (user.v.trapped) {
      battle.event({
        type: "trap",
        src: user.owner.id,
        target: user.owner.id,
        kind: "end",
        move: battle.moveIdOf(user.v.trapped.move)!,
        volatiles: [{id: user.owner.id, v: {trapped: null}}],
      });
      user.v.trapped = undefined;
    }
  }

  if (endured) {
    battle.info(target, "endure_hit");
  } else if (band) {
    battle.info(target, "endure_band");
  }

  if (dead && target.v.hasFlag(VolatileFlag.destinyBond)) {
    user.damage(user.base.hp, target, battle, false, "destiny_bond", true);
    // user should die first
    battle.checkFaint(target, user);
  }

  if (this.flag === "recharge") {
    user.v.recharge = this;
  }

  if (dead) {
    return;
  }

  if (
    user.base.item === "kingsrock" &&
    this.kingsRock &&
    !hadSub &&
    battle.gen.rng.tryKingsRock(battle)
  ) {
    target.v.flinch = true;
  }

  if (this.flag === "trap") {
    target.v.trapped = {user, move: this, turns: multiHitCount(battle.rng) + 1};
    const move = battle.moveIdOf(this)!;
    battle.event({
      type: "trap",
      src: user.owner.id,
      target: target.owner.id,
      kind: "start",
      move,
      volatiles: [{id: target.owner.id, v: {trapped: move}}],
    });
  }

  if (this.effect) {
    const [chance, effect] = this.effect;
    if (effect === "brn" && target.base.status === "frz") {
      target.unstatus(battle, "thaw");
      // TODO: can you thaw and then burn?
      return;
    } else if (!battle.rand100(chance) || hadSub) {
      return;
    }

    if (effect === "confusion") {
      if (!target.v.confusion && !user.owner.screens.safeguard) {
        target.confuse(battle);
      }
    } else if (Array.isArray(effect)) {
      if (!this.effect_self && target.v.hasFlag(VolatileFlag.mist)) {
        return;
      }

      const poke = this.effect_self ? user : target;
      poke.modStages(effect, battle);
    } else if (effect === "flinch") {
      if (target.base.status === "frz" || target.base.status === "slp") {
        return;
      }

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
      if (target.owner.screens.safeguard || target.base.status) {
        return;
      } else if (effect === "brn" && target.v.types.includes("fire")) {
        return;
      } else if (effect === "frz" && target.v.types.includes("ice")) {
        return;
      } else if ((effect === "psn" || effect === "tox") && target.v.types.includes("poison")) {
        return;
      } else if (
        (effect === "psn" || effect === "tox") &&
        target.v.types.includes("steel") &&
        battle.moveIdOf(this) !== "twineedle"
      ) {
        return;
      } else {
        target.status(effect, battle);
      }
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
