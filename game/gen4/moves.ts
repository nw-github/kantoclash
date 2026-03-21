import {Range, type Move, type MoveFunctions, type MoveId} from "../moves";

/**
 * TODO:
 * Flags: bugbite, assurance
 * DamagingMove: ignoreType
 *
 * If Bide is called through another move, it will have +0 priority on its subsequent turns.
 *
 * Pursuit into u-turn
 */

export const moveFunctionPatches: Partial<MoveFunctions> = {};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  acid: {effect: [10, [["spd", -1]]]},
  ancientpower: {contact: false},
  astonish: {flag: "none"},
  bide: {ignoreType: true, acc: 0, priority: +1},
  blizzard: {
    getAcc(weather) {
      return weather === "hail" ? undefined : this.acc;
    },
  },
  covet: {contact: true},
  crunch: {effect: [20, [["def", -1]]]},
  dig: {power: 80},
  disable: {acc: 80},
  dive: {power: 80},
  dragonrage: {kingsRock: false},
  extrasensory: {flag: "none"},
  fakeout: {contact: true},
  feintattack: {contact: true},
  flash: {acc: 100},
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
  naturepower: {
    exec(battle, user) {
      // TODO: should target the opponent across from the user
      battle.callMove(battle.gen.moveList.triattack, user);
    },
  },
  needlearm: {flag: "none"},
  nightmare: {acc: 100},
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
