import type {Move, MoveFunctions, MoveId} from "../moves";
import {stageKeys} from "../utils";
import {exec as execDamagingMove} from "./damaging";

// FLAG: multi | final strike only kings rock
// FLAG: thief | implement

/*
https://bulbapedia.bulbagarden.net/wiki/Bide_(move)

https://bulbapedia.bulbagarden.net/wiki/Dig_(move)
In Generation II only, due to a glitch, when Lock-On or Mind Reader are in effect, the moves Attract, Curse, Foresight, Mean Look, Mimic, Nightmare, Spider Web, and Transform cannot hit targets in the semi-invulnerable turn of Dig, and moves cannot lower stats of targets in the semi-invulnerable turn of Dig (status moves such as String Shot will fail, and additional effects of moves such as Bubble will not activate).

https://bulbapedia.bulbagarden.net/wiki/Metronome_(move)
pp rollover

https://bulbapedia.bulbagarden.net/wiki/Mimic_(move)
has 5 pp like transform

https://bulbapedia.bulbagarden.net/wiki/Solar_Beam_(move)
If the user is prevented from attacking with SolarBeam during harsh sunlight by conditions such as flinching, paralysis, and confusion, then PP will still be deducted regardless, due to the fact that SolarBeam was designed as a two-turn attack.

In this generation only, Mirror Move always fails when used by a transformed Pokémon.

leech seed doesn't interact with toxic N and drains 1/8

Bide
*/

// Does 10% chance mean 10.2 /* 26/256 */ like in gen 1?

export const moveFunctionPatches: Partial<MoveFunctions> = {
  recover: {
    exec(battle, user) {
      const diff = user.base.stats.hp - user.base.hp;
      if (diff === 0) {
        return battle.info(user, "fail_generic");
      }

      if (this.why === "rest") {
        user.clearStatusAndRecalculate();
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
  },
  status: {
    exec(battle, user, target) {
      if (target.v.substitute) {
        return battle.info(target, "fail_generic");
      } else if (
        battle.getEffectiveness(this.type, target) === 0 ||
        (this.status === "psn" && target.v.types.includes("poison"))
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
  },
  damage: {
    exec: execDamagingMove,
  },
};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  bide: {acc: 100},
  conversion: {
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
      battle.event({type: "conversion", src: user.owner.id, types: [type], volatiles: [v]});
    },
  },
  disable: {
    exec(this: Move, battle, user, target) {
      target.lastDamage = 0;

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
        src: target.owner.id,
        move: target.base.moves[indexInMoves],
        volatiles: [{id: target.owner.id, v: {flags: target.v.flags}}],
      });
    },
  },
  haze: {
    exec(battle, user, target) {
      for (const k of stageKeys) {
        user.setStage(k, 0, battle, false);
        target.setStage(k, 0, battle, false);
      }

      battle.info(user, "haze", [
        {id: user.owner.id, v: {stages: null, stats: {...user.v.stats}}},
        {id: target.owner.id, v: {stages: null, stats: {...target.v.stats}}},
      ]);
    },
  },
  mimic: {noMetronome: true},
  // --
  counter: {
    kind: "retaliate",
    name: "Counter",
    pp: 20,
    type: "fight",
    acc: 100,
    priority: -1,
    noMetronome: true,
    special: false,
  },
  // --
  roar: {kind: "phaze", acc: 100, priority: -1},
  whirlwind: {kind: "phaze", acc: 100, priority: -1, ignore: ["fly"]},
  // --
  lightscreen: {kind: "screen", screen: "light_screen"},
  reflect: {kind: "screen", screen: "reflect"},
  // --
  amnesia: {stages: [["spd", 2]]},
  // --
  acid: {effect: [10, [["def", -1]]]},
  aurorabeam: {effect: [10, [["atk", -1]]]},
  bite: {type: "dark", effect: [30, "flinch"]},
  blizzard: {acc: 70},
  bubble: {effect: [10, [["spe", -1]]]},
  bubblebeam: {effect: [10, [["spe", -1]]]},
  constrict: {effect: [10, [["spe", -1]]]},
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
  thunder: {ignore: ["fly", "bounce"], effect: [30, "par"]},
  triattack: {flag: "tri_attack"},
  wingattack: {power: 60},
};
