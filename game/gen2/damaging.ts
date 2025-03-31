import type {ActivePokemon, Battle} from "../battle";
import {checkUsefulness, getDamage, multiHitCount, Range, type DamagingMove} from "../moves";
import {idiv, randChoiceWeighted, VF} from "../utils";

export function exec(
  this: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  targets: ActivePokemon[],
) {
  if (this.flag === "multi_turn" && !user.v.thrashing) {
    user.v.thrashing = {move: this, turns: battle.rng.int(2, 3), max: false};
    user.v.thrashing.max = user.v.thrashing.turns == 3;
  } else if (this.flag === "rollout" && !user.v.thrashing) {
    user.v.thrashing = {move: this, turns: 5, max: false};
    user.v.rollout = 0;
  } else if (this.flag === "fury_cutter") {
    user.v.furyCutter++;
  } else if (this.flag === "bide") {
    if (!user.v.bide) {
      user.v.bide = {move: this, turns: battle.rng.int(2, 3) + 1, dmg: 0};
      return;
    }

    user.v.bide.dmg += user.v.retaliateDamage;
    if (--user.v.bide.turns !== 0) {
      return battle.info(user, "bide_store");
    }

    battle.info(user, "bide");
  }

  if (this.range === Range.Self) {
    if (!user.v.lastHitBy) {
      user.v.rollout = 0;
      user.v.furyCutter = 0;
      return battle.info(user, "miss");
    }
    targets = [user.v.lastHitBy.user];
  }

  for (const target of targets) {
    tryDamage(this, battle, user, target, targets.length > 1 && this.range !== Range.AllAdjacent);
  }
}

const tryDamage = (
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  spread: bool,
) => {
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

  const {eff, fail} = checkUsefulness(self, battle, user, target);
  if (self.flag === "drain" && target.v.substitute) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    return battle.info(user, "miss");
  }

  const protect = target.v.hasFlag(VF.protect);
  if (eff === 0) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    battle.info(target, "immune");
    if (self.flag === "explosion") {
      user.damage(user.base.hp, user, battle, false, "explosion", true);
    }
    return checkThrashing();
  } else if (fail) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    battle.info(user, "miss");
    return checkThrashing();
  } else if (protect || !battle.checkAccuracy(self, user, target)) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    if (protect) {
      battle.info(target, "protect");
      return checkThrashing();
    }

    if (self.flag === "crash") {
      const {dmg} = getDamage(self, battle, user, target, {});
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    } else if (self.flag === "explosion") {
      user.damage(user.base.hp, user, battle, false, "explosion", true);
    } else if (self.flag === "ohko" && self !== battle.gen.moveList.guillotine) {
      // In Gen 2, Horn Drill and Fissure can be countered for max damage on miss
      target.v.retaliateDamage = 65535;
    }
    return checkThrashing();
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
        return battle.info(target, "fail_present");
      }

      return target.recover(Math.max(idiv(target.base.stats.hp, 4), 1), user, battle, "present");
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
      if (dead) {
        break;
      }
    }
  } else if (self.flag === "double" || self.flag === "triple" || self.flag === "multi") {
    const counts = {
      double: 2,
      triple: battle.rng.int(1, 3),
      multi: multiHitCount(battle.rng),
    };

    const count = counts[self.flag];
    let event;
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
      ({dead, event} = target.damage(dmg, user, battle, isCrit, "attacked", false, eff));
      event.hitCount = hits + 1;
    }
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
  if (self.recoil) {
    user.damage(Math.max(Math.floor(dealt / self.recoil), 1), user, battle, false, "recoil", true);
  }

  if (self.flag === "drain" || self.flag === "dream_eater") {
    user.recover(Math.max(Math.floor(dealt / 2), 1), target, battle, "drain");
  } else if (self.flag === "explosion") {
    // Explosion into destiny bond, who dies first?
    dead = user.damage(user.base.hp, user, battle, false, "explosion", true).dead || dead;
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

  if (dead) {
    return;
  }

  // BUG GEN2:
  // https://pret.github.io/pokecrystal/bugs_and_glitches.html#beat-up-may-trigger-kings-rock-even-if-it-failed
  if (
    user.base.item === "kingsrock" &&
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

  if (self.flag === "trap") {
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
    const wasTriAttack = effect === "tri_attack";
    if (effect === "tri_attack") {
      effect = battle.rng.choice(["brn", "par", "frz"] as const)!;
    }

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
      // BUG GEN2:
      // https://pret.github.io/pokecrystal/bugs_and_glitches.html#moves-that-do-damage-and-increase-your-stats-do-not-increase-stats-after-a-ko
      if ((!effectSelf && target.v.hasFlag(VF.mist)) || (effectSelf && dead)) {
        return;
      }

      (effectSelf ? user : target).modStages(effect, battle);
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
        src: user.id,
        target: target.id,
        item: target.base.item,
      });
      user.base.item = target.base.item;
      target.base.item = undefined;
    } else {
      if (target.owner.screens.safeguard || target.base.status) {
        return;
      } else if (!wasTriAttack && effect === "brn" && target.v.types.includes("fire")) {
        return;
      } else if (!wasTriAttack && effect === "frz" && target.v.types.includes("ice")) {
        return;
      } else if ((effect === "psn" || effect === "tox") && target.v.types.includes("poison")) {
        return;
      } else if (
        (effect === "psn" || effect === "tox") &&
        target.v.types.includes("steel") &&
        battle.moveIdOf(self) !== "twineedle"
      ) {
        return;
      } else {
        target.status(effect, battle);
      }
    }
  }
};
