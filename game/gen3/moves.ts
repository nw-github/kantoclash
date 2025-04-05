import {Range, type Move, type MoveFunctions, type MoveId} from "../moves";
import {abilityList} from "../species";
import {HP_TYPES, idiv, VF} from "../utils";

/*
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
  recover(battle, user) {
    const diff = user.base.stats.hp - user.base.hp;
    if (diff === 0) {
      return battle.info(user, "fail_generic");
    }

    if (this.why === "rest") {
      if (abilityList[user.v.ability!]?.preventsStatus === "slp" || user.base.status === "slp") {
        return battle.info(user, "fail_generic");
      }

      user.base.status = "slp";
      user.base.sleepTurns = 3;
      if (user.v.ability === "earlybird") {
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
    const next = battle.rng.choice(target.owner.team.filter(p => p.hp && p != target.base.real));
    if (!next) {
      return battle.info(user, "fail_generic");
    } else if (target.v.ability === "suctioncups") {
      battle.ability(target);
      return battle.info(target, "immune");
    } else if (target.v.hasFlag(VF.ingrain)) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.switchTo(next, battle, "phaze");
  },
};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  absorb: {kingsRock: false},
  bind: {kingsRock: true},
  clamp: {kingsRock: true},
  conversion2: {protect: false},
  counter: {priority: -5, kingsRock: false},
  detect: {priority: +3},
  doubleedge: {recoil: 3},
  dragonbreath: {kingsRock: true},
  dragonrage: {kingsRock: true},
  dynamicpunch: {effect: [100, "confusion"]},
  earthquake: {kingsRock: true},
  endure: {priority: +3},
  firespin: {kingsRock: true},
  flail: {flag: "none"},
  frustration: {getPower: user => Math.max(1, idiv(255 - user.friendship, 2.5))},
  gigadrain: {kingsRock: false},
  gust: {kingsRock: true},
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
  hyperbeam: {kingsRock: true},
  icywind: {effect: [100, [["spe", -1]]]},
  leechlife: {kingsRock: false},
  lowkick: {
    acc: 100,
    effect: [0, "flinch"],
    getPower(_user, target) {
      if (!target) {
        return 0;
      } else if (target.species.weight <= 9.9) {
        return 20;
      } else if (target.species.weight <= 24.9) {
        return 40;
      } else if (target.species.weight <= 49.9) {
        return 60;
      } else if (target.species.weight <= 99.9) {
        return 80;
      } else if (target.species.weight <= 199.9) {
        return 100;
      } else {
        return 120;
      }
    },
  },
  meanlook: {protect: true},
  megadrain: {kingsRock: false},
  mimic: {acc: 0},
  mirrorcoat: {priority: -5},
  mist: {kind: "screen", screen: "mist", range: Range.Field},
  mudslap: {effect: [100, [["acc", -1]]]},
  nightmare: {protect: true},
  painsplit: {acc: 0},
  psychup: {
    name: "Psych Up",
    pp: 10,
    type: "normal",
    range: Range.Adjacent,
    exec(this: Move, battle, user, [target]) {
      if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      user.v.stages = {...target.v.stages};
      battle.event({
        type: "psych_up",
        src: user.id,
        target: target.id,
        volatiles: [
          {id: user.id, v: {stats: user.clientStats(battle), stages: {...user.v.stages}}},
        ],
      });
    },
  },
  psywave: {
    getDamage(battle, user) {
      return Math.max(1, Math.floor((user.base.level * (10 * battle.rng.int(0, 10) + 50)) / 100));
    },
  },
  present: {kingsRock: false},
  protect: {priority: +3},
  pursuit: {kingsRock: false},
  return: {getPower: user => Math.max(1, idiv(user.friendship, 2.5))},
  razorwind: {acc: 100},
  reversal: {flag: "none"},
  roar: {priority: -6},
  rollingkick: {kingsRock: true},
  skyattack: {flag: "high_crit", effect: [30, "flinch"]},
  spiderweb: {protect: true},
  spikes: {
    exec(battle, user) {
      const target = battle.opponentOf(user.owner);
      if (target.spikes === 3) {
        return battle.info(user, "fail_generic");
      }

      battle.event({type: "spikes", src: user.id, player: target.id, spin: false});
      target.spikes++;
    },
  },
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
