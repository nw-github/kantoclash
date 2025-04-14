import type {ActivePokemon, Battle} from "../battle";
import {checkUsefulness, getDamage, Range, type DamagingMove} from "../moves";
import type {Status} from "../pokemon";
import {abilityList} from "../species";
import {idiv, isSpecial, randChoiceWeighted, VF, type Type} from "../utils";

export const tryDamage = (
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  spread: bool,
): number => {
  const isImmune = (poke: ActivePokemon, status: Status) => {
    if (poke.base.status) {
      return true;
    } else if (status === "brn" && poke.v.types.includes("fire")) {
      return true;
    } else if (status === "frz" && poke.v.types.includes("ice")) {
      return true;
    } else if ((status === "psn" || status === "tox") && poke.v.hasAnyType("poison", "steel")) {
      return true;
    } else if (abilityList[poke.v.ability!]?.preventsStatus === status) {
      return true;
    } else if (status === "slp" && battle.hasUproar(poke)) {
      return true;
    } else {
      return false;
    }
  };

  const onHit = (type: Type, hadSub: bool) => {
    if (
      user.base.item === "kingsrock" &&
      self.kingsRock &&
      !hadSub &&
      target.v.ability !== "innerfocus" &&
      target.base.status !== "frz" &&
      target.base.status !== "slp" &&
      battle.gen.rng.tryKingsRock(battle)
    ) {
      target.v.flinch = true;
    }

    // TODO: test if color change activates before move secondary effect
    if (
      !hadSub &&
      target.base.hp &&
      target.v.ability === "colorchange" &&
      type !== "???" &&
      !target.v.types.includes(type)
    ) {
      battle.ability(target);
      battle.event({
        type: "conversion",
        src: target.id,
        types: [type],
        volatiles: [target.setVolatile("types", [type])],
      });
      return;
    }

    if (!self.contact) {
      return;
    }

    let status: Status | "attract" | undefined = abilityList[target.v.ability!]?.contactStatus;
    if (target.v.ability === "effectspore") {
      status = battle.rand100(10) ? battle.rng.choice(["psn", "par", "slp"])! : undefined;
    } else if (!battle.gen.rng.tryContactStatus(battle)) {
      status = undefined;
    }

    if (status) {
      if (status === "attract") {
        if (
          user.v.attract ||
          target.base.gender === "N" ||
          user.base.gender === "N" ||
          target.base.gender === user.base.gender
        ) {
          return;
        }

        battle.ability(target);
        user.v.attract = target;
        battle.info(user, "cAttract", [{id: user.id, v: {flags: user.v.cflags}}]);
      } else if (!user.base.status) {
        if (!isImmune(user, status)) {
          battle.ability(target);
          user.status(status, battle, target, {ignoreSafeguard: true});
        }
      }
    } else if (target.v.ability === "roughskin") {
      battle.ability(target);
      user.damage2(battle, {
        dmg: Math.max(1, Math.floor(user.base.stats.hp / 16)),
        src: target,
        why: "roughskin",
      });
    }
  };

  if (self.range === Range.AllAdjacent) {
    spread = false;
  }

  // eslint-disable-next-line prefer-const
  let {eff, fail, type, abilityImmunity} = checkUsefulness(self, battle, user, target);
  if (self.flag === "explosion") {
    // Explosion into destiny bond, who dies first?
    user.damage(user.base.hp, user, battle, false, "explosion", true);
  } else if (self.flag === "remove_screens") {
    // In Gen 3, light screen removes from the opponent even if you target an ally, or the target is
    // immune
    const opp = battle.opponentOf(user.owner);
    for (const screen of ["light_screen", "reflect"] as const) {
      if (opp.screens[screen]) {
        opp.screens[screen] = 0;
        battle.event({type: "screen", user: opp.id, screen, kind: "end"});
      }
    }
  }

  if (self.flag === "dream_eater" && target.v.substitute) {
    fail = true;
  }

  const protect = target.v.hasFlag(VF.protect);
  if (eff === 0 || fail || protect) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    user.v.thrashing = undefined;
    if (self.flag === "spitup") {
      battle.sv([user.setVolatile("stockpile", 0)]);
    }
    if (eff === 0) {
      if (abilityImmunity) {
        battle.ability(target);
      }

      battle.info(target, "immune");
    } else if (fail) {
      battle.info(user, "fail_generic");
    } else if (protect) {
      battle.info(target, "protect");
      if (self.flag === "crash") {
        const {dmg} = getDamage(self, battle, user, target, {});
        battle.gen.handleCrashDamage(battle, user, target, dmg);
      }
    }
    return 0;
  }

  if (
    (type === "electric" && target.v.ability === "voltabsorb") ||
    (type === "water" && target.v.ability === "waterabsorb")
  ) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    user.v.thrashing = undefined;
    battle.ability(target);
    battle.info(target, "immune");
    target.recover(Math.max(1, Math.floor(target.base.stats.hp / 4)), user, battle, "none");
    return 0;
  }

  if (type === "fire" && target.v.ability === "flashfire" && target.base.status !== "frz") {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    user.v.thrashing = undefined;
    battle.ability(target, [target.setFlag(VF.flashFire)]);
    battle.info(target, "immune");
    return 0;
  }

  if (!battle.checkAccuracy(self, user, target, !isSpecial(type))) {
    user.v.rollout = 0;
    user.v.furyCutter = 0;
    user.v.thrashing = undefined;
    if (self.flag === "crash") {
      const {dmg} = getDamage(self, battle, user, target, {});
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    }
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
    handledShellBell = true;

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
      user.handleShellBell(battle, dealt);

      if (dmg !== 0) {
        onHit(type, hadSub);
      }
      if (dead || user.base.hp === 0) {
        break;
      }
    }
  } else if (self.flag === "double" || self.flag === "triple" || self.flag === "multi") {
    const counts = {
      double: 2,
      triple: 3,
      multi: battle.gen.rng.multiHitCount(battle),
    };

    const wasSleeping = user.base.status === "slp";
    const count = counts[self.flag];
    let dmg, isCrit;
    for (let hits = 0; !dead && user.base.hp && !endured && hits < count; hits++) {
      if (
        self.flag === "triple" &&
        hits !== 0 &&
        !battle.checkAccuracy(self, user, target, !isSpecial(type))
      ) {
        // TODO: lazy
        battle.events.splice(-1, 1);
        break;
      }

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

      if (dmg !== 0) {
        onHit(type, hadSub);

        if (user.base.status === "slp" && !wasSleeping) {
          break;
        }
      }
    }
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

    if (dmg !== 0) {
      onHit(type, hadSub);
    }

    handledShellBell = false;
  }

  // TODO: should bide include damage taken by a substitute?
  if (!hadSub && target.v.bide) {
    target.v.bide.dmg += dealt;
  }

  if (handledShellBell) {
    dealt = 0;
  }

  target.v.lastHitBy = {move: self, user};

  if (
    user.base.hp &&
    self.recoil &&
    (self === battle.gen.moveList.struggle || user.v.ability !== "rockhead")
  ) {
    user.damage(Math.max(Math.floor(dealt / self.recoil), 1), user, battle, false, "recoil", true);
  }

  if (user.base.hp && (self.flag === "drain" || self.flag === "dream_eater")) {
    user.recover(Math.max(Math.floor(dealt / 2), 1), target, battle, "drain");
  } else if (self.flag === "payday") {
    battle.info(user, "payday");
  } else if (self.flag === "rapid_spin" && user.base.hp) {
    if (user.owner.spikes) {
      user.owner.spikes = 0;
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
  } else if (self.flag === "smellingsalt" && !hadSub && target.base.status === "par") {
    target.base.status = undefined;
    battle.event({
      type: "cure",
      src: target.id,
      status: "par",
      volatiles: [{id: target.id, v: {status: null, stats: target.clientStats(battle)}}],
    });
  }

  if (endured) {
    battle.info(target, "endure_hit");
  } else if (band) {
    battle.info(target, "endure_band");
  }

  if (self.flag === "recharge") {
    user.v.recharge = self;
  }

  if (!event) {
    // beat up failure
    battle.info(user, "fail_generic");
  } else if (!hadSub) {
    target.v.hasFocus = false;
  }

  if (self.flag === "trap" && !hadSub && target.base.hp) {
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

  if (self.flag === "uproar" && !user.v.thrashing) {
    user.v.thrashing = {move: self, turns: battle.gen.rng.thrashDuration(battle), max: false};
    battle.info(user, "uproar");
  }

  if (!self.effect) {
    return dealt;
  }

  // eslint-disable-next-line prefer-const
  let [chance, effect, effectSelf] = self.effect;
  if ((!effectSelf && !target.base.hp) || (effectSelf && !user.base.hp)) {
    return dealt;
  }

  if (user.v.ability === "serenegrace") {
    chance *= 2;
  }
  if (target.v.ability === "shielddust" && !effectSelf && effect !== "thief") {
    return dealt;
  }

  if (effect === "tri_attack") {
    effect = battle.rng.choice(["brn", "par", "frz"] as const)!;
  }

  // Fire-type hidden power does not thaw in Gen 3
  if (self.type === "fire" && target.base.status === "frz") {
    target.unstatus(battle, "thaw");
    // TODO: can you thaw and then burn?
    return dealt;
  } else if (!battle.rand100(chance) || (hadSub && !effectSelf)) {
    return dealt;
  }

  if (effect === "confusion") {
    if (!target.v.confusion && !user.owner.screens.safeguard && target.v.ability !== "owntempo") {
      target.confuse(battle);
    }
  } else if (Array.isArray(effect)) {
    if (effectSelf || !target.owner.screens.mist) {
      (effectSelf ? user : target).modStages(effect, battle, user, true);
    }
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
  } else if (effect === "knockoff") {
    if (target.base.item && target.v.ability !== "stickyhold") {
      battle.event({
        type: "knockoff",
        src: user.id,
        target: target.id,
        item: target.base.item,
      });
      target.base.itemUnusable = true;
    }
  } else {
    if (!target.owner.screens.safeguard && !isImmune(target, effect)) {
      target.status(effect, battle, user, {});
    }
  }

  return dealt;
};
