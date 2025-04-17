import type {ActivePokemon, Battle} from "../battle";
import {checkUsefulness, getDamage, Range, type DamagingMove} from "../moves";
import {hazards, idiv, randChoiceWeighted, VF} from "../utils";

export const tryDamage = (
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  spread: bool,
  power?: number,
): number => {
  const checkThrashing = () => {
    if (user.v.thrashing && --user.v.thrashing.turns === 0) {
      user.v.furyCutter = 0;
      if (!user.owner.screens.safeguard && self.flag === "multi_turn") {
        user.confuse(battle, user.v.thrashing.max ? "cConfusedFatigueMax" : "cConfusedFatigue");
      }
      user.v.thrashing = undefined;
    }
  };

  if (self.range === Range.AllAdjacent) {
    spread = false;
  }

  const {eff, fail, type, abilityImmunity} = checkUsefulness(self, battle, user, target);
  if ((self.flag === "drain" || self.flag === "dream_eater") && target.v.substitute) {
    user.v.furyCutter = 0;
    battle.miss(user, target);
    return 0;
  }

  if (self.flag === "explosion") {
    // Explosion into destiny bond, who dies first?
    user.damage(user.base.hp, user, battle, false, "explosion", true);
  }

  const protect = target.v.hasFlag(VF.protect);
  if (eff === 0 || fail || protect) {
    user.v.furyCutter = 0;
    if (user.v.thrashing?.move?.flag === "rollout") {
      user.v.thrashing = undefined;
    }

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
  } else if (!battle.checkAccuracy(self, user, target, !battle.gen.isSpecial(self, type))) {
    if (user.v.thrashing?.move?.flag === "rollout") {
      user.v.thrashing = undefined;
    }

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

  if (self.flag === "present") {
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
    band = false;

  if (self.flag === "beatup") {
    let dmg, isCrit;
    for (const poke of user.owner.team) {
      if (poke.status || !poke.hp) {
        continue;
      }

      battle.event({type: "beatup", name: poke.name});

      hadSub = target.v.substitute !== 0;
      ({dmg, isCrit, endured, band} = getDamage(self, battle, user, target, {band, beatUp: poke}));
      ({dead, event, dealt} = target.damage2(battle, {dmg, src: user, why: "attacked", isCrit}));
      if (dead || user.base.hp === 0) {
        break;
      }
    }

    if (!hadSub && target.v.bide) {
      target.v.bide.dmg += dealt;
    }
    dealt = 0;
  } else if (self.flag === "double" || self.flag === "triple" || self.flag === "multi") {
    const counts = {
      double: 2,
      triple: battle.rng.int(1, 3),
      multi: battle.gen.rng.multiHitCount(battle),
    };

    const count = counts[self.flag];
    let dmg, isCrit;
    for (let hits = 0; !dead && user.base.hp && !endured && hits < count; hits++) {
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
    }

    if (!hadSub && target.v.bide) {
      target.v.bide.dmg += dealt;
    }
    dealt = 0;
  } else {
    let dmg, isCrit;
    ({dmg, isCrit, endured, band} = getDamage(self, battle, user, target, {power, spread}));
    ({dealt, dead, event} = target.damage(
      dmg,
      user,
      battle,
      isCrit,
      self.flag === "ohko" ? "ohko" : "attacked",
      false,
      eff,
    ));

    if (!hadSub && target.v.bide) {
      target.v.bide.dmg += dealt;
    }
  }

  target.v.lastHitBy = {move: self, poke: user, special: battle.gen.isSpecial(self, type, true)};

  checkThrashing();
  if (user.base.hp && self.recoil) {
    user.damage(Math.max(Math.floor(dealt / self.recoil), 1), user, battle, false, "recoil", true);
  }

  if (user.base.hp && (self.flag === "drain" || self.flag === "dream_eater")) {
    user.recover(Math.max(Math.floor(dealt / 2), 1), target, battle, "drain");
  } else if (self.flag === "payday") {
    battle.info(user, "payday");
  } else if (self.flag === "rapid_spin") {
    for (const hazard of hazards) {
      if (user.owner.hazards[hazard]) {
        user.owner.hazards[hazard] = 0;
        battle.event({type: "hazard", src: user.id, player: user.owner.id, hazard, spin: true});
      }
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

  if (self.flag === "recharge") {
    user.v.recharge = self;
  }

  // BUG GEN2:
  // https://pret.github.io/pokecrystal/bugs_and_glitches.html#beat-up-may-trigger-kings-rock-even-if-it-failed
  if (
    battle.gen.items[user.base.item!]?.kingsRock &&
    self.kingsRock &&
    !hadSub &&
    battle.gen.rng.tryKingsRock(battle)
  ) {
    target.v.flinch = true;
  }

  if (!event) {
    // beat up failure
    battle.info(user, "fail_generic");
  } else if (!hadSub) {
    target.v.hasFocus = false;
  }

  // BUG GEN2:
  // https://pret.github.io/pokecrystal/bugs_and_glitches.html#moves-that-do-damage-and-increase-your-stats-do-not-increase-stats-after-a-ko
  if (dead) {
    return dealt;
  }

  if (self.flag === "trap" && !hadSub) {
    target.v.trapped = {user, move: self, turns: battle.gen.rng.multiHitCount(battle) + 1};
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

  if (!self.effect) {
    return dealt;
  }

  // eslint-disable-next-line prefer-const
  let [chance, effect, effectSelf] = self.effect;

  const wasTriAttack = effect === "tri_attack";
  if (effect === "tri_attack") {
    effect = battle.rng.choice(["brn", "par", "frz"] as const)!;
  }

  if (effect === "brn" && target.base.status === "frz") {
    target.unstatus(battle, "thaw");
    // TODO: can you thaw and then burn?
    return dealt;
  } else if (!battle.rand100(chance) || (hadSub && !effectSelf)) {
    return dealt;
  }

  if (effect === "confusion") {
    if (!target.v.confusion && !user.owner.screens.safeguard) {
      target.confuse(battle);
    }
  } else if (Array.isArray(effect)) {
    if (effectSelf || !target.v.hasFlag(VF.mist)) {
      (effectSelf ? user : target).modStages(effect, battle, user, true);
    }
  } else if (effect === "flinch") {
    if (target.base.status !== "frz" && target.base.status !== "slp") {
      target.v.flinch = true;
    }
  } else if (effect === "thief") {
    if (user.base.item || !target.base.item || target.base.item.includes("mail")) {
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
  } else if (effect === "knockoff") {
    if (target.base.item) {
      battle.event({
        type: "knockoff",
        src: user.id,
        target: target.id,
        item: target.base.item,
      });
      target.base.itemUnusable = true;
    }
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
      target.status(effect, battle, user, {});
    }
  }

  return dealt;
};
