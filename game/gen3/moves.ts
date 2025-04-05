import {Range, type Move, type MoveFunctions, type MoveId} from "../moves";
import {HP_TYPES} from "../utils";

/*
TODO: low kick weight

draining moves are fixed against substitutes

kings rock can activate for every strike of a multi hit move

bide duration is two turns, now locked in

kings rock affects trapping move

adjacent moves currently retarget to hit allies
  - will also prefer ally instead of right diagonal opponent

rollout targeting?

trapping moves are broken again

endure breaks randomly

*/

export const moveFunctionPatches: Partial<MoveFunctions> = {
  weather(battle, user) {
    if (battle.weather?.kind === this.weather) {
      return battle.info(user, "fail_generic");
    }
    battle.setWeather(this.weather, 5);
  },
};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  conversion2: {protect: false},
  detect: {priority: +3},
  endure: {priority: +3},
  flail: {flag: "none"},
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
  mist: {kind: "screen", screen: "mist", range: Range.Field},
  nightmare: {protect: true},
  painsplit: {acc: 0},
  protect: {priority: +3},
  razorwind: {acc: 100},
  reversal: {flag: "none"},
  roar: {priority: -6},
  skyattack: {flag: "high_crit", effect: [30, "flinch"]},
  spiderweb: {protect: true},
  whirlwind: {priority: -6},
};
