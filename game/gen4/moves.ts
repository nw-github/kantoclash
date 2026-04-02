import type {Move, MoveScripts, MoveId, MovePropOverrides, DamagingMove} from "../moves";
import type {ActivePokemon, Battle} from "../battle";
import type {Status} from "../pokemon";
import {DMF, Range, Endure, hazards, idiv, VF, type Type} from "../utils";
import {doBeatUp} from "../gen2/moves";
import {abilityList} from "../species";

/**
 * TODO:
 * Flags: bugbite, assurance
 * DamagingMove: ignoreType
 *
 * If Bide is called through another move, it will have +0 priority on its subsequent turns.
 *
 * Pursuit into u-turn
 */

export const moveScripts: Partial<MoveScripts> = {};

export const moveOverrides: Partial<MovePropOverrides> = {
  acc: {
    blizzard(weather) {
      return weather === "hail" ? undefined : this.acc;
    },
  },
};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  acid: {effect: [10, [["spd", -1]]]},
  ancientpower: {contact: false},
  astonish: {flag: DMF.none},
  bide: {ignoreType: true, acc: 0, priority: +1},
  covet: {contact: true},
  crunch: {effect: [20, [["def", -1]]]},
  dig: {power: 80},
  disable: {acc: 80},
  dive: {power: 80},
  dragonrage: {kingsRock: false},
  extrasensory: {flag: DMF.none},
  fakeout: {contact: true},
  feintattack: {contact: true},
  flash: {acc: 100},
  foresight: {acc: 0},
  glare: {checkType: false},
  gust: {kingsRock: false},
  hijumpkick: {power: 100},
  jumpkick: {power: 85},
  kinesis: {magicCoat: true},
  leafblade: {power: 90},
  lockon: {acc: 0},
  megadrain: {pp: 15},
  memento: {acc: 100},
  mindreader: {acc: 0},
  naturepower: {calls: "triattack"},
  needlearm: {flag: DMF.none},
  nightmare: {acc: 100},
  odorsleuth: {acc: 0},
  outrage: {power: 120},
  overheat: {contact: false},
  petaldance: {power: 90},
  pound: {kingsRock: false},
  recover: {pp: 10},
  rocksmash: {power: 40},
  struggle: {acc: 0},
  surf: {range: Range.AllAdjacent},
  tickle: {ignoreSub: false},
  transform: {noMimic: false},
  vinewhip: {pp: 15},
  volttackle: {effect: [10, "par"]},
  waterfall: {effect: [20, "flinch"]},
  zapcannon: {power: 120},
};

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
    } else if (poke.getAbility(poke === user ? undefined : user)?.preventsStatus === status) {
      return true;
    } else if (status === "slp" && battle.hasUproar(poke)) {
      return true;
    } else {
      return false;
    }
  };

  const tryContactAbility = (type: Type, hadSub: bool) => {
    const targetAbilityId = target.getAbilityId(user);
    const targetAbility = abilityList[targetAbilityId!];
    if (
      user.base.item?.kingsRock &&
      self.kingsRock &&
      !hadSub &&
      targetAbilityId !== "innerfocus" &&
      target.base.status !== "frz" &&
      target.base.status !== "slp" &&
      battle.gen.rng.tryKingsRock(battle)
    ) {
      target.v.flinch = true;
    }

    // In Gen IV, Anger Point works even if the crit hits a substitute
    if (isCrit && target.base.hp && targetAbilityId === "angerpoint" && target.v.stages.atk < 6) {
      battle.ability(target);
      battle.info(target, "atk_maximize", target.setStage("atk", +6, battle, false));
      return;
    }

    // TODO: test if color change activates before move secondary effect
    if (
      !hadSub &&
      target.base.hp &&
      targetAbilityId === "colorchange" &&
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

    let status = targetAbility?.contactStatus;
    if (targetAbilityId === "effectspore") {
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
    } else if (targetAbility?.roughSkin) {
      battle.ability(target);
      user.damage2(battle, {
        dmg: Math.max(1, idiv(user.base.stats.hp, 8)),
        src: target,
        why: "roughskin",
      });
    }
  };

  const didMiss = (crash: bool, dmg: number) => {
    user.v.furyCutter = 0;
    user.v.thrashing = undefined;
    if (self.id === "spitup") {
      battle.sv([user.setVolatile("stockpile", 0)]);
    }
    if (crash && self.flag === DMF.crash) {
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    }
    return 0;
  };

  const rollEffects = (hadSub: bool) => {
    for (const eff of [self.effect, self.effect2]) {
      if (!eff) {
        continue;
      }

      // eslint-disable-next-line prefer-const
      let [chance, effect, effectSelf] = eff;
      if ((!effectSelf && !target.base.hp) || (effectSelf && !user.base.hp)) {
        continue;
      }

      if (user.hasAbility("serenegrace")) {
        chance *= 2;
      }
      if (target.hasAbility("shielddust", user) && !effectSelf && effect !== "thief") {
        continue;
      }

      if (effect === "tri_attack") {
        effect = battle.rng.choice(["brn", "par", "frz"] as const)!;
      }

      // Fire-type hidden power does not thaw in Gen 3
      if (self.type === "fire" && target.base.status === "frz") {
        target.unstatus(battle, "thaw");
        // TODO: can you thaw and then burn?
        continue;
      } else if (!battle.rand100(chance) || (hadSub && !effectSelf)) {
        continue;
      }

      if (effect === "confusion") {
        if (
          !target.v.confusion &&
          !user.owner.screens.safeguard &&
          !target.hasAbility("owntempo", user)
        ) {
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

        if (!target.hasAbility("innerfocus", user)) {
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
          target.base.itemId === "griseousorb" ||
          target.hasAnyAbility("stickyhold", "multitype")
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
        if (
          target.base.itemId &&
          target.base.itemId !== "griseousorb" &&
          !target.hasAnyAbility("stickyhold", "multitype")
        ) {
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
    }
  };

  if (self.flag === DMF.explosion) {
    // Explosion into destiny bond, who dies first?
    user.damage(user.base.hp, user, battle, false, "explosion", true);
  } else if (self.flag === DMF.remove_screens) {
    for (const screen of ["light_screen", "reflect"] as const) {
      if (target.owner.screens[screen]) {
        target.owner.screens[screen] = 0;
        battle.event({type: "screen", user: target.owner.id, screen, kind: "shattered"});
      }
    }
  }

  const protect = target.v.hasFlag(VF.protect) && self.protect !== false;
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
  if (miss) {
    battle.info(user, "fail_generic");
    return didMiss(false, 0);
  } else if (protect) {
    battle.info(target, "protect");
    return didMiss(true, dmg);
  } else if (battle.gen.tryAbilityImmunity(battle, user, target, self, type, eff)) {
    return didMiss(true, dmg);
  } else if (eff === 0) {
    battle.info(target, "immune");
    return didMiss(true, dmg);
  } else if (!battle.checkAccuracy(self, user, target, !special)) {
    return didMiss(true, dmg);
  } else if (dmg < 0) {
    target.recover(dmg, user, battle, "present");
    return 0;
  }

  let hadSub = target.v.substitute !== 0,
    dealt = 0,
    endured = false,
    band = false,
    beatUpFail = false,
    handledShellBell = false;
  let why = self.flag === DMF.ohko ? ("ohko" as const) : ("attacked" as const);
  const wasSleeping = user.base.status === "slp";
  const wasFullHp = target.base.hp === target.base.stats.hp;

  const applyDamage = (dmg: number, doShellBell: bool) => {
    hadSub = target.v.substitute !== 0;

    const deadly = dmg >= target.base.hp;
    if (deadly && !band && target.base.itemId === "focusband") {
      band = battle.gen.rng.tryFocusBand(battle);
    } else if (deadly && !band && target.base.itemId === "focussash" && wasFullHp) {
      band = true;
    }

    if (deadly && target.v.hasFlag(VF.endure)) {
      endured = true;
    }

    // command falseswipe BattleCommand_FalseSwipe
    if (band || endured || (self.id === "falseswipe" && deadly)) {
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
      handledShellBell = true;
    }

    if (dealt !== 0) {
      tryContactAbility(type, hadSub);
    }

    rollEffects(hadSub);

    return {
      stop: dead || user.base.hp === 0 || (user.base.status === "slp" && !wasSleeping),
      event,
    };
  };

  if (self.id === "beatup") {
    beatUpFail = doBeatUp(self, battle, user, target, dmg => applyDamage(dmg, true));
  } else if (self.flag === DMF.double || self.flag === DMF.triple || self.flag === DMF.multi) {
    // Skill link doesn't affect Triple Kick until Gen V
    const counts = {
      [DMF.double]: 2,
      [DMF.triple]: 3,
      [DMF.multi]: user.hasAbility("skilllink") ? 5 : battle.gen.rng.multiHitCount(battle),
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
      event.hitCount = hits;
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
    } while (!stop && ++hits <= count);
  } else {
    applyDamage(dmg, false);
  }

  if (self.flag === DMF.remove_protect) {
    battle.sv([target.clearFlag(VF.protect)]);
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
    const recoil = self.id === "struggle" ? idiv(user.base.stats.hp, 4) : idiv(dealt, self.recoil);
    user.damage(Math.max(recoil, 1), user, battle, false, "recoil", true);
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
    if (target.base.itemId === "focussash") {
      target.handleEndure(battle, Endure.FocusSash);
    } else {
      target.handleEndure(battle, Endure.FocusBand);
    }
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
  } else if (self.id === "uproar" && !user.v.thrashing) {
    user.v.thrashing = {move: self, turns: battle.gen.rng.thrashDuration(battle), max: false};
    battle.info(user, "uproar");
  } else if (self.flag === DMF.uturn && user.base.hp && user.canBatonPass()) {
    user.v.inBatonPass = "uturn";
  }

  return handledShellBell ? 0 : dealt;
};
