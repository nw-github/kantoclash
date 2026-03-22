import {Range, type Move, type MoveFunctions, type MoveId} from "../moves";
import type {Pokemon} from "../pokemon";

export const moveFunctionPatches: Partial<MoveFunctions> = {};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  aquaring: {snatch: true},
  bind: {acc: 85},
  bonerush: {acc: 90},
  bulletseed: {power: 25},
  camouflage: {
    exec(battle, user) {
      battle.event({
        type: "conversion",
        types: ["ground"],
        src: user.id,
        volatiles: [user.setVolatile("types", ["ground"])],
      });
    },
  },
  clamp: {acc: 85, pp: 15},
  conversion: {snatch: true},
  cottonspore: {acc: 100},
  covet: {power: 60},
  crabhammer: {acc: 90},
  crushgrip: {getPower: getCrushGripPower},
  curse: {type: "ghost"},
  detect: {priority: +4},
  disable: {acc: 100},
  doomdesire: {power: 140, acc: 100},
  drainpunch: {power: 75, pp: 10},
  endure: {priority: +4},
  extremespeed: {priority: +2},
  fakeout: {priority: +3},
  feint: {power: 30},
  firespin: {power: 35, acc: 85},
  foresight: {magicCoat: true},
  furycutter: {power: 20},
  futuresight: {power: 100, acc: 100, pp: 10},
  glare: {acc: 90},
  gigadrain: {power: 75},
  hijumpkick: {power: 130, pp: 10},
  iciclespear: {power: 25},
  imprison: {snatch: true},
  jumpkick: {power: 100, pp: 10},
  lastresort: {power: 140},
  luckychant: {snatch: true},
  magmastorm: {acc: 75},
  magnetrise: {snatch: true},
  minimize: {stages: [["eva", +1]]},
  miracleeye: {magicCoat: true},
  naturepower: {
    exec(battle, user) {
      battle.callMove(battle.gen.moveList.earthquake, user);
    },
  },
  odorsleuth: {magicCoat: true},
  outrage: {pp: 10},
  petaldance: {power: 120, pp: 10},
  poisongas: {acc: 90, range: Range.AllAdjacentFoe},
  powertrick: {snatch: true},
  protect: {priority: +4},
  psychup: {snatch: false},
  rockblast: {acc: 90},
  sandtomb: {power: 35, acc: 85},
  scaryface: {acc: 100},
  tackle: {power: 50, acc: 100},
  tailglow: {stages: [["spa", +3]]},
  tailwind: {turns: 4 + 1},
  thrash: {power: 120, pp: 10},
  toxic: {acc: 90},
  uproar: {power: 90},
  whirlpool: {power: 35, acc: 85},
  wrap: {acc: 90},
  wringout: {getPower: getCrushGripPower},
};

function getCrushGripPower(_user: Pokemon, target: Pokemon) {
  return target ? Math.max(1, Math.floor(120 * (target.hp / target.stats.hp))) : 0;
}
