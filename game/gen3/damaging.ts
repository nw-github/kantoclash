import type {ActivePokemon, Battle} from "../battle";
import type {DamagingMove} from "../moves";
import {checkUsefulness} from "../damaging";
import type {Status} from "../pokemon";
import {abilityList} from "../species";
import {hazards, idiv, randChoiceWeighted, VF, Range, type Type} from "../utils";

export const tryDamage = (
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  spread: bool,
  power?: number,
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
    } else if (poke.getAbility()?.preventsStatus === status) {
      return true;
    } else if (status === "slp" && battle.hasUproar(poke)) {
      return true;
    } else {
      return false;
    }
  };

  const onHit = (type: Type, hadSub: bool) => {
    const targetAbility = target.getAbilityId();
    if (
      user.base.item?.kingsRock &&
      self.kingsRock &&
      !hadSub &&
      targetAbility !== "innerfocus" &&
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
      targetAbility === "colorchange" &&
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

    let status: Status | "attract" | undefined = abilityList[targetAbility!]?.contactStatus;
    if (targetAbility === "effectspore") {
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
        battle.info(user, "attract", [{id: user.id, v: {flags: user.v.cflags}}]);
      } else if (!user.base.status) {
        if (!isImmune(user, status)) {
          battle.ability(target);
          user.status(status, battle, target, {ignoreSafeguard: true});
        }
      }
    } else if (targetAbility === "roughskin") {
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
        battle.event({type: "screen", user: opp.id, screen, kind: "shattered"});
      }
    }
  }

  if (self.flag === "dream_eater" && target.v.substitute) {
    fail = true;
  }

  const protect = target.v.hasFlag(VF.protect);
  const special = battle.gen.isSpecial(self, type);
  if (eff === 0 || fail || protect || !battle.checkAccuracy(self, user, target, !special)) {
    user.v.furyCutter = 0;
    user.v.thrashing = undefined;
    if (self.flag === "spitup") {
      battle.sv([user.setVolatile("stockpile", 0)]);
    }
    if (eff === 0) {
      if (abilityImmunity) {
        battle.ability(
          target,
          target.hasAbility("flashfire") ? [target.setFlag(VF.flashFire)] : undefined,
        );
      }

      battle.info(target, "immune");

      if (abilityImmunity && target.hasAnyAbility("waterabsorb", "voltabsorb")) {
        target.recover(Math.max(1, Math.floor(target.base.stats.hp / 4)), user, battle, "none");
      }
    } else if (fail) {
      battle.info(user, "fail_generic");
    } else {
      if (protect) {
        battle.info(target, "protect");
      }
      if (self.flag === "crash") {
        const {dmg} = getDamage(self, battle, user, target, {});
        battle.gen.handleCrashDamage(battle, user, target, dmg);
      }
    }
    return 0;
  }

  if (self.flag === "present") {
    const result = randChoiceWeighted(battle.rng, [40, 80, 120, -4], [40, 30, 10, 20]);
    if (result < 0) {
      if (target.base.isMaxHp()) {
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

      if (dealt !== 0) {
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
        !battle.checkAccuracy(self, user, target, !special)
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

      if (dealt !== 0) {
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

    if (dealt !== 0) {
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

  target.v.lastHitBy = {move: self, poke: user, type};

  if (
    user.base.hp &&
    self.recoil &&
    (self === battle.gen.moveList.struggle || !user.hasAbility("rockhead"))
  ) {
    user.damage(Math.max(Math.floor(dealt / self.recoil), 1), user, battle, false, "recoil", true);
  }

  if (user.base.hp && (self.flag === "drain" || self.flag === "dream_eater")) {
    user.recover(Math.max(Math.floor(dealt / 2), 1), target, battle, "drain");
  } else if (self.flag === "payday") {
    battle.info(user, "payday");
  } else if (self.flag === "rapid_spin" && user.base.hp) {
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
    user.v.recharge = {move: self, target};
  }

  if (!event) {
    // beat up failure
    battle.info(user, "fail_generic");
  } else if (!hadSub) {
    target.v.hasFocus = false;
  }

  if (self.flag === "trap" && !hadSub && target.base.hp) {
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

  if (user.hasAbility("serenegrace")) {
    chance *= 2;
  }
  if (target.hasAbility("shielddust") && !effectSelf && effect !== "thief") {
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
    if (!target.v.confusion && !user.owner.screens.safeguard && !target.hasAbility("owntempo")) {
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

    if (!target.hasAbility("innerfocus")) {
      target.v.flinch = true;
    } else if (chance === 100) {
      battle.ability(target);
      battle.info(target, "wont_flinch");
    }
  } else if (effect === "thief") {
    if (
      user.base.itemId ||
      !target.base.itemId ||
      target.base.itemId.includes("mail") ||
      target.hasAbility("stickyhold")
    ) {
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
    if (target.base.itemId && !target.hasAbility("stickyhold")) {
      battle.event({
        type: "knockoff",
        src: user.id,
        target: target.id,
        item: target.base.itemId,
      });
      target.manipulateItem(poke => (poke.itemUnusable = true));
    }
  } else {
    if (!target.owner.screens.safeguard && !isImmune(target, effect)) {
      target.status(effect, battle, user, {});
    }
  }

  return dealt;
};
