import type {Move, MoveScripts, MoveId, MovePropOverrides} from "../moves";
import {thunderAccOverride} from "../moves";
import {stageKeys, Range} from "../utils";

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
  razorwind: {flag: "high_crit"},
  rockslide: {effect: [30, "flinch"]},
  rockthrow: {acc: 90},
  sandattack: {type: "ground"},
  selfdestruct: {power: 200},
  skullbash: {charge: [["def", +1]]},
  sludge: {effect: [30, "psn"]},
  stomp: {flag: "minimize"},
  struggle: {recoil: 4, pp: 1},
  thunder: {ignore: ["fly", "bounce", "skydrop"], effect: [30, "par"]},
  triattack: {effect: [20, "tri_attack"]},
  wingattack: {power: 60},
};
