import {
  getLowKickPower,
  type Move,
  type MoveScripts,
  type MoveId,
  type MovePropOverrides,
  type DamagingMove,
} from "../moves";
import {HP_TYPES, idiv, VF, Range, DMF, Endure, hazards, type Type} from "../utils";
import type {ActivePokemon, Battle} from "../battle";
import {doBeatUp} from "../gen2/moves";
import type {Status} from "../pokemon";
import {abilityList} from "../species";

export const moveScripts: Partial<MoveScripts> = {
  weather(battle, user) {
    if (battle.weather?.kind === this.weather) {
      return battle.info(user, "fail_generic");
    }
    battle.setWeather(this.weather, 5);
  },
  recover(battle, user) {
    const diff = user.base.stats.hp - user.base.hp;
    if (diff === 0) {
      return battle.info(user, "fail_generic");
    }

    if (this.why === "rest") {
      if (user.getAbility()?.preventsStatus === "slp" || user.base.status === "slp") {
        return battle.info(user, "fail_generic");
      } else if (battle.hasUproar(user)) {
        return battle.info(user, "fail_generic");
      }

      user.base.status = "slp";
      user.base.sleepTurns = 3;
      if (user.hasAbility("earlybird")) {
        user.base.sleepTurns--;
      }
      user.v.counter = 0;
      user.recover(diff, user, battle, this.why, true);
    } else {
      let amount = Math.floor(user.base.stats.hp / 2);
      if (this.weather) {
        const weather = battle.getWeather();
        if (weather === "sun") {
          amount = Math.floor((user.base.stats.hp * 2) / 3);
        } else if (weather) {
          amount = Math.floor(user.base.stats.hp / 4);
        }
      }
      user.recover(amount, user, battle, this.why);
    }
  },
  phaze(battle, user, [target]) {
    const next = battle.rng.choice(
      target.owner.team.filter(p => p.hp && target.owner.active.every(a => p !== a.base.real)),
    );
    if (!next) {
      return battle.info(user, "fail_generic");
    } else if (target.hasAbility("suctioncups")) {
      battle.ability(target);
      return battle.info(target, "immune");
    } else if (target.v.hasFlag(VF.ingrain)) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.switchTo(next, battle, user);
  },
  protect(battle, user) {
    if (battle.turnOrder.at(-1) === user) {
      user.v.protectCount = 0;
      return battle.info(user, "fail_generic");
    }

    const table = [65535, 32767, 16383, 8191];
    // gen 3 never caps the protectCount and happily indexes oob past the 3rd protect.
    if (battle.rng.int(0, 65535) > table[Math.min(user.v.protectCount, 3)]) {
      user.v.protectCount = 0;
      return battle.info(user, "fail_generic");
    }

    user.v.protectCount++;
    if (!this.endure) {
      battle.info(user, "protect", [user.setFlag(VF.protect)]);
    } else {
      battle.info(user, "endure", [user.setFlag(VF.endure)]);
    }
  },
  //
  psychup(battle, user, [target]) {
    if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    user.v.stages = {...target.v.stages};
    battle.event({
      type: "psych_up",
      src: user.id,
      target: target.id,
      volatiles: [{id: user.id, v: {stats: user.clientStats(battle), stages: {...user.v.stages}}}],
    });
  },
  spite(battle, user, [target]) {
    if (!battle.checkAccuracy(this, user, target)) {
      return;
    } else if (target.v.lastMoveIndex === undefined) {
      return battle.info(user, "fail_generic");
    } else if (target.base.pp[target.v.lastMoveIndex] === 1) {
      return battle.info(user, "fail_generic");
    }

    const amount = Math.min(battle.rng.int(2, 5), target.base.pp[target.v.lastMoveIndex]);
    target.base.pp[target.v.lastMoveIndex] -= amount;
    battle.event({
      type: "spite",
      src: target.id,
      move: target.base.moves[target.v.lastMoveIndex],
      amount,
    });
  },
};

