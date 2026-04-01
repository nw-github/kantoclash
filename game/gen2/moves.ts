import type {Move, MoveScripts, MoveId, MovePropOverrides, DamagingMove} from "../moves";
import {thunderAccOverride} from "../moves";
import {stageKeys, Range, DMF, hazards, VF} from "../utils";
import type {ActivePokemon, Battle} from "../battle";

export const moveScripts: Partial<MoveScripts> = {
  recover(battle, user) {
    const diff = user.base.stats.hp - user.base.hp;
    if (diff === 0) {
      return battle.info(user, "fail_generic");
    }

    if (this.why === "rest") {
      user.base.status = "slp";
      user.base.sleepTurns = 3;
      user.v.counter = 0;
      user.recover(diff, user, battle, this.why, true);
    } else {
      let amount = Math.floor(user.base.stats.hp / 2);
      if (this.weather && !battle.getWeather()) {
        amount = Math.floor(user.base.stats.hp / 4);
      } else if (this.weather && !battle.hasWeather("sun")) {
        amount = Math.floor(user.base.stats.hp / 8);
      }
      user.recover(Math.max(1, amount), user, battle, this.why);
    }
  },
  status(battle, user, targets) {
    let failed = true;
    for (const target of targets) {
      if (battle.tryMagicBounce(this, user, target)) {
        return;
      } else if (target.v.substitute || (battle.hasUproar(target) && this.status === "slp")) {
        continue;
      } else if (
        (this.checkType && battle.gen.getEffectiveness(this.type, target.v.types) === 0) ||
        ((this.status === "psn" || this.status === "tox") &&
          target.v.hasAnyType("poison", "steel")) ||
        (this.status === "brn" && target.v.types.includes("fire"))
      ) {
        battle.info(target, "immune");
        failed = false;
        continue;
      } else if (target.owner.screens.safeguard) {
        battle.info(target, "safeguard_protect");
        failed = false;
        continue;
      } else if (!battle.checkAccuracy(this, user, target)) {
        failed = false;
        continue;
      }

      target.status(this.status, battle, user, {override: false, loud: true});
      failed = false;
    }

    if (failed) {
      battle.info(user, "fail_generic");
    }
  },
  //
  substitute(battle, user) {
    const hp = Math.floor(user.base.stats.hp / 4);
    if (user.v.substitute) {
      return battle.info(user, "has_substitute");
    } else if (hp >= user.base.hp) {
      return battle.info(user, "cant_substitute");
    }

    user.v.substitute = hp;
    user.damage(hp, user, battle, false, "substitute", true, undefined, [
      {id: user.id, v: {flags: user.v.cflags}},
    ]);
  },
  conversion(battle, user) {
    const type = battle.rng.choice(
      user.base.moves
        .map(move => battle.gen.moveList[move].type)
        .filter(type => type !== "???" && !user.v.types.includes(type)),
    );
    if (!type) {
      battle.info(user, "fail_generic");
      return;
    }

    const v = user.setVolatile("types", [type]);
    battle.event({type: "conversion", src: user.id, types: [type], volatiles: [v]});
  },
  disable(this: Move, battle, user, [target]) {
    if (target.v.disabled || !target.v.lastMove || target.v.lastMove.id === "struggle") {
      battle.info(user, "fail_generic");
      return;
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    const indexInMoves = target.v.lastMoveIndex!;

    target.v.disabled = {indexInMoves, turns: battle.gen.rng.disableTurns(battle)};
    battle.event({
      type: "disable",
      src: target.id,
      move: target.base.moves[indexInMoves],
      volatiles: [{id: target.id, v: {flags: target.v.cflags}}],
    });
  },
  haze(battle, user, targets) {
    for (const target of targets) {
      for (const k of stageKeys) {
        user.setStage(k, 0, battle, false);
        target.setStage(k, 0, battle, false);
      }
    }

    battle.info(
      user,
      "haze",
      targets.map(t => ({id: t.id, v: {stages: null, stats: t.clientStats(battle)}})),
    );
  },
  transform(this: Move, battle, user, [target]) {
    if (target.base.transformed) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }
    user.transform(battle, target);
  },
  mimic(this: Move, battle, user, [target], indexInMoves) {
    const lastMove = target.v.lastMove;
    const move = lastMove?.id;
    if (!move || lastMove.noMimic || user.moveset().includes(move)) {
      return battle.info(user, "fail_generic");
    }

    if (!battle.checkAccuracy(this, user, target)) {
      return false;
    }

    // TODO: mimic PP
    user.v.mimic = {indexInMoves: indexInMoves ?? user.v.lastMoveIndex ?? -1, move};
    battle.event({type: "mimic", src: user.id, move});
    return false;
  },
};

