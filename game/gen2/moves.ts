import {Range, type Move, type MoveFunctions, type MoveId} from "../moves";
import {isSpecial, stageKeys} from "../utils";
import {exec as execDamagingMove} from "./damaging";

/*
https://bulbapedia.bulbagarden.net/wiki/Dig_(move)
In Generation II only, due to a glitch, when Lock-On or Mind Reader are in effect, the moves Attract, Curse, Foresight, Mean Look, Mimic, Nightmare, Spider Web, and Transform cannot hit targets in the semi-invulnerable turn of Dig, and moves cannot lower stats of targets in the semi-invulnerable turn of Dig (status moves such as String Shot will fail, and additional effects of moves such as Bubble will not activate).

https://bulbapedia.bulbagarden.net/wiki/Metronome_(move)
pp rollover

https://bulbapedia.bulbagarden.net/wiki/Mimic_(move)
has 5 pp like transform

https://bulbapedia.bulbagarden.net/wiki/Solar_Beam_(move)
If the user is prevented from attacking with SolarBeam during harsh sunlight by conditions such as flinching, paralysis, and confusion, then PP will still be deducted regardless, due to the fact that SolarBeam was designed as a two-turn attack.

In this generation only, Mirror Move always fails when used by a transformed Pokémon.

Mimic
*/

// Does 10% chance mean 10.2 /* 26/256 */ like in gen 1?

export const moveFunctionPatches: Partial<MoveFunctions> = {
  recover(battle, user) {
    const diff = user.base.stats.hp - user.base.hp;
    if (diff === 0) {
      return battle.info(user, "fail_generic");
    }

    if (this.why === "rest") {
      user.clearStatusAndRecalculate(battle);
      user.base.status = "slp";
      user.base.sleepTurns = 3;
      user.v.counter = 0;
      user.recover(diff, user, battle, this.why, true);
    } else {
      let amount = Math.floor(user.base.stats.hp / 2);
      if (this.weather && !battle.weather) {
        amount = Math.floor(user.base.stats.hp / 4);
      } else if (this.weather && battle.weather?.kind !== "sun") {
        amount = Math.floor(user.base.stats.hp / 8);
      }
      user.recover(amount, user, battle, this.why);
    }
  },
  status(battle, user, [target]) {
    if (target.v.substitute) {
      return battle.info(target, "fail_generic");
    } else if (
      (this.checkType && battle.getEffectiveness(this.type, target) === 0) ||
      ((this.status === "psn" || this.status === "tox") &&
        target.v.types.some(t => t === "poison" || t === "steel"))
    ) {
      return battle.info(target, "immune");
    } else if (target.owner.screens.safeguard) {
      return battle.info(target, "safeguard_protect");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    if (!target.status(this.status, battle)) {
      battle.info(target, "fail_generic");
    }
  },
  damage: execDamagingMove,
};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  bide: {acc: 100, power: 0},
  conversion: {
    range: Range.Self,
    exec(battle, user) {
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
  },
  disable: {
    exec(this: Move, battle, user, [target]) {
      if (
        target.v.disabled ||
        !target.v.lastMove ||
        battle.moveIdOf(target.v.lastMove) === "struggle"
      ) {
        battle.info(user, "fail_generic");
        return;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      const indexInMoves = target.v.lastMoveIndex!;

      target.v.disabled = {indexInMoves, turns: battle.rng.int(2, 8) + 1};
      battle.event({
        type: "disable",
        src: target.id,
        move: target.base.moves[indexInMoves],
        volatiles: [{id: target.id, v: {flags: target.v.cflags}}],
      });
    },
  },
  haze: {
    exec(battle, user, targets) {
      for (const target of targets) {
        for (const k of stageKeys) {
          user.setStage(k, 0, battle, false);
          target.setStage(k, 0, battle, false);
        }
      }

      battle.info(
        user,
        "haze",
        targets.map(user => ({id: user.id, v: {stages: null, stats: user.clientStats(battle)}})),
      );
    },
  },
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
  counter: {
    power: 0,
    noMetronome: true,
    getDamage(battle, user, target) {
      if (
        !user.v.retaliateDamage ||
        !target.v.lastMove ||
        (isSpecial(target.v.lastMove.type) && target.v.lastMove !== battle.gen.moveList.beatup)
      ) {
        return false;
      }

      return user.v.retaliateDamage * 2;
    },
  },
  dig: {power: 60},
  dizzypunch: {effect: [20, "confusion"]},
  doubleedge: {power: 120},
  earthquake: {ignore: ["dig"], punish: true},
  explosion: {power: 250},
  fireblast: {effect: [10, "brn"]},
  fissure: {ignore: ["dig"]},
  gust: {type: "flying", ignore: ["fly", "bounce"]},
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
  struggle: {type: "???", recoil: 4, pp: 1},
  thunder: {ignore: ["fly", "bounce"], effect: [30, "par"], rainAcc: true},
  triattack: {effect: [20, "tri_attack"]},
  wingattack: {power: 60},
};