export const moveOverrides: Partial<MovePropOverrides> = {
  dmg: {
    psywave(battle, user) {
      return Math.max(1, Math.floor((user.base.level * (10 * battle.rng.int(0, 10) + 50)) / 100));
    },
  },
  pow: {
    frustration: user => Math.max(1, idiv(255 - user.friendship, 2.5)),
    hiddenpower(user) {
      const v =
        ((user.ivs.hp >> 1) & 1) |
        (((user.ivs.atk >> 1) & 1) << 1) |
        (((user.ivs.def >> 1) & 1) << 2) |
        (((user.ivs.spe >> 1) & 1) << 3) |
        (((user.ivs.spa >> 1) & 1) << 4) |
        (((user.ivs.spd >> 1) & 1) << 5);
      return Math.floor((v * 40) / 63) + 30;
    },
    lowkick: (_user, target) => getLowKickPower(target.species.weight),
    return: user => Math.max(1, idiv(user.friendship, 2.5)),
  },
  type: {
    hiddenpower(user) {
      const v =
        (user.ivs.hp & 1) |
        ((user.ivs.atk & 1) << 1) |
        ((user.ivs.def & 1) << 2) |
        ((user.ivs.spe & 1) << 3) |
        ((user.ivs.spa & 1) << 4) |
        ((user.ivs.spd & 1) << 5);
      return HP_TYPES[Math.floor((v * 15) / 63) % HP_TYPES.length];
    },
  },
};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  absorb: {kingsRock: false},
  bind: {kingsRock: true},
  bodyslam: {effect: [30, "par"]},
  clamp: {kingsRock: true},
  conversion2: {protect: false},
  counter: {priority: -5, kingsRock: false},
  detect: {priority: +3},
  doubleedge: {recoil: 3},
  dragonbreath: {kingsRock: true},
  dragonrage: {kingsRock: true},
  earthquake: {kingsRock: true},
  endure: {priority: +3},
  firespin: {kingsRock: true},
  flail: {flag: DMF.none},
  gigadrain: {kingsRock: false},
  gust: {kingsRock: true},
  hyperbeam: {kingsRock: true},
  icywind: {effect: [100, [["spe", -1]]]},
  leechlife: {kingsRock: false},
  lowkick: {acc: 100, effect: [0, "flinch"], power: 0},
  meanlook: {protect: true},
  megadrain: {kingsRock: false},
  metronome: {noEncore: false, noSleepTalk: true},
  mimic: {acc: 0},
  mirrorcoat: {priority: -5},
  mirrormove: {noSleepTalk: true},
  mist: {kind: "screen", screen: "mist", range: Range.Field},
  mudslap: {effect: [100, [["acc", -1]]]},
  nightmare: {protect: true},
  painsplit: {acc: 0},
  present: {kingsRock: false},
  protect: {priority: +3},
  pursuit: {kingsRock: false},
  razorwind: {acc: 100},
  reversal: {flag: DMF.none},
  roar: {priority: -6},
  rollingkick: {kingsRock: true},
  skyattack: {flag: DMF.high_crit, effect: [30, "flinch"]},
  sleeptalk: {noEncore: false},
  spiderweb: {protect: true},
  spikes: {max: 3},
  steelwing: {kingsRock: true},
  superfang: {kingsRock: false},
  thief: {effect: [100, "thief"], kingsRock: false},
  twineedle: {kingsRock: false},
  twister: {kingsRock: true},
  whirlpool: {kingsRock: true},
  whirlwind: {priority: -6},
  wrap: {kingsRock: true},
  zapcannon: {effect: [100, "par"]},
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
  // From testing, Counter failure takes priority over Protect, Protect activated before Wonder Guard,
  // and Wonder Guard activated before ghost type immunity.
  if (miss) {
    battle.info(user, "fail_generic");
    return didMiss(false, dmg);
  } else if (protect) {
    battle.info(target, "protect");
    return didMiss(true, dmg);
  } else if (battle.gen.tryAbilityImmunity(battle, user, target, self, type, eff)) {
    return didMiss(false, dmg);
  } else if (eff === 0) {
    battle.info(target, "immune");
    return didMiss(false, dmg);
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

  const applyDamage = (dmg: number, doShellBell: bool) => {
    hadSub = target.v.substitute !== 0;
    const deadly = dmg >= target.base.hp;
    if (deadly && !band && target.base.itemId === "focusband") {
      band = battle.gen.rng.tryFocusBand(battle);
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

    return {
      stop: dead || user.base.hp === 0 || (user.base.status === "slp" && !wasSleeping),
      event,
    };
  };

  if (self.id === "beatup") {
    beatUpFail = doBeatUp(self, battle, user, target, dmg => applyDamage(dmg, true));
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

  if (handledShellBell) {
    dealt = 0;
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
