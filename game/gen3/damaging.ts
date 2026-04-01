import type {ActivePokemon, Battle} from "../battle";
import type {DamagingMove} from "../moves";
import type {Status} from "../pokemon";
import {abilityList} from "../species";
import {DMF, Endure, hazards, VF, type Type} from "../utils";

export const tryDamage = (
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  _spread: bool,
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

  const tryContactAbility = (type: Type, hadSub: bool) => {
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

  if (self.flag === DMF.explosion) {
    // Explosion into destiny bond, who dies first?
    user.damage(user.base.hp, user, battle, false, "explosion", true);
  } else if (self.flag === DMF.remove_screens) {
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

  const protect = target.v.hasFlag(VF.protect);
  let isCrit = battle.gen.rollCrit(battle, user, target, self);
  // eslint-disable-next-line prefer-const
  let {dmg, miss, eff, type} = battle.gen.getDamage({
    battle,
    user,
    target,
    move: self,
    isCrit,
    power,
  });
  const special = battle.gen.isSpecial(self, type);
  const abilityImmunity = battle.gen.tryAbilityImmunity(battle, user, target, self, type, eff);
  if (eff === 0 || miss || protect || !battle.checkAccuracy(self, user, target, !special)) {
    user.v.furyCutter = 0;
    user.v.thrashing = undefined;
    if (self.id === "spitup") {
      battle.sv([user.setVolatile("stockpile", 0)]);
    }
    // TODO: verify this processing order
    if (!abilityImmunity) {
      if (eff === 0) {
        battle.info(target, "immune");
      } else if (miss) {
        battle.info(user, "fail_generic");
      } else {
        if (protect) {
          battle.info(target, "protect");
        }
        if (self.flag === DMF.crash) {
          battle.gen.handleCrashDamage(battle, user, target, dmg);
        }
      }
    }
    return 0;
  }

  if (dmg < 0) {
    target.recover(dmg, user, battle, "present");
    return 0;
  }

  let hadSub = target.v.substitute !== 0,
    dealt = 0,
    endured = false,
    band = false,
    beatUpFail = false;
  let why = self.flag === DMF.ohko ? ("ohko" as const) : ("attacked" as const);
  const wasSleeping = user.base.status === "slp";

  const applyDamage = (dmg: number, doShellBell: bool) => {
    hadSub = target.v.substitute !== 0;
    if (!band && user.base.itemId === "focusband") {
      band = battle.gen.rng.tryFocusBand(battle);
    }

    if (target.v.hasFlag(VF.endure) && dmg >= target.base.hp) {
      endured = true;
    }

    // command falseswipe BattleCommand_FalseSwipe
    if (band || endured || (self.id === "falseswipe" && dmg >= target.base.hp)) {
      dmg = target.base.hp - 1;
      why = "attacked";
    }

    let event, dead;
    ({dead, event, dealt} = target.damage2(battle, {
      dmg,
      src: user,
      why,
      isCrit,
      eff: self.id === "beatup" ? 1 : eff,
    }));

    if (doShellBell) {
      user.handleShellBell(battle, dealt);
      dealt = 0;
    }

    if (dealt !== 0) {
      tryContactAbility(type, hadSub);
    }

    return {
      stop: dead || user.base.hp === 0 || (user.base.status === "slp" && !wasSleeping),
      event,
    };
  };

  if (self.id === "beatup") {
    beatUpFail = true;
    for (const poke of user.owner.team) {
      if (poke.status || !poke.hp) {
        continue;
      }

      beatUpFail = false;
      isCrit = false;
      battle.event({type: "beatup", name: poke.name});
      const {dmg} = battle.gen.getDamage({battle, user, target, move: self, isCrit});
      if (applyDamage(dmg, true).stop) {
        break;
      }
    }
  } else if (self.flag === DMF.double || self.flag === DMF.triple || self.flag === DMF.multi) {
    const counts = {
      [DMF.double]: 2,
      [DMF.triple]: 3,
      [DMF.multi]: battle.gen.rng.multiHitCount(battle),
    };

    const count = counts[self.flag];
    let power = self.power;
    let event;
    let stop = false;
    let hits = 1;
    do {
      if (event) {
        event.hitCount = 0;
      }
      ({event, stop} = applyDamage(dmg, true));
      event.hitCount = hits + 1;
      if (self.flag === DMF.triple && !stop) {
        if (!battle.checkAccuracy(self, user, target, !special)) {
          // TODO: lazy
          battle.events.splice(-1, 1);
          break;
        }
        power += self.power;
      }

      isCrit = battle.gen.rollCrit(battle, user, target, self);
      ({dmg} = battle.gen.getDamage({battle, user, target, move: self, isCrit, power}));
    } while (!stop && hits++ <= count);
  } else {
    applyDamage(dmg, false);
  }

  // TODO: should bide include damage taken by a substitute?
  if (!hadSub && target.v.bide) {
    target.v.bide.dmg += dealt;
  }

  target.v.lastHitBy = {move: self, poke: user, type};

  if (
    user.base.hp &&
    self.recoil &&
    (self === battle.gen.moveList.struggle || !user.hasAbility("rockhead"))
  ) {
    user.damage(Math.max(Math.floor(dealt / self.recoil), 1), user, battle, false, "recoil", true);
  }

  if (user.base.hp && self.flag === DMF.drain) {
    user.recover(Math.max(Math.floor(dealt / 2), 1), target, battle, "drain");
  } else if (self.id === "payday") {
    battle.info(user, "payday");
  } else if (self.flag === DMF.remove_hazards && user.base.hp) {
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
  } else if (self.clearTargetStatus && !hadSub && target.base.status === self.clearTargetStatus) {
    target.base.status = undefined;
    battle.event({
      type: "cure",
      src: target.id,
      status: self.clearTargetStatus,
      volatiles: [{id: target.id, v: {status: null, stats: target.clientStats(battle)}}],
    });
  }

  if (endured) {
    target.handleEndure(battle, Endure.Endure);
  } else if (band) {
    target.handleEndure(battle, Endure.FocusBand);
  }

  if (self.flag === DMF.recharge) {
    user.v.recharge = {move: self, target};
  }

  if (beatUpFail) {
    // beat up failure
    battle.info(user, "fail_generic");
  } else if (!hadSub) {
    target.v.hasFocus = false;
  }

  if (self.flag === DMF.trap && !hadSub && target.base.hp) {
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

  if (self.id === "uproar" && !user.v.thrashing) {
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
