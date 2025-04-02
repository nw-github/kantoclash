import type {ActivePokemon, Battle} from "../battle";
import {checkUsefulness, getDamage, multiHitCount, Range, type DamagingMove} from "../moves";
import {idiv, isSpecial, randChoiceWeighted, VF} from "../utils";

export const tryDamage = (
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  spread: bool,
): number => {
  const checkThrashing = () => {
    if (user.v.thrashing && --user.v.thrashing.turns === 0) {
      user.v.rollout = 0;
      user.v.furyCutter = 0;
      if (!user.owner.screens.safeguard && self.flag !== "rollout") {
        user.confuse(battle, user.v.thrashing.max ? "cConfusedFatigueMax" : "cConfusedFatigue");
      }
      user.v.thrashing = undefined;
    }
  };

  if (self.range === Range.AllAdjacent) {
    spread = false;
  }

  const {eff, fail, type, abilityImmunity} = checkUsefulness(self, battle, user, target);
  if (self.flag === "drain" && target.v.substitute) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    battle.miss(user, target);
    return 0;
  }

  const protect = target.v.hasFlag(VF.protect);
  if (self.flag === "explosion") {
    // Explosion into destiny bond, who dies first?
    user.damage(user.base.hp, user, battle, false, "explosion", true);
  }

  if (eff === 0 || fail || protect) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    if (eff === 0) {
      if (abilityImmunity) {
        battle.ability(target);
      }

      battle.info(target, "immune");
    } else if (fail) {
      battle.miss(user, target);
    } else if (protect) {
      battle.info(target, "protect");
      if (self.flag === "crash") {
        const {dmg} = getDamage(self, battle, user, target, {});
        battle.gen.handleCrashDamage(battle, user, target, dmg);
      }
    }
    checkThrashing();
    return 0;
  } else if (!battle.checkAccuracy(self, user, target, !isSpecial(type))) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    if (self.flag === "crash") {
      const {dmg} = getDamage(self, battle, user, target, {});
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    } else if (self.flag === "ohko" && self !== battle.gen.moveList.guillotine) {
      // In Gen 2, Horn Drill and Fissure can be countered for max damage on miss
      target.v.retaliateDamage = 65535;
    }
    checkThrashing();
    return 0;
  }

  let power: number | undefined;
  if (self.flag === "magnitude") {
    const magnitude = battle.rng.int(4, 10);
    power = [10, 30, 50, 70, 90, 110, 150][magnitude - 4];
    battle.event({type: "magnitude", magnitude});
  } else if (self.flag === "present") {
    const result = randChoiceWeighted(battle.rng, [40, 80, 120, -4], [40, 30, 10, 20]);
    if (result < 0) {
      if (target.base.hp === target.base.stats.hp) {
        battle.info(target, "fail_present");
        return 0;
      }

      target.recover(Math.max(idiv(target.base.stats.hp, 4), 1), user, battle, "present");
      return 0;
    }
    power = result;
  }

  let hadSub = target.v.substitute !== 0,
    dealt = 0,
    dead = false,
    event,
    endured = false,
    band = false,
    isCrit = false,
    dmg = 0;

  if (self.flag === "beatup") {
    for (const poke of user.owner.team) {
      if (poke.status || !poke.hp) {
        continue;
      }

      battle.event({type: "beatup", name: poke.name});

      hadSub = target.v.substitute !== 0;
      ({dmg, isCrit, endured, band} = getDamage(self, battle, user, target, {band, beatUp: poke}));
      ({dead, event, dealt} = target.damage2(battle, {dmg, src: user, why: "attacked", isCrit}));
      user.handleShellBell(battle, dealt);

      if (dead) {
        break;
      }
    }
    dealt = 0;
  } else if (self.flag === "double" || self.flag === "triple" || self.flag === "multi") {
    const counts = {
      double: 2,
      triple: battle.rng.int(1, 3),
      multi: multiHitCount(battle.rng),
    };

    const count = counts[self.flag];
    for (let hits = 0; !dead && !endured && hits < count; hits++) {
      hadSub = target.v.substitute !== 0;
      ({dmg, isCrit, endured, band} = getDamage(self, battle, user, target, {
        tripleKick: self.flag === "triple" ? hits + 1 : 1,
        band,
        power,
      }));

      if (event) {
        event.hitCount = 0;
      }
      ({dead, event, dealt} = target.damage(dmg, user, battle, isCrit, "attacked", false, eff));
      event.hitCount = hits + 1;
      user.handleShellBell(battle, dealt);
    }
    dealt = 0;
  } else {
    ({dmg, isCrit, endured, band} = getDamage(self, battle, user, target, {power}));
    ({dealt, dead, event} = target.damage(
      dmg,
      user,
      battle,
      isCrit,
      self.flag === "ohko" ? "ohko" : "attacked",
      false,
      eff,
    ));
  }

  target.v.lastHitBy = {move: self, user};

  checkThrashing();
  if (self.recoil && (self === battle.gen.moveList.struggle || user.v.ability !== "rockhead")) {
    user.damage(Math.max(Math.floor(dealt / self.recoil), 1), user, battle, false, "recoil", true);
  }

  if (self.flag === "drain" || self.flag === "dream_eater") {
    user.recover(Math.max(Math.floor(dealt / 2), 1), target, battle, "drain");
  } else if (self.flag === "payday") {
    battle.info(user, "payday");
  } else if (self.flag === "rapid_spin" && user.base.hp) {
    if (user.owner.spikes) {
      user.owner.spikes = false;
      battle.event({type: "spikes", src: user.id, player: user.owner.id, spin: true});
    }

    if (user.v.seededBy) {
      user.v.seededBy = undefined;
      battle.event({type: "sv", volatiles: [{id: user.id, v: {flags: user.v.cflags}}]});
    }

    if (user.v.trapped) {
      battle.event({
        type: "trap",
        src: user.id,
        target: user.id,
        kind: "end",
        move: battle.moveIdOf(user.v.trapped.move)!,
        volatiles: [{id: user.id, v: {trapped: null}}],
      });
      user.v.trapped = undefined;
    }
  }

  if (endured) {
    battle.info(target, "endure_hit");
  } else if (band) {
    battle.info(target, "endure_band");
  }

  if (dead && target.v.hasFlag(VF.destinyBond)) {
    user.damage(user.base.hp, target, battle, false, "destiny_bond", true);
    // user should die first
    battle.checkFaint(target);
  }

  if (self.flag === "recharge") {
    user.v.recharge = self;
  }

  // BUG GEN2:
  // https://pret.github.io/pokecrystal/bugs_and_glitches.html#moves-that-do-damage-and-increase-your-stats-do-not-increase-stats-after-a-ko
  if (dead) {
    return dealt;
  }

  // BUG GEN2:
  // https://pret.github.io/pokecrystal/bugs_and_glitches.html#beat-up-may-trigger-kings-rock-even-if-it-failed
  if (
    user.base.item === "kingsrock" &&
    target.v.ability !== "innerfocus" &&
    self.kingsRock &&
    !hadSub &&
    battle.gen.rng.tryKingsRock(battle)
  ) {
    target.v.flinch = true;
  }

  if (!event) {
    // beat up failure
    battle.info(user, "fail_generic");
  }

  if (self.flag === "trap" && !hadSub) {
    target.v.trapped = {user, move: self, turns: multiHitCount(battle.rng) + 1};
    const move = battle.moveIdOf(self)!;
    battle.event({
      type: "trap",
      src: user.id,
      target: target.id,
      kind: "start",
      move,
      volatiles: [{id: target.id, v: {trapped: move}}],
    });
  }

  if (self.effect) {
    // eslint-disable-next-line prefer-const
    let [chance, effect, effectSelf] = self.effect;
    if (user.v.ability === "serenegrace") {
      chance *= 2;
    }
    if (target.v.ability === "shielddust" && !effectSelf && effect !== "thief") {
      return dealt;
    }

    const wasTriAttack = effect === "tri_attack";
    if (effect === "tri_attack") {
      effect = battle.rng.choice(["brn", "par", "frz"] as const)!;
    }

    if (effect === "brn" && target.base.status === "frz") {
      target.unstatus(battle, "thaw");
      // TODO: can you thaw and then burn?
      return dealt;
    } else if (!battle.rand100(chance) || hadSub) {
      return dealt;
    }

    if (effect === "confusion") {
      if (!target.v.confusion && !user.owner.screens.safeguard) {
        target.confuse(battle);
      }
    } else if (Array.isArray(effect)) {
      if (!effectSelf && target.v.hasFlag(VF.mist)) {
        return dealt;
      }

      (effectSelf ? user : target).modStages(effect, battle);
    } else if (effect === "flinch") {
      if (target.base.status === "frz" || target.base.status === "slp") {
        return dealt;
      }

      if (target.v.ability !== "innerfocus") {
        target.v.flinch = true;
      } else if (chance === 100) {
        battle.ability(target);
        battle.info(target, "wont_flinch");
      }
    } else if (effect === "thief") {
      if (
        user.base.item ||
        !target.base.item ||
        target.base.item.includes("mail") ||
        target.v.ability === "stickyhold"
      ) {
        return dealt;
      }

      battle.event({
        type: "thief",
        src: user.id,
        target: target.id,
        item: target.base.item,
      });
      user.base.item = target.base.item;
      target.base.item = undefined;
    } else {
      if (target.owner.screens.safeguard || target.base.status) {
        return dealt;
      } else if (!wasTriAttack && effect === "brn" && target.v.types.includes("fire")) {
        return dealt;
      } else if (!wasTriAttack && effect === "frz" && target.v.types.includes("ice")) {
        return dealt;
      } else if ((effect === "psn" || effect === "tox") && target.v.types.includes("poison")) {
        return dealt;
      } else if (
        (effect === "psn" || effect === "tox") &&
        target.v.types.includes("steel") &&
        battle.moveIdOf(self) !== "twineedle"
      ) {
        return dealt;
      } else {
        target.status(effect, battle, user);
      }
    }
  }
  return dealt;
};
