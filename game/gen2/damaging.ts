import type {ActivePokemon, Battle} from "../battle";
import type {DamagingMove} from "../moves";
import {hazards, VF} from "../utils";

export const tryDamage = (
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  _spread: bool,
  power?: number,
): number => {
  const checkThrashing = () => {
    if (user.v.thrashing && --user.v.thrashing.turns === 0) {
      user.v.furyCutter = 0;
      if (!user.owner.screens.safeguard && self.flag === "multi_turn") {
        user.confuse(battle, user.v.thrashing.max ? "fatigue_confuse_max" : "fatigue_confuse");
      }
      user.v.thrashing = undefined;
    }
  };

  if (self.flag === "explosion") {
    user.damage(user.base.hp, user, battle, false, "explosion", true);
  }

  const protect = target.v.hasFlag(VF.protect);
  let isCrit = battle.gen.rollCrit(battle, user, target, self);
  const {eff, dmg, miss, type} = battle.gen.getDamage({
    battle,
    user,
    target,
    move: self,
    isCrit,
    rng: self.flag === "norand" ? null : undefined,
    power,
  });
  if (eff === 0 || miss || protect) {
    user.v.furyCutter = 0;
    if (user.v.thrashing?.move?.flag === "rollout") {
      user.v.thrashing = undefined;
    }

    if (eff === 0) {
      battle.info(target, "immune");
    } else if (miss) {
      battle.miss(user, target);
    } else if (protect) {
      battle.info(target, "protect");
      if (self.flag === "crash") {
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
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    } else if (self.flag === "ohko" && self !== battle.gen.moveList.guillotine) {
      // In Gen 2, Horn Drill and Fissure can be countered for max damage on miss
      target.v.retaliateDamage = dmg;
    }
    checkThrashing();
    return 0;
  } else if (dmg < 0) {
    if (target.base.isMaxHp()) {
      battle.info(target, "fail_present");
      return 0;
    }

    target.recover(-dmg, user, battle, "present");
    return 0;
  }

  let hadSub = false,
    dealt = 0,
    dead = false,
    endured = false,
    band = false,
    beatUpFail = false;
  let why = self.flag === "ohko" ? ("ohko" as const) : ("attacked" as const);

  // command BattleCommand_ApplyDamage
  const applyDamage = (dmg: number) => {
    hadSub = target.v.substitute !== 0;
    if (!band && user.base.itemId === "focusband") {
      band = battle.gen.rng.tryFocusBand(battle);
    }

    if (target.v.hasFlag(VF.endure) && dmg >= target.base.hp) {
      endured = true;
    }

    // command falseswipe BattleCommand_FalseSwipe
    if (band || endured || (self.flag === "false_swipe" && dmg >= target.base.hp)) {
      dmg = target.base.hp - 1;
      why = "attacked";
    }

    let event;
    ({dead, event, dealt} = target.damage2(battle, {
      dmg,
      src: user,
      why,
      isCrit,
      eff: self.flag === "beatup" ? 1 : eff,
    }));
    return {dead, event};
  };

  if (self.flag === "beatup") {
    beatUpFail = true;
    for (const poke of user.owner.team) {
      if (poke.status || !poke.hp) {
        continue;
      }

      battle.event({type: "beatup", name: poke.name});

      isCrit = false;
      beatUpFail = false;
      const {dmg} = battle.gen.getDamage({battle, user, target, move: self, isCrit, beatUp: poke});
      if (applyDamage(dmg).dead) {
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
    let dmg, event;
    for (let hits = 1; !dead && hits <= count; hits++) {
      isCrit = battle.gen.rollCrit(battle, user, target, self);
      ({dmg} = battle.gen.getDamage({
        battle,
        user,
        target,
        move: self,
        isCrit,
        power,
        tripleKick: self.flag === "triple" ? hits : 1,
      }));
      if (event) {
        event.hitCount = 0;
      }
      ({dead, event} = applyDamage(dmg));
      event.hitCount = hits + 1;
    }

    if (!hadSub && target.v.bide) {
      target.v.bide.dmg += dealt;
    }
    dealt = 0;
  } else {
    applyDamage(dmg);
    if (!hadSub && target.v.bide) {
      target.v.bide.dmg += dealt;
    }
  }

  target.v.lastHitBy = {move: self, poke: user, type};

  checkThrashing();
  if (user.base.hp && self.recoil) {
    user.damage(Math.max(Math.floor(dealt / self.recoil), 1), user, battle, false, "recoil", true);
  }

  if (self.flag === "drain" || self.flag === "dream_eater") {
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
        move: user.v.trapped.move.id!,
        volatiles: [{id: user.id, v: {trapped: null}}],
      });
      user.v.trapped = undefined;
    }
  }

  // Focus band text is prioritized over endure
  if (band) {
    battle.info(target, "endure_band");
  } else if (endured) {
    battle.info(target, "endure_hit");
  }

  if (self.flag === "recharge") {
    user.v.recharge = {move: self, target};
  }

  // BUG GEN2:
  // https://pret.github.io/pokecrystal/bugs_and_glitches.html#beat-up-may-trigger-kings-rock-even-if-it-failed
  if (
    user.base.item?.kingsRock &&
    self.kingsRock &&
    !hadSub &&
    battle.gen.rng.tryKingsRock(battle)
  ) {
    target.v.flinch = true;
  }

  if (beatUpFail) {
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
    target.v.trapped = {user, move: self, turns: battle.gen.rng.bindingMoveTurns(battle, user)};
    const move = self.id!;
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
  } else if (hadSub && !effectSelf) {
    return dealt;
  } else if (battle.rng.int(0, 255) >= chance) {
    /**
     * Gen2 Bug: moves with 100% effect chance have a 1/256 chance to not trigger
     * https://github.com/pret/pokecrystal/blob/c73ab9e9c9a8b6eaee38f19fdcf956c1baf268ea/engine/battle/effect_commands.asm#L1864
     */
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
    if (user.base.itemId || !target.base.itemId || target.base.itemId.includes("mail")) {
      return dealt;
    }

    battle.event({
      type: "thief",
      src: user.id,
      target: target.id,
      item: target.base.itemId,
    });
    user.manipulateItem(poke => (poke.itemId = target.base.itemId));
    target.manipulateItem(poke => (poke.itemId = undefined));
  } else if (effect === "knockoff") {
    if (target.base.itemId) {
      battle.event({
        type: "knockoff",
        src: user.id,
        target: target.id,
        item: target.base.itemId,
      });
      target.manipulateItem(poke => (poke.itemUnusable = true));
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
      self.id !== "twineedle"
    ) {
      return dealt;
    } else {
      target.status(effect, battle, user, {});
    }
  }

  return dealt;
};
