import {getLowKickPower, Range, type Move, type MoveFunctions, type MoveId} from "../moves";
import {abilityList} from "../species";
import {HP_TYPES, idiv, VF} from "../utils";

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
      } else if (battle.hasUproar(user)) {
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

    target.switchTo(next, battle, "phaze", user);
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
};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  absorb: {kingsRock: false},
  bind: {kingsRock: true},
  blizzard: {effect: [10, "frz"]},
  bodyslam: {effect: [30, "par"]},
  boneclub: {effect: [10, "flinch"]},
  clamp: {kingsRock: true},
  conversion2: {protect: false},
  counter: {priority: -5, kingsRock: false},
  detect: {priority: +3},
  doubleedge: {recoil: 3},
  dragonbreath: {kingsRock: true},
  dragonrage: {kingsRock: true},
  dynamicpunch: {effect: [100, "confusion"]},
  earthquake: {kingsRock: true},
  ember: {effect: [10, "brn"]},
  endure: {priority: +3},
  firepunch: {effect: [10, "brn"]},
  firespin: {kingsRock: true},
  flail: {flag: "none"},
  flamethrower: {effect: [10, "brn"]},
  frustration: {getPower: user => Math.max(1, idiv(255 - user.friendship, 2.5))},
  gigadrain: {kingsRock: false},
  gust: {kingsRock: true},
  headbutt: {effect: [30, "flinch"]},
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
  hyperfang: {effect: [10, "flinch"]},
  icebeam: {effect: [10, "frz"]},
  icepunch: {effect: [10, "frz"]},
  icywind: {effect: [100, [["spe", -1]]]},
  leechlife: {kingsRock: false},
  lick: {effect: [30, "par"]},
  lowkick: {
    acc: 100,
    effect: [0, "flinch"],
    power: 0,
    getPower: (_user, target) => getLowKickPower(target?.species?.weight ?? 0),
  },
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
  rollingkick: {kingsRock: true, effect: [30, "flinch"]},
  skyattack: {flag: "high_crit", effect: [30, "flinch"]},
  sleeptalk: {noEncore: false},
  smog: {effect: [40, "psn"]},
  spiderweb: {protect: true},
  spikes: {max: 3},
  spite: {
    exec(this: Move, battle, user, [target]) {
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
  },
  steelwing: {kingsRock: true},
  stomp: {effect: [30, "flinch"]},
  superfang: {kingsRock: false},
  thief: {effect: [100, "thief"], kingsRock: false},
  thunderpunch: {effect: [10, "par"]},
  thundershock: {effect: [10, "par"]},
  thunderbolt: {effect: [10, "par"]},
  twineedle: {kingsRock: false},
  twister: {kingsRock: true},
  whirlpool: {kingsRock: true},
  whirlwind: {priority: -6},
  wrap: {kingsRock: true},
  zapcannon: {effect: [100, "par"]},
};