export const moveOverrides: Partial<MovePropOverrides> = {
  dmg: {
    counter(battle, user) {
      const lastHit = user.v.lastHitBy;
      if (!lastHit || battle.gen.isSpecial(lastHit.move, lastHit.type, true)) {
        return 0;
      }
      return Math.min(user.v.retaliateDamage << 1, 0xffff);
    },
    bide: (_battle, user) => Math.min((user.v.bide?.dmg ?? 0) << 1, 0xffff),
  },
  acc: {
    thunder: thunderAccOverride,
  },
};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  bide: {acc: 100, power: 0},
  conversion: {range: Range.Self},
  mimic: {noMetronome: true},
  // --
  roar: {kind: "phaze", acc: 100, priority: -1},
  whirlwind: {kind: "phaze", acc: 100, priority: -1, ignore: ["fly"]},
  // --
  lightscreen: {kind: "screen", screen: "light_screen", range: Range.Field},
  reflect: {kind: "screen", screen: "reflect", range: Range.Field},
  // --
  amnesia: {stages: [["spd", 2]]},
  glare: {checkType: true},
  thunderwave: {checkType: true},
  // --
  acid: {effect: [10, [["def", -1]]]},
  aurorabeam: {effect: [10, [["atk", -1]]]},
  bite: {type: "dark", effect: [30, "flinch"]},
  blizzard: {acc: 70},
  bubble: {effect: [10, [["spe", -1]]]},
  bubblebeam: {effect: [10, [["spe", -1]]]},
  constrict: {effect: [10, [["spe", -1]]]},
  counter: {noMetronome: true},
  dig: {power: 60},
  dizzypunch: {effect: [20, "confusion"]},
  doubleedge: {power: 120},
  earthquake: {ignore: ["dig"], punish: true},
  explosion: {power: 250},
  fireblast: {effect: [10, "brn"]},
  fissure: {ignore: ["dig"]},
  gust: {type: "flying", ignore: ["fly", "bounce", "skydrop"]},
  karatechop: {type: "fight"},
  poisonsting: {effect: [30, "psn"]},
  psychic: {effect: [10, [["spd", -1]]]},
  razorwind: {flag: DMF.high_crit},
  rockslide: {effect: [30, "flinch"]},
  rockthrow: {acc: 90},
  sandattack: {type: "ground"},
  selfdestruct: {power: 200},
  skullbash: {charge: [["def", +1]]},
  sludge: {effect: [30, "psn"]},
  stomp: {flag: DMF.minimize},
  struggle: {recoil: 4, pp: 1},
  thunder: {ignore: ["fly", "bounce", "skydrop"], effect: [30, "par"]},
  triattack: {effect: [20, "tri_attack"]},
  wingattack: {power: 60},
};

export function doBeatUp(
  move: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  applyDamage: (dmg: number) => {stop: bool},
) {
  let beatUpFail = true;
  for (const poke of user.owner.team) {
    if (poke.status || !poke.hp) {
      continue;
    }

    battle.event({type: "beatup", name: poke.name});

    beatUpFail = false;
    const {dmg} = battle.gen.getDamage({battle, user, target, move, isCrit: false, beatUp: poke});
    if (applyDamage(dmg).stop) {
      break;
    }
  }
  return beatUpFail;
}

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
      if (!user.owner.screens.safeguard && self.flag === DMF.multi_turn) {
        user.confuse(battle, user.v.thrashing.max ? "fatigue_confuse_max" : "fatigue_confuse");
      }
      user.v.thrashing = undefined;
    }
  };

  if (self.flag === DMF.explosion) {
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
    power,
  });
  if (eff === 0 || miss || protect) {
    user.v.furyCutter = 0;
    if (user.v.thrashing?.move?.flag === DMF.rollout) {
      user.v.thrashing = undefined;
    }

    if (eff === 0) {
      battle.info(target, "immune");
    } else if (miss) {
      battle.miss(user, target);
    } else if (protect) {
      battle.info(target, "protect");
      if (self.flag === DMF.crash) {
        battle.gen.handleCrashDamage(battle, user, target, dmg);
      }
    }
    checkThrashing();
    return 0;
  } else if (!battle.checkAccuracy(self, user, target, !battle.gen.isSpecial(self, type))) {
    if (user.v.thrashing?.move?.flag === DMF.rollout) {
      user.v.thrashing = undefined;
    }

    user.v.furyCutter = 0;
    if (self.flag === DMF.crash) {
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    } else if (self.flag === DMF.ohko && self !== battle.gen.moveList.guillotine) {
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
  let why = self.flag === DMF.ohko ? ("ohko" as const) : ("attacked" as const);

  // command BattleCommand_ApplyDamage
  const applyDamage = (dmg: number) => {
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

    let event;
    ({dead, event, dealt} = target.damage2(battle, {
      dmg,
      src: user,
      why,
      isCrit,
      eff: self.id === "beatup" ? 1 : eff,
    }));
    return {stop: dead, event};
  };

  if (self.id === "beatup") {
    beatUpFail = doBeatUp(self, battle, user, target, applyDamage);
  } else if (self.flag === DMF.double || self.flag === DMF.triple || self.flag === DMF.multi) {
    const counts = {
      [DMF.double]: 2,
      [DMF.triple]: battle.rng.int(1, 3),
      [DMF.multi]: battle.gen.rng.multiHitCount(battle),
    };

    const count = counts[self.flag];
    let dmg,
      event,
      stop = false;
    for (let hits = 1; !stop && hits <= count; hits++) {
      isCrit = battle.gen.rollCrit(battle, user, target, self);
      ({dmg} = battle.gen.getDamage({
        battle,
        user,
        target,
        move: self,
        isCrit,
        power,
        tripleKick: self.flag === DMF.triple ? hits : 1,
      }));
      if (event) {
        event.hitCount = 0;
      }
      ({stop, event} = applyDamage(dmg));
      event.hitCount = hits + 1;
    }
  } else {
    applyDamage(dmg);
  }

  if (!hadSub && target.v.bide) {
    target.v.bide.dmg += dealt;
  }

  target.v.lastHitBy = {move: self, poke: user, type};

  checkThrashing();
  if (user.base.hp && self.recoil) {
    user.damage(Math.max(Math.floor(dealt / self.recoil), 1), user, battle, false, "recoil", true);
  }

  if (self.flag === DMF.drain) {
    user.recover(Math.max(Math.floor(dealt / 2), 1), target, battle, "drain");
  } else if (self.id === "payday") {
    battle.info(user, "payday");
  } else if (self.flag === DMF.remove_hazards) {
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

  if (self.flag === DMF.recharge) {
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

  if (self.flag === DMF.trap && !hadSub) {
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
