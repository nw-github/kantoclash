import {Range, type Move, type MoveFunctions, type MoveId} from "../moves";
import {HP_TYPES} from "../utils";

/*
TODO: low kick weight

draining moves are fixed against substitutes

kings rock can activate for every strike of a multi hit move

bide duration is two turns, now locked in

kings rock affects trapping move

adjacent moves currently retarget to hit allies

rollout targeting?

trapping moves are broken again

Sandstorm, hail, don't damage during the semi-invulnerable turn of dive


*/

export const moveFunctionPatches: Partial<MoveFunctions> = {};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  conversion2: {protect: false},
  detect: {priority: +3},
  endure: {priority: +3},
  hiddenpower: {
    getPower(user) {
      const v =
        ((user.ivs.hp >> 1) & 1) |
        (((user.ivs.atk >> 1) & 1) << 1) |
        (((user.ivs.def >> 1) & 1) << 2) |
        (((user.ivs.spe >> 1) & 1) << 3) |
        (((user.ivs.spa >> 1) & 1) << 4) |
        (((user.ivs.spd >> 1) & 1) << 5);
      return Math.floor((v * 40) / 63) + 30;
    },
    getType(user) {
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
  lowkick: {acc: 100, effect: [0, "flinch"]},
  meanlook: {protect: true},
  mimic: {acc: 0},
  nightmare: {protect: true},
  painsplit: {acc: 0},
  protect: {priority: +3},
  razorwind: {acc: 100},
  roar: {priority: -6},
  skyattack: {flag: "high_crit", effect: [30, "flinch"]},
  spiderweb: {protect: true},
  whirlwind: {priority: -6},
};
