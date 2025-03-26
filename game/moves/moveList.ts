import type {DamagingMove, Move} from "./index";
import {type Pokemon, transform} from "../pokemon";
import {hpPercentExact, idiv, isSpecial, stageKeys, stageStatKeys, VF, type Type} from "../utils";

export type MoveId = keyof typeof internalMoveList;

export const createMoveList = <T extends Record<string, Move>>(list: T) => {
  let id = 0;
  for (const k in list) {
    (list[k].idx as any) = id++;
  }
  return Object.freeze(list);
};

const internalMoveList = createMoveList({
  conversion: {
    name: "Conversion",
    pp: 30,
    type: "normal",
    exec(battle, user, target) {
      user.v.types = [...target.v.types];
      battle.event({
        type: "conversion",
        src: user.owner.id,
        target: target.owner.id,
        types: [...user.v.types],
        volatiles: [{id: user.owner.id, v: {types: [...user.v.types]}}],
      });

      return false;
    },
  },
  disable: {
    name: "Disable",
    pp: 20,
    type: "normal",
    acc: 55,
    protect: true,
    exec(battle, user, target) {
      battle.gen1LastDamage = 0;

      const options = [...target.base.moves.keys()].filter(i => target.base.pp[i] !== 0);
      if (!options.length || target.v.disabled) {
        battle.info(user, "fail_generic");
        target.handleRage(battle);
        return false;
      } else if (!battle.checkAccuracy(this, user, target)) {
        target.handleRage(battle);
        return false;
      }

      const indexInMoves = battle.rng.choice(options)!;
      target.v.disabled = {indexInMoves, turns: battle.rng.int(1, 8)};
      battle.event({
        type: "disable",
        src: target.owner.id,
        move: target.base.moves[indexInMoves],
        volatiles: [{id: target.owner.id, v: {flags: target.v.cflags}}],
      });
      target.handleRage(battle);
      return false;
    },
  },
  haze: {
    name: "Haze",
    pp: 30,
    type: "ice",
    exec(battle, user, target) {
      for (const k of stageKeys) {
        user.v.stages[k] = target.v.stages[k] = 0;
      }

      const flags = VF.lightScreen | VF.reflect | VF.mist | VF.focus | VF.seeded;
      user.v.clearFlag(flags);
      target.v.clearFlag(flags);

      user.v.counter = target.v.counter = 0;
      user.v.confusion = target.v.confusion = 0;
      user.v.disabled = target.v.disabled = undefined;
      user.v.stats = {...user.base.stats};
      target.v.stats = {...target.base.stats};

      if (user.base.status === "tox") {
        user.base.status = "psn";
      }

      if (target.base.status === "frz" || target.base.status === "slp") {
        target.base.sleepTurns = 0;
        target.v.hazed = true;
      }

      target.base.status = undefined;

      battle.info(user, "haze", [
        {id: user.owner.id, v: user.getClientVolatiles(user.base, battle)},
        {id: target.owner.id, v: target.getClientVolatiles(target.base, battle)},
      ]);
      return false;
    },
  },
  leechseed: {
    name: "Leech Seed",
    pp: 15,
    type: "grass",
    acc: 90,
    protect: true,
    exec(battle, user, target) {
      if (target.v.types.includes(this.type)) {
        return battle.info(target, "immune");
      } else if (target.v.hasFlag(VF.seeded)) {
        return battle.info(target, "fail_generic");
      } else if (battle.gen.id >= 2 && target.v.substitute) {
        return battle.info(target, "fail_generic");
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      battle.info(target, "seeded", [target.setFlag(VF.seeded)]);
    },
  },
  metronome: {
    name: "Metronome",
    pp: 10,
    type: "normal",
    noEncore: true,
    exec(battle, user, target): boolean {
      battle.gen1LastDamage = 0;
      const moves = Object.entries(battle.gen.moveList)
        .filter(([, move]) => !move.noMetronome && move.idx! <= battle.gen.lastMoveIdx)
        .filter(
          ([id]) => (battle.gen.id !== 2 && battle.gen.id !== 4) || !user.base.moves.includes(id),
        )
        .map(([, move]) => move);
      return battle.callUseMove(battle.rng.choice(moves)!, user, target);
    },
  },
  mimic: {
    name: "Mimic",
    pp: 10,
    type: "normal",
    acc: 100,
    noEncore: true,
    noSleepTalk: true,
    exec(battle, user, target, indexInMoves) {
      if (!battle.checkAccuracy(this, user, target)) {
        return false;
      }

      user.v.mimic = {
        indexInMoves: indexInMoves ?? user.v.lastMoveIndex ?? -1,
        move: battle.rng.choice(target.base.moves)!,
      };

      battle.event({type: "mimic", src: user.owner.id, move: user.v.mimic.move});
      return false;
    },
  },
  mirrormove: {
    name: "Mirror Move",
    pp: 20,
    type: "flying",
    noEncore: true,
    exec(battle, user, target) {
      battle.gen1LastDamage = 0;
      if (!target.v.lastMove || target.v.lastMove === this) {
        battle.info(user, "fail_generic");
        return false;
      }

      return battle.callUseMove(target.v.lastMove, user, target);
    },
  },
  substitute: {
    name: "Substitute",
    pp: 10,
    type: "normal",
    exec(battle, user) {
      const hp = Math.floor(user.base.stats.hp / 4);
      if (user.v.substitute) {
        battle.info(user, "has_substitute");
        return;
      } else if (!battle.gen.canSubstitute(user, hp)) {
        battle.info(user, "cant_substitute");
        return;
      }

      user.v.substitute = hp + 1;
      user.damage(hp, user, battle, false, "substitute", true, undefined, [
        {id: user.owner.id, v: {flags: user.v.cflags}},
      ]);
    },
  },
  transform: {
    name: "Transform",
    pp: 10,
    type: "normal",
    noEncore: true,
    exec(battle, user, target) {
      battle.gen1LastDamage = 0;
      user.base = transform(user.base.real, target.base);

      for (const k of stageKeys) {
        user.v.stages[k] = target.v.stages[k];
        if (stageStatKeys.includes(k)) {
          user.recalculateStat(battle, k, false);
        }
      }

      user.v.types = [...target.v.types];
      battle.event({
        type: "transform",
        src: user.owner.id,
        target: target.owner.id,
        volatiles: [{id: user.owner.id, v: user.getClientVolatiles(user.base, battle)}],
      });
      return false;
    },
  },
  // --
  focusenergy: {
    kind: "volatile",
    name: "Focus Energy",
    pp: 30,
    type: "normal",
    flag: VF.focus,
  },
  lightscreen: {
    kind: "volatile",
    name: "Light Screen",
    pp: 30,
    type: "psychic",
    flag: VF.lightScreen,
  },
  mist: {kind: "volatile", name: "Mist", pp: 30, type: "ice", flag: VF.mist},
  reflect: {kind: "volatile", name: "Reflect", pp: 20, type: "psychic", flag: VF.reflect},
  // --
  recover: {kind: "recover", name: "Recover", pp: 20, type: "normal", why: "recover"},
  rest: {kind: "recover", name: "Rest", pp: 10, type: "psychic", why: "rest"},
  softboiled: {kind: "recover", name: "Softboiled", pp: 10, type: "normal", why: "recover"},
  // --
  confuseray: {kind: "confuse", name: "Confuse Ray", pp: 10, type: "ghost", acc: 100},
  supersonic: {kind: "confuse", name: "Supersonic", pp: 20, type: "normal", acc: 55},
  // --
  glare: {kind: "status", name: "Glare", pp: 30, type: "normal", acc: 75, status: "par"},
  hypnosis: {kind: "status", name: "Hypnosis", pp: 20, type: "psychic", acc: 60, status: "slp"},
  lovelykiss: {kind: "status", name: "Lovely Kiss", pp: 10, type: "normal", acc: 75, status: "slp"},
  poisongas: {kind: "status", name: "Poison Gas", pp: 40, type: "poison", acc: 55, status: "psn"},
  poisonpowder: {
    kind: "status",
    name: "Poison Powder",
    pp: 35,
    type: "poison",
    acc: 75,
    status: "psn",
  },
  sing: {kind: "status", name: "Sing", pp: 15, type: "normal", acc: 55, status: "slp"},
  sleeppowder: {
    kind: "status",
    name: "Sleep Powder",
    pp: 15,
    type: "grass",
    acc: 75,
    status: "slp",
  },
  spore: {kind: "status", name: "Spore", pp: 15, type: "grass", acc: 100, status: "slp"},
  stunspore: {kind: "status", name: "Stun Spore", pp: 30, type: "grass", acc: 75, status: "par"},
  thunderwave: {
    kind: "status",
    name: "Thunder Wave",
    pp: 20,
    type: "electric",
    acc: 100,
    status: "par",
  },
  toxic: {kind: "status", name: "Toxic", pp: 15, type: "poison", acc: 85, status: "tox"},
  // --
  acidarmor: {kind: "stage", name: "Acid Armor", pp: 40, type: "poison", stages: [["def", 2]]},
  agility: {kind: "stage", name: "Agility", pp: 30, type: "psychic", stages: [["spe", 2]]},
  amnesia: {kind: "stage", name: "Amnesia", pp: 20, type: "psychic", stages: [["spa", 2]]},
  barrier: {kind: "stage", name: "Barrier", pp: 30, type: "psychic", stages: [["def", 2]]},
  defensecurl: {kind: "stage", name: "Defense Curl", pp: 40, type: "normal", stages: [["def", 1]]},
  doubleteam: {kind: "stage", name: "Double Team", pp: 15, type: "normal", stages: [["eva", 1]]},
  flash: {kind: "stage", name: "Flash", pp: 20, type: "normal", acc: 70, stages: [["acc", -1]]},
  growl: {kind: "stage", name: "Growl", pp: 40, type: "normal", acc: 100, stages: [["atk", -1]]},
  growth: {kind: "stage", name: "Growth", pp: 40, type: "normal", stages: [["spa", 1]]},
  harden: {kind: "stage", name: "Harden", pp: 30, type: "normal", stages: [["def", 1]]},
  kinesis: {
    kind: "stage",
    name: "Kinesis",
    pp: 15,
    type: "psychic",
    acc: 80,
    stages: [["acc", -1]],
  },
  leer: {kind: "stage", name: "Leer", pp: 30, type: "normal", acc: 100, stages: [["def", -1]]},
  meditate: {kind: "stage", name: "Meditate", pp: 40, type: "psychic", stages: [["atk", 1]]},
  minimize: {kind: "stage", name: "Minimize", pp: 15, type: "normal", stages: [["eva", +1]]},
  sandattack: {
    kind: "stage",
    name: "Sand-Attack",
    pp: 15,
    type: "normal",
    acc: 100,
    stages: [["acc", -1]],
  },
  screech: {kind: "stage", name: "Screech", pp: 40, type: "normal", acc: 85, stages: [["def", -2]]},
  sharpen: {kind: "stage", name: "Sharpen", pp: 30, type: "normal", stages: [["atk", 1]]},
  smokescreen: {
    kind: "stage",
    name: "Smokescreen",
    pp: 20,
    type: "normal",
    acc: 100,
    stages: [["acc", -1]],
  },
  stringshot: {
    kind: "stage",
    name: "String Shot",
    pp: 40,
    type: "bug",
    acc: 95,
    stages: [["spe", -1]],
  },
  swordsdance: {kind: "stage", name: "Swords Dance", pp: 30, type: "normal", stages: [["atk", 2]]},
  tailwhip: {
    kind: "stage",
    name: "Tail Whip",
    pp: 30,
    type: "normal",
    acc: 100,
    stages: [["def", -1]],
  },
  withdraw: {kind: "stage", name: "Withdraw", pp: 40, type: "water", stages: [["def", 1]]},
  // --
  absorb: {
    kind: "damage",
    name: "Absorb",
    pp: 20,
    type: "grass",
    power: 20,
    acc: 100,
    kingsRock: true,
  },
  acid: {
    kind: "damage",
    name: "Acid",
    pp: 30,
    type: "poison",
    power: 40,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["spa", -1]]],
  },
  aurorabeam: {
    kind: "damage",
    name: "Aurora Beam",
    pp: 20,
    type: "ice",
    power: 65,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["atk", -1]]],
  },
  barrage: {
    kind: "damage",
    name: "Barrage",
    pp: 20,
    type: "normal",
    power: 15,
    acc: 85,
    flag: "multi",
    kingsRock: true,
  },
  bide: {
    kind: "damage",
    name: "Bide",
    pp: 10,
    type: "normal",
    power: 1,
    noSleepTalk: true,
    kingsRock: true,
    flag: "bide",
    getDamage(_, user) {
      const dmg = user.v.bide?.dmg;
      user.v.bide = undefined;
      return dmg ? dmg * 2 : false;
    },
  },
  bind: {
    kind: "damage",
    name: "Bind",
    pp: 20,
    type: "normal",
    acc: 75,
    power: 15,
    flag: "trap",
  },
  bodyslam: {
    kind: "damage",
    name: "Body Slam",
    pp: 15,
    type: "normal",
    power: 85,
    acc: 100,
    effect: [30.1 /* 77/256 */, "par"],
  },
  bonemerang: {
    kind: "damage",
    name: "Bonemerang",
    pp: 10,
    type: "ground",
    power: 50,
    acc: 90,
    flag: "double",
    kingsRock: true,
  },
  bubble: {
    kind: "damage",
    name: "Bubble",
    pp: 30,
    type: "water",
    power: 20,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["spe", -1]]],
  },
  bubblebeam: {
    kind: "damage",
    name: "Bubble Beam",
    pp: 20,
    type: "water",
    power: 65,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["spe", -1]]],
  },
  bite: {
    kind: "damage",
    name: "Bite",
    pp: 25,
    type: "normal",
    power: 60,
    acc: 100,
    effect: [10.2 /* 26/256 */, "flinch"],
  },
  blizzard: {
    kind: "damage",
    name: "Blizzard",
    pp: 5,
    type: "ice",
    power: 120,
    acc: 90,
    effect: [10.2 /* 26/256 */, "frz"],
  },
  boneclub: {
    kind: "damage",
    name: "Bone Club",
    pp: 20,
    type: "ground",
    power: 65,
    acc: 85,
    effect: [10.2 /* 26/256 */, "flinch"],
  },
  clamp: {
    kind: "damage",
    name: "Clamp",
    pp: 10,
    type: "water",
    acc: 75,
    power: 35,
    flag: "trap",
  },
  cometpunch: {
    kind: "damage",
    name: "Comet Punch",
    pp: 15,
    type: "normal",
    power: 18,
    acc: 85,
    flag: "multi",
    kingsRock: true,
  },
  confusion: {
    kind: "damage",
    name: "Confusion",
    pp: 25,
    type: "psychic",
    power: 50,
    acc: 100,
    effect: [10 /* 25/256 */, "confusion"],
  },
  constrict: {
    kind: "damage",
    name: "Constrict",
    pp: 35,
    type: "normal",
    power: 10,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["spe", -1]]],
  },
  counter: {
    kind: "damage",
    name: "Counter",
    pp: 20,
    type: "fight",
    acc: 100,
    power: 1,
    priority: -1,
    kingsRock: true,
    getDamage(battle, _, target) {
      // https://www.youtube.com/watch?v=ftTalHMjPRY
      //  On cartrige, the move counter uses is updated whenever a player hovers over a move (even
      //  if he doesn't select it). In a link battle, this information is not shared between both
      //  players. This means, that a player can influence the ability of counter to succeed by
      //  hovering over a move on their side, cancelling the 'FIGHT' menu, and switching out. Since
      //  we don't have a FIGHT menu, and this can cause a desync anyway, just use the last
      //  attempted move.

      const mv = target.lastChosenMove;
      if (mv && ((mv.type !== "normal" && mv.type !== "fight") || !mv.power || mv === this)) {
        return false;
      } else if (target.owner.choice?.move === this) {
        return false;
      }
      // Counter can crit, but it won't do any more damage
      return battle.gen1LastDamage * 2;
    },
  },
  crabhammer: {
    kind: "damage",
    name: "Crabhammer",
    pp: 10,
    type: "water",
    power: 90,
    acc: 85,
    flag: "high_crit",
    kingsRock: true,
  },
  cut: {kind: "damage", name: "Cut", pp: 30, type: "normal", power: 50, acc: 95, kingsRock: true},
  dig: {
    kind: "damage",
    name: "Dig",
    pp: 10,
    type: "ground",
    power: 100,
    acc: 100,
    charge: "invuln",
    noSleepTalk: true,
    kingsRock: true,
  },
  dizzypunch: {kind: "damage", name: "Dizzy Punch", pp: 10, type: "normal", power: 70, acc: 100},
  doubleedge: {
    kind: "damage",
    name: "Double Edge",
    pp: 15,
    type: "normal",
    power: 100,
    acc: 100,
    recoil: 4, // 1 / 4
    kingsRock: true,
  },
  doublekick: {
    kind: "damage",
    name: "Double Kick",
    pp: 30,
    type: "fight",
    power: 30,
    acc: 100,
    flag: "double",
    kingsRock: true,
  },
  doubleslap: {
    kind: "damage",
    name: "Double Slap",
    pp: 10,
    type: "normal",
    power: 15,
    acc: 85,
    flag: "multi",
    kingsRock: true,
  },
  dragonrage: {
    kind: "damage",
    name: "Dragon Rage",
    pp: 10,
    type: "dragon",
    acc: 100,
    power: 1,
    getDamage: 40,
  },
  dreameater: {
    kind: "damage",
    name: "Dream Eater",
    pp: 15,
    type: "psychic",
    power: 100,
    acc: 100,
    flag: "dream_eater",
  },
  drillpeck: {
    kind: "damage",
    name: "Drill Peck",
    pp: 20,
    type: "flying",
    power: 80,
    acc: 100,
    kingsRock: true,
  },
  eggbomb: {
    kind: "damage",
    name: "Egg Bomb",
    pp: 10,
    type: "normal",
    power: 100,
    acc: 75,
    kingsRock: true,
  },
  earthquake: {
    kind: "damage",
    name: "Earthquake",
    pp: 10,
    type: "ground",
    power: 100,
    acc: 100,
  },
  ember: {
    kind: "damage",
    name: "Ember",
    pp: 25,
    type: "fire",
    power: 40,
    acc: 100,
    effect: [10.2 /* 26/256 */, "brn"],
  },
  explosion: {
    kind: "damage",
    name: "Explosion",
    pp: 5,
    type: "normal",
    power: 170,
    acc: 100,
    flag: "explosion",
    kingsRock: true,
  },
  fireblast: {
    kind: "damage",
    name: "Fire Blast",
    pp: 5,
    type: "fire",
    power: 120,
    acc: 85,
    effect: [30.1 /* 77/256 */, "brn"],
  },
  firepunch: {
    kind: "damage",
    name: "Fire Punch",
    pp: 15,
    type: "fire",
    power: 75,
    acc: 100,
    effect: [10.2 /* 26/256 */, "brn"],
  },
  firespin: {
    kind: "damage",
    name: "Fire Spin",
    pp: 15,
    type: "fire",
    acc: 70,
    power: 15,
    flag: "trap",
  },
  fissure: {
    kind: "damage",
    name: "Fissure",
    pp: 5,
    type: "ground",
    acc: 30,
    power: 1,
    flag: "ohko",
  },
  flamethrower: {
    kind: "damage",
    name: "Flamethrower",
    pp: 15,
    type: "fire",
    power: 95,
    acc: 100,
    effect: [10.2 /* 26/256 */, "brn"],
  },
  fly: {
    kind: "damage",
    name: "Fly",
    pp: 15,
    type: "flying",
    power: 70,
    acc: 95,
    charge: "invuln",
    noSleepTalk: true,
    kingsRock: true,
  },
  furyattack: {
    kind: "damage",
    name: "Fury Attack",
    pp: 20,
    type: "normal",
    power: 15,
    acc: 85,
    flag: "multi",
    kingsRock: true,
  },
  furyswipes: {
    kind: "damage",
    name: "Fury Swipes",
    pp: 15,
    type: "normal",
    power: 18,
    acc: 80,
    flag: "multi",
    kingsRock: true,
  },
  guillotine: {
    kind: "damage",
    name: "Guillotine",
    pp: 5,
    type: "normal",
    acc: 30,
    power: 1,
    flag: "ohko",
  },
  gust: {
    kind: "damage",
    name: "Gust",
    pp: 35,
    type: "normal",
    power: 40,
    acc: 100,
  },
  headbutt: {
    kind: "damage",
    name: "Headbutt",
    pp: 15,
    type: "normal",
    power: 70,
    acc: 100,
    effect: [30.1 /* 77/256 */, "flinch"],
  },
  hijumpkick: {
    kind: "damage",
    name: "Hi Jump Kick",
    pp: 20,
    type: "fight",
    power: 85,
    acc: 90,
    flag: "crash",
    kingsRock: true,
  },
  hornattack: {
    kind: "damage",
    name: "Horn Attack",
    pp: 25,
    type: "normal",
    power: 65,
    acc: 100,
    kingsRock: true,
  },
  horndrill: {
    kind: "damage",
    name: "Horn Drill",
    pp: 5,
    type: "normal",
    acc: 30,
    power: 1,
    flag: "ohko",
  },
  hydropump: {
    kind: "damage",
    name: "Hydro Pump",
    pp: 5,
    type: "water",
    power: 120,
    acc: 80,
    kingsRock: true,
  },
  hyperbeam: {
    kind: "damage",
    name: "Hyper Beam",
    pp: 5,
    type: "normal",
    power: 150,
    acc: 90,
    flag: "recharge",
  },
  hyperfang: {
    kind: "damage",
    name: "Hyper Fang",
    pp: 15,
    type: "normal",
    power: 80,
    acc: 90,
    effect: [10.2 /* 26/256 */, "flinch"],
  },
  icebeam: {
    kind: "damage",
    name: "Ice Beam",
    pp: 10,
    type: "ice",
    power: 95,
    acc: 100,
    effect: [10.2 /* 26/256 */, "frz"],
  },
  icepunch: {
    kind: "damage",
    name: "Ice Punch",
    pp: 15,
    type: "ice",
    power: 75,
    acc: 100,
    effect: [10.2 /* 26/256 */, "frz"],
  },
  jumpkick: {
    kind: "damage",
    name: "Jump Kick",
    pp: 25,
    type: "fight",
    power: 70,
    acc: 95,
    flag: "crash",
    kingsRock: true,
  },
  karatechop: {
    kind: "damage",
    name: "Karate Chop",
    pp: 25,
    type: "normal",
    power: 50,
    acc: 100,
    flag: "high_crit",
    kingsRock: true,
  },
  leechlife: {
    kind: "damage",
    name: "Leech Life",
    pp: 15,
    type: "bug",
    power: 20,
    acc: 100,
    flag: "drain",
    kingsRock: true,
  },
  lick: {
    kind: "damage",
    name: "Lick",
    pp: 30,
    type: "ghost",
    power: 20,
    acc: 100,
    effect: [30.1 /* 77/256 */, "par"],
  },
  lowkick: {
    kind: "damage",
    name: "Low Kick",
    pp: 20,
    type: "fight",
    power: 50,
    acc: 90,
    effect: [30.1 /* 77/256 */, "flinch"],
  },
  megadrain: {
    kind: "damage",
    name: "Mega Drain",
    pp: 10,
    type: "grass",
    power: 40,
    acc: 100,
    flag: "drain",
    kingsRock: true,
  },
  megakick: {
    kind: "damage",
    name: "Mega Kick",
    pp: 5,
    type: "normal",
    power: 120,
    acc: 75,
    kingsRock: true,
  },
  megapunch: {
    kind: "damage",
    name: "Mega Punch",
    pp: 20,
    type: "normal",
    power: 80,
    acc: 85,
    kingsRock: true,
  },
  nightshade: {
    kind: "damage",
    name: "Night Shade",
    pp: 15,
    type: "ghost",
    acc: 100,
    power: 1,
    kingsRock: true,
    getDamage: (_, user) => user.base.level,
  },
  payday: {
    kind: "damage",
    name: "Pay Day",
    pp: 20,
    type: "normal",
    power: 40,
    acc: 100,
    flag: "payday",
    kingsRock: true,
  },
  peck: {
    kind: "damage",
    name: "Peck",
    pp: 35,
    type: "flying",
    power: 35,
    acc: 100,
    kingsRock: true,
  },
  petaldance: {
    kind: "damage",
    name: "Petal Dance",
    pp: 20,
    type: "grass",
    power: 70,
    acc: 100,
    flag: "multi_turn",
    kingsRock: true,
  },
  pinmissile: {
    kind: "damage",
    name: "Pin Missile",
    pp: 20,
    type: "bug",
    power: 14,
    acc: 85,
    flag: "multi",
    kingsRock: true,
  },
  poisonsting: {
    kind: "damage",
    name: "Poison Sting",
    pp: 35,
    type: "poison",
    power: 15,
    acc: 100,
    effect: [20.4 /* 52/256 */, "psn"],
  },
  pound: {
    kind: "damage",
    name: "Pound",
    pp: 35,
    type: "normal",
    power: 40,
    acc: 100,
    kingsRock: true,
  },
  psybeam: {
    kind: "damage",
    name: "Psybeam",
    pp: 20,
    type: "psychic",
    power: 65,
    acc: 100,
    effect: [10 /* 25/256 */, "confusion"],
  },
  psychic: {
    kind: "damage",
    name: "Psychic",
    pp: 10,
    type: "psychic",
    power: 90,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["spa", -1]]],
  },
  psywave: {
    kind: "damage",
    name: "Psywave",
    pp: 15,
    type: "psychic",
    power: 1,
    acc: 80,
    kingsRock: true,
    getDamage(battle, user) {
      // psywave has a desync glitch that we don't emulate
      return battle.rng.int(1, Math.max(Math.floor(user.base.level * 1.5 - 1), 1));
    },
  },
  quickattack: {
    kind: "damage",
    name: "Quick Attack",
    pp: 30,
    type: "normal",
    power: 40,
    acc: 100,
    priority: +1,
    kingsRock: true,
  },
  rage: {
    kind: "damage",
    name: "Rage",
    pp: 20,
    type: "normal",
    acc: 100,
    power: 20,
    flag: "rage",
    kingsRock: true,
  },
  razorleaf: {
    kind: "damage",
    name: "Razor Leaf",
    pp: 25,
    type: "grass",
    power: 55,
    acc: 95,
    flag: "high_crit",
    kingsRock: true,
  },
  razorwind: {
    kind: "damage",
    name: "Razor Wind",
    pp: 10,
    type: "normal",
    power: 80,
    acc: 75,
    charge: true,
    noSleepTalk: true,
    kingsRock: true,
  },
  rockslide: {kind: "damage", name: "Rock Slide", pp: 10, type: "rock", power: 75, acc: 90},
  rockthrow: {
    kind: "damage",
    name: "Rock Throw",
    pp: 15,
    type: "rock",
    power: 50,
    acc: 65,
    kingsRock: true,
  },
  rollingkick: {
    kind: "damage",
    name: "Rolling Kick",
    pp: 15,
    type: "fight",
    power: 60,
    acc: 85,
    effect: [30.1 /* 77/256 */, "flinch"],
  },
  selfdestruct: {
    kind: "damage",
    name: "Self-Destruct",
    pp: 5,
    type: "normal",
    power: 130,
    acc: 100,
    flag: "explosion",
    kingsRock: true,
  },
  scratch: {
    kind: "damage",
    name: "Scratch",
    pp: 35,
    type: "normal",
    power: 40,
    acc: 100,
    kingsRock: true,
  },
  seismictoss: {
    kind: "damage",
    name: "Seismic Toss",
    pp: 20,
    type: "fight",
    acc: 100,
    power: 1,
    kingsRock: true,
    getDamage: (_, user) => user.base.level,
  },
  skullbash: {
    kind: "damage",
    name: "Skull Bash",
    pp: 15,
    type: "normal",
    power: 100,
    acc: 100,
    charge: true,
    noSleepTalk: true,
    kingsRock: true,
  },
  skyattack: {
    kind: "damage",
    name: "Sky Attack",
    pp: 5,
    type: "flying",
    power: 140,
    acc: 90,
    charge: true,
    noSleepTalk: true,
    kingsRock: true,
  },
  slam: {kind: "damage", name: "Slam", pp: 20, type: "normal", power: 80, acc: 75, kingsRock: true},
  slash: {
    kind: "damage",
    name: "Slash",
    pp: 20,
    type: "normal",
    power: 70,
    acc: 100,
    flag: "high_crit",
    kingsRock: true,
  },
  sludge: {
    kind: "damage",
    name: "Sludge",
    pp: 20,
    type: "poison",
    power: 65,
    acc: 100,
    effect: [40.4 /* 103/256 */, "psn"],
  },
  smog: {
    kind: "damage",
    name: "Smog",
    pp: 20,
    type: "poison",
    power: 20,
    acc: 70,
    effect: [40.4 /* 103/256 */, "psn"],
  },
  solarbeam: {
    kind: "damage",
    name: "SolarBeam",
    pp: 10,
    type: "grass",
    power: 120,
    acc: 100,
    charge: "sun",
    noSleepTalk: true,
    kingsRock: true,
  },
  sonicboom: {
    kind: "damage",
    name: "SonicBoom",
    pp: 20,
    type: "normal",
    acc: 90,
    power: 1,
    getDamage: 20,
    kingsRock: true,
  },
  spikecannon: {
    kind: "damage",
    name: "Spike Cannon",
    pp: 15,
    type: "normal",
    power: 20,
    acc: 100,
    flag: "multi",
    kingsRock: true,
  },
  stomp: {
    kind: "damage",
    name: "Stomp",
    pp: 20,
    type: "normal",
    power: 65,
    acc: 100,
    effect: [30.1 /* 77/256 */, "flinch"],
  },
  strength: {
    kind: "damage",
    name: "Strength",
    pp: 15,
    type: "normal",
    power: 80,
    acc: 100,
    kingsRock: true,
  },
  struggle: {
    kind: "damage",
    name: "Struggle",
    pp: 10,
    type: "normal",
    acc: 100,
    power: 50,
    recoil: 2,
    noMetronome: true,
    noEncore: true,
    kingsRock: true,
  },
  submission: {
    kind: "damage",
    name: "Submission",
    pp: 25,
    type: "fight",
    power: 80,
    acc: 80,
    recoil: 4,
    kingsRock: true,
  },
  superfang: {
    kind: "damage",
    name: "Super Fang",
    pp: 10,
    type: "normal",
    acc: 90,
    power: 1,
    kingsRock: true,
    getDamage: (_battle, _, target) => Math.max(Math.floor(target.base.hp / 2), 1),
  },
  surf: {kind: "damage", name: "Surf", pp: 15, type: "water", power: 95, acc: 100, kingsRock: true},
  swift: {kind: "damage", name: "Swift", pp: 20, type: "normal", power: 60, kingsRock: true},
  tackle: {
    kind: "damage",
    name: "Tackle",
    pp: 35,
    type: "normal",
    power: 35,
    acc: 95,
    kingsRock: true,
  },
  takedown: {
    kind: "damage",
    name: "Take Down",
    pp: 20,
    type: "normal",
    power: 90,
    acc: 85,
    recoil: 4,
    kingsRock: true,
  },
  thrash: {
    kind: "damage",
    name: "Thrash",
    pp: 20,
    type: "normal",
    power: 90,
    acc: 100,
    flag: "multi_turn",
    kingsRock: true,
  },
  thunder: {
    kind: "damage",
    name: "Thunder",
    pp: 10,
    type: "electric",
    power: 120,
    acc: 70,
    effect: [10.2 /* 26/256 */, "par"],
  },
  thunderpunch: {
    kind: "damage",
    name: "Thunder Punch",
    pp: 15,
    type: "electric",
    power: 75,
    acc: 100,
    effect: [10.2 /* 26/256 */, "par"],
  },
  thundershock: {
    kind: "damage",
    name: "Thunder Shock",
    pp: 30,
    type: "electric",
    power: 40,
    acc: 100,
    effect: [10.2 /* 26/256 */, "par"],
  },
  thunderbolt: {
    kind: "damage",
    name: "Thunderbolt",
    pp: 15,
    type: "electric",
    power: 95,
    acc: 100,
    effect: [10.2 /* 26/256 */, "par"],
  },
  triattack: {kind: "damage", name: "Tri Attack", pp: 10, type: "normal", power: 80, acc: 100},
  twineedle: {
    kind: "damage",
    name: "Twineedle",
    pp: 20,
    type: "bug",
    power: 25,
    acc: 100,
    flag: "double",
    effect: [20 /* 51/256 [citation needed] */, "psn"],
    kingsRock: true,
  },
  vinewhip: {
    kind: "damage",
    name: "Vine Whip",
    pp: 10,
    type: "grass",
    power: 35,
    acc: 100,
    kingsRock: true,
  },
  vicegrip: {
    kind: "damage",
    name: "Vice Grip",
    pp: 30,
    type: "normal",
    power: 55,
    acc: 100,
    kingsRock: true,
  },
  watergun: {
    kind: "damage",
    name: "Water Gun",
    pp: 25,
    type: "water",
    power: 40,
    acc: 100,
    kingsRock: true,
  },
  waterfall: {
    kind: "damage",
    name: "Waterfall",
    pp: 15,
    type: "water",
    power: 80,
    acc: 100,
    kingsRock: true,
  },
  wingattack: {
    kind: "damage",
    name: "Wing Attack",
    pp: 35,
    type: "flying",
    power: 35,
    acc: 100,
    kingsRock: true,
  },
  wrap: {
    kind: "damage",
    name: "Wrap",
    pp: 20,
    type: "normal",
    acc: 85,
    power: 15,
    flag: "trap",
  },
  // --
  roar: {kind: "fail", name: "Roar", pp: 20, acc: 100, type: "normal", why: "whirlwind"},
  splash: {kind: "fail", name: "Splash", pp: 40, type: "normal", why: "splash"},
  teleport: {kind: "fail", name: "Teleport", pp: 20, type: "psychic", why: "fail_generic"},
  whirlwind: {kind: "fail", name: "Whirlwind", pp: 20, acc: 85, type: "normal", why: "whirlwind"},
  // >== Generation 2
  attract: {
    name: "Attract",
    pp: 15,
    acc: 100,
    type: "normal",
    protect: true,
    exec(battle, user, target) {
      if (
        !user.base.gender ||
        !target.base.gender ||
        user.base.gender === target.base.gender ||
        target.v.attract
      ) {
        battle.info(user, "fail_generic");
        return;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      target.v.attract = user;
      battle.info(target, "cAttract", [{id: target.owner.id, v: {flags: target.v.cflags}}]);
    },
  },
  batonpass: {
    name: "Baton Pass",
    pp: 40,
    type: "normal",
    exec(battle, user) {
      if (user.owner.team.every(p => p === user.base.real || p.hp === 0)) {
        return battle.info(user, "fail_generic");
      }

      user.v.inBatonPass = true;
      battle.event({type: "baton_pass", src: user.owner.id});
    },
  },
  bellydrum: {
    name: "Belly Drum",
    pp: 10,
    acc: 100,
    type: "normal",
    exec(battle, user) {
      if (user.v.stages.atk >= 6) {
        battle.info(user, "fail_generic");
        return;
      }

      const dmg = idiv(user.base.stats.hp, 2);
      if (user.base.hp < dmg) {
        battle.info(user, "fail_generic");

        if (battle.gen.id <= 2) {
          battle.event({
            type: "bug",
            bug: "bug_gen2_bellydrum",
            volatiles: user.setStage("atk", Math.min(user.v.stages.atk + 2, 6), battle, false),
          });
        }
        return;
      }

      user.damage(
        dmg,
        user,
        battle,
        false,
        "belly_drum",
        true,
        undefined,
        user.setStage("atk", +6, battle, false),
      );
    },
  },
  conversion2: {
    name: "Conversion2",
    pp: 30,
    type: "normal",
    exec(battle, user) {
      const lastMove = user.v.lastHitBy;
      if (!lastMove || lastMove.type === "???") {
        battle.info(user, "fail_generic");
        return;
      }

      const types = (Object.keys(battle.gen.typeChart) as Type[]).filter(type => {
        return (battle.gen.typeChart[lastMove.type][type] ?? 1) < 1;
      });

      const v = user.setVolatile("types", [battle.rng.choice(types)!]);
      battle.event({
        type: "conversion",
        src: user.owner.id,
        types: [...user.v.types],
        volatiles: [v],
      });
    },
  },
  curse: {
    name: "Curse",
    pp: 10,
    type: "???",
    exec(battle, user, target) {
      if (!user.v.types.includes("ghost")) {
        if (user.v.stages.atk >= 6 && user.v.stages.def >= 6) {
          battle.info(user, "fail_generic");
          return;
        }
        // prettier-ignore
        user.modStages([["spe", -1], ["atk", +1], ["def", +1]], battle);
      } else {
        if (!battle.checkAccuracy(this, user, target)) {
          return;
        } else if (target.v.substitute) {
          battle.info(user, "fail_generic");
          return;
        }

        user.damage(
          idiv(user.base.stats.hp, 2),
          target,
          battle,
          false,
          "set_curse",
          true,
          undefined,
          [target.setFlag(VF.curse)],
        );
      }
    },
  },
  encore: {
    name: "Encore",
    pp: 5,
    acc: 100,
    type: "normal",
    noEncore: true,
    protect: true,
    exec(battle, user, target) {
      if (
        target.v.lastMoveIndex === undefined ||
        target.v.encore ||
        battle.gen.moveList[target.base.moves[target.v.lastMoveIndex]].noEncore ||
        !target.base.pp[target.v.lastMoveIndex]
      ) {
        return battle.info(user, "fail_generic");
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      target.v.encore = {indexInMoves: target.v.lastMoveIndex, turns: battle.rng.int(2, 6) + 1};
      battle.info(target, "cEncore", [{id: target.owner.id, v: {flags: target.v.cflags}}]);
    },
  },
  foresight: {
    name: "Foresight",
    pp: 40,
    acc: 100,
    type: "normal",
    protect: true,
    exec(battle, user, target) {
      if (user.v.hasFlag(VF.foresight)) {
        return battle.info(user, "fail_generic");
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      battle.event({
        type: "foresight",
        src: user.owner.id,
        target: target.owner.id,
        volatiles: [target.setFlag(VF.foresight)],
      });
    },
  },
  futuresight: {
    name: "Future Sight",
    pp: 15,
    power: 80,
    acc: 90,
    type: "psychic",
    exec(battle, user, target) {
      if (target.futureSight) {
        return battle.info(user, "fail_generic");
      }

      const [atk, def] = battle.gen.getDamageVariables(true, user, target, false);
      const dmg = battle.gen.calcDamage({
        atk,
        def,
        pow: this.power,
        lvl: user.base.level,
        eff: 1,
        isCrit: false,
        isStab: false,
        rand: battle.rng,
      });
      target.futureSight = {damage: dmg, turns: 3};
      battle.info(user, "future_sight");
    },
  },
  healbell: {
    name: "Heal Bell",
    pp: 5,
    type: "normal",
    exec(battle, user, target) {
      user.unstatus(battle, "heal_bell");
      user.owner.team.forEach(poke => {
        poke.status = undefined;
        if (target.owner.sleepClausePoke === poke) {
          target.owner.sleepClausePoke = undefined;
        }
      });
    },
  },
  nightmare: {
    name: "Nightmare",
    pp: 15,
    type: "ghost",
    exec(battle, user, target) {
      if (target.v.hasFlag(VF.nightmare) || target.base.status !== "slp") {
        return battle.info(user, "fail_generic");
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      battle.info(target, "nightmare", [target.setFlag(VF.nightmare)]);
    },
  },
  painsplit: {
    name: "Pain Split",
    pp: 20,
    acc: 100,
    type: "ghost",
    exec(battle, user, target) {
      if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      battle.info(user, "pain_split");

      const hp = idiv(user.base.hp + target.base.hp, 2);
      if (user.base.hp < hp) {
        user.recover(hp - user.base.hp, user, battle, "pain_split");
      } else {
        user.damage(user.base.hp - hp, user, battle, false, "pain_split", true);
      }

      if (target.base.hp < hp) {
        target.recover(hp - target.base.hp, user, battle, "pain_split");
      } else {
        target.damage(target.base.hp - hp, user, battle, false, "pain_split", true);
      }
    },
  },
  perishsong: {
    name: "Perish Song",
    pp: 5,
    type: "normal",
    exec(battle, user, target) {
      user.v.perishCount = target.v.perishCount = 4;
      battle.info(user, "perish_song", [
        {id: user.owner.id, v: {perishCount: 4}},
        {id: target.owner.id, v: {perishCount: 4}},
      ]);
    },
  },
  psychup: {
    name: "Psych Up",
    pp: 10,
    type: "normal",
    exec(battle, user, target) {
      if (Object.values(target.v.stages).every(v => v === 0)) {
        return battle.info(user, "fail_generic");
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      user.v.stages = {...target.v.stages};
      for (const stat of stageStatKeys) {
        user.recalculateStat(battle, stat, false);
      }
      battle.event({
        type: "psych_up",
        src: user.owner.id,
        target: target.owner.id,
        volatiles: [
          {id: user.owner.id, v: {stats: user.clientStats(battle), stages: {...user.v.stages}}},
        ],
      });
    },
  },
  sketch: {
    name: "Sketch",
    pp: 1,
    type: "normal",
    noMetronome: true,
    noEncore: true,
    exec(battle, user, target, moveIndex) {
      if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      if (moveIndex === undefined) {
        // called by sleep talk
        moveIndex = user.base.moves.indexOf("sketch");
        // TODO: call by mirror move? is that even possible
        if (moveIndex === -1) {
          console.warn("sketch called with no moveIndex: ", user);
          return battle.info(user, "fail_generic");
        }
      }

      if (!target.v.lastMove) {
        return battle.info(user, "fail_generic");
      }

      const id = battle.moveIdOf(target.v.lastMove)!;
      const idx = target.base.moves.indexOf(id);
      // Fail for struggle, metronome, mirror move, sleep talk
      if (
        idx === -1 ||
        target.v.lastMove === this ||
        target.v.lastMove.noEncore ||
        user.base.moves.includes(id)
      ) {
        return battle.info(user, "fail_generic");
      }

      user.base.moves[moveIndex] = id;
      user.base.pp[moveIndex] = battle.gen.getMaxPP(target.v.lastMove);
      battle.event({type: "sketch", src: user.owner.id, move: id});
    },
  },
  sleeptalk: {
    name: "Sleep Talk",
    pp: 10,
    type: "normal",
    noMetronome: true,
    noEncore: true,
    sleepOnly: true,
    whileAsleep: true,
    noSleepTalk: true,
    exec(battle, user, target) {
      const m = battle.rng.choice(user.base.moves.filter(m => !battle.gen.moveList[m].noSleepTalk));
      if (!m) {
        return battle.info(user, "fail_generic");
      }

      // TODO: https://bulbapedia.bulbagarden.net/wiki/Sleep_Talk_(move)
      // If Sleep Talk calls Metronome or Mirror Move (which are selectable by Sleep Talk only in
      // this generation) and thus in turn calls a two-turn move, the move will fail.
      return battle.callUseMove(battle.gen.moveList[m], user, target);
    },
  },
  spikes: {
    name: "Spikes",
    pp: 20,
    type: "ground",
    exec(battle, user, target) {
      if (target.owner.spikes) {
        return battle.info(user, "fail_generic");
      }

      battle.info(target, "spikes");
      target.owner.spikes = true;
    },
  },
  spite: {
    name: "Spite",
    pp: 10,
    acc: 100,
    type: "ghost",
    protect: true,
    exec(battle, user, target) {
      if (!battle.checkAccuracy(this, user, target)) {
        return;
      } else if (!target.v.lastMove) {
        return battle.info(user, "fail_generic");
      }
      const id = battle.moveIdOf(target.v.lastMove)!;
      const idx = target.base.moves.indexOf(id);
      // Fail for struggle, metronome, mirror move, sleep talk unless it called a move we already
      // know (which metronome cant in gen 2)
      if (idx === -1 || !target.base.pp[idx]) {
        return battle.info(user, "fail_generic");
      }

      const amount = Math.min(battle.rng.int(2, 5), target.base.pp[idx]);
      target.base.pp[idx] -= amount;
      battle.event({type: "spite", src: target.owner.id, move: id, amount});
    },
  },
  swagger: {
    name: "Swagger",
    pp: 15,
    acc: 90,
    type: "normal",
    protect: true,
    exec(battle, user, target) {
      if (target.owner.screens.safeguard) {
        target.modStages([["atk", +2]], battle);
        return battle.info(user, "safeguard_protect");
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      } else if (!target.modStages([["atk", +2]], battle)) {
        return battle.info(user, "fail_generic");
      } else {
        target.confuse(battle);
      }
    },
  },
  // --
  lockon: {
    kind: "lockOn",
    name: "Lock On",
    pp: 5,
    type: "normal",
    acc: 100,
  },
  mindreader: {
    kind: "lockOn",
    name: "Mind Reader",
    pp: 5,
    type: "normal",
    acc: 100,
  },
  // --
  meanlook: {
    kind: "noSwitch",
    name: "Mean Look",
    pp: 5,
    type: "normal",
  },
  spiderweb: {
    kind: "noSwitch",
    name: "Spider Web",
    pp: 10,
    type: "bug",
  },
  // --
  detect: {
    kind: "protect",
    name: "Detect",
    pp: 5,
    priority: +3,
    type: "fight",
    noMetronome: true,
  },
  endure: {
    kind: "protect",
    name: "Endure",
    pp: 10,
    priority: +2,
    type: "normal",
    noMetronome: true,
    endure: true,
  },
  protect: {
    kind: "protect",
    name: "Protect",
    pp: 10,
    priority: +3,
    type: "normal",
    noMetronome: true,
  },
  // --
  moonlight: {
    kind: "recover",
    name: "Moonlight",
    pp: 5,
    type: "normal",
    why: "recover",
    weather: true,
  },
  morningsun: {
    kind: "recover",
    name: "Morning Sun",
    pp: 5,
    type: "normal",
    why: "recover",
    weather: true,
  },
  synthesis: {
    kind: "recover",
    name: "Synthesis",
    pp: 5,
    type: "grass",
    why: "recover",
    weather: true,
  },
  // --
  destinybond: {
    kind: "volatile",
    name: "Destiny Bond",
    pp: 5,
    type: "ghost",
    noMetronome: true,
    flag: VF.destinyBond,
  },
  safeguard: {kind: "screen", name: "Safeguard", pp: 25, type: "normal", screen: "safeguard"},
  // --
  raindance: {kind: "weather", weather: "rain", name: "Rain Dance", pp: 5, type: "water"},
  sandstorm: {kind: "weather", weather: "sand", name: "Sandstorm", pp: 10, type: "rock"},
  sunnyday: {kind: "weather", weather: "sun", name: "Sunny Day", pp: 5, type: "fire"},
  // --
  milkdrink: {kind: "recover", name: "Milk Drink", pp: 10, type: "normal", why: "recover"},
  // --
  sweetkiss: {kind: "confuse", name: "Sweet Kiss", pp: 10, type: "normal", acc: 75},
  // --
  charm: {kind: "stage", name: "Charm", pp: 20, type: "normal", acc: 100, stages: [["atk", -2]]},
  cottonspore: {
    kind: "stage",
    name: "Cotton Spore",
    pp: 40,
    type: "grass",
    acc: 100,
    stages: [["spe", -2]],
  },
  scaryface: {
    kind: "stage",
    name: "Scary Face",
    pp: 10,
    type: "normal",
    acc: 90,
    stages: [["spe", -2]],
  },
  sweetscent: {
    kind: "stage",
    name: "Sweet Scent",
    pp: 20,
    type: "normal",
    acc: 100,
    stages: [["eva", -1]],
  },
  // --
  aeroblast: {
    kind: "damage",
    name: "Aeroblast",
    pp: 5,
    type: "flying",
    power: 100,
    acc: 95,
    flag: "high_crit",
    kingsRock: true,
  },
  ancientpower: {
    kind: "damage",
    name: "Ancient Power",
    pp: 5,
    type: "rock",
    power: 60,
    acc: 100,
    // prettier-ignore
    effect: [10, [["atk", +1], ["def", +1], ["spa", +1], ["spd", +1], ["spe", +1]], true],
  },
  beatup: {
    kind: "damage",
    name: "Beat Up",
    pp: 10,
    type: "dark",
    power: 10,
    acc: 100,
    kingsRock: true,
    flag: "beatup",
  },
  bonerush: {
    kind: "damage",
    name: "Bone Rush",
    pp: 10,
    type: "ground",
    power: 25,
    acc: 90,
    flag: "multi",
    kingsRock: true,
  },
  crosschop: {
    kind: "damage",
    name: "Cross Chop",
    pp: 5,
    type: "fight",
    power: 100,
    acc: 80,
    flag: "high_crit",
    kingsRock: true,
  },
  crunch: {
    kind: "damage",
    name: "Crunch",
    pp: 15,
    type: "dark",
    power: 80,
    acc: 100,
    effect: [20, [["spd", -1]]],
  },
  dragonbreath: {
    kind: "damage",
    name: "DragonBreath",
    pp: 20,
    type: "dragon",
    power: 60,
    acc: 100,
    effect: [30, "par"],
  },
  dynamicpunch: {
    kind: "damage",
    name: "DynamicPunch",
    pp: 5,
    type: "fight",
    power: 100,
    acc: 50,
    effect: [99.6 /* 255/256 */, "confusion"],
  },
  extremespeed: {
    kind: "damage",
    name: "ExtremeSpeed",
    pp: 5,
    type: "normal",
    power: 80,
    acc: 100,
    priority: +1,
    kingsRock: true,
  },
  falseswipe: {
    kind: "damage",
    name: "False Swipe",
    pp: 40,
    type: "normal",
    power: 40,
    acc: 100,
    flag: "false_swipe",
    kingsRock: true,
  },
  feintattack: {
    kind: "damage",
    name: "Faint Attack",
    pp: 20,
    type: "dark",
    power: 60,
    kingsRock: true,
  },
  flail: {
    kind: "damage",
    name: "Flail",
    pp: 15,
    type: "normal",
    power: 0,
    acc: 100,
    getPower: getFlailPower,
    flag: "flail",
    kingsRock: true,
  },
  flamewheel: {
    kind: "damage",
    name: "Flame Wheel",
    pp: 25,
    type: "fire",
    power: 60,
    acc: 100,
    effect: [10, "brn"],
    selfThaw: true,
  },
  frustration: {
    kind: "damage",
    name: "Frustration",
    pp: 15,
    type: "normal",
    power: 0,
    acc: 100,
    getPower: user => idiv(255 - user.friendship, 2.5),
    kingsRock: true,
  },
  furycutter: {
    kind: "damage",
    name: "Fury Cutter",
    pp: 20,
    type: "bug",
    power: 10,
    acc: 95,
    flag: "fury_cutter",
    kingsRock: true,
  },
  gigadrain: {
    kind: "damage",
    name: "Giga Drain",
    pp: 5,
    type: "grass",
    power: 60,
    acc: 100,
    flag: "drain",
    kingsRock: true,
  },
  hiddenpower: {
    kind: "damage",
    name: "Hidden Power",
    pp: 15,
    type: "normal",
    power: 0,
    acc: 100,
    kingsRock: true,
    getType(user) {
      // prettier-ignore
      const hpTypes: Type[] = [
        "fight", "flying", "poison", "ground", "rock", "bug", "ghost", "steel", "fire", "water",
        "grass", "electric", "psychic", "ice", "dragon", "dark",
      ];
      return hpTypes[(((user.dvs.atk ?? 15) & 0b11) << 2) | ((user.dvs.def ?? 15) & 0b11)];
    },
    getPower({dvs}) {
      const msb = (dv?: number) => +(((dv ?? 15) & (1 << 3)) !== 0);

      const x = msb(dvs.spa) | (msb(dvs.spe) << 1) | (msb(dvs.def) << 2) | (msb(dvs.atk) << 3);
      const y = (dvs.spa ?? 15) & 0b11;
      return idiv(5 * x + y, 2) + 31;
    },
  },
  icywind: {
    kind: "damage",
    name: "Icy Wind",
    pp: 15,
    type: "ice",
    power: 55,
    acc: 95,
    effect: [99.6 /* 255/256 */, [["spe", -1]]],
  },
  irontail: {
    kind: "damage",
    name: "Iron Tail",
    pp: 15,
    type: "steel",
    power: 100,
    acc: 75,
    effect: [30, [["def", -1]]],
  },
  machpunch: {
    kind: "damage",
    name: "Mach Punch",
    pp: 30,
    type: "fight",
    power: 40,
    acc: 100,
    priority: +1,
    kingsRock: true,
  },
  magnitude: {
    kind: "damage",
    name: "Magnitude",
    pp: 30,
    type: "ground",
    power: 0,
    acc: 100,
    flag: "magnitude",
    ignore: ["dig"],
    punish: true,
    kingsRock: true,
  },
  megahorn: {
    kind: "damage",
    name: "Megahorn",
    pp: 10,
    type: "bug",
    power: 120,
    acc: 85,
    kingsRock: true,
  },
  metalclaw: {
    kind: "damage",
    name: "Metal Claw",
    pp: 35,
    type: "steel",
    power: 50,
    acc: 95,
    effect: [10, [["atk", +1]], true],
  },
  mirrorcoat: {
    kind: "damage",
    name: "Mirror Coat",
    power: 0,
    pp: 20,
    type: "psychic",
    acc: 100,
    priority: -1,
    noMetronome: true,
    kingsRock: true,
    getDamage(battle, user, target) {
      if (
        !user.v.retaliateDamage ||
        !target.v.lastMove ||
        !isSpecial(target.v.lastMove.type) ||
        target.v.lastMove === battle.gen.moveList.beatup
      ) {
        return false;
      }
      return user.v.retaliateDamage * 2;
    },
  },
  mudslap: {
    kind: "damage",
    name: "Mud Slap",
    pp: 10,
    type: "ground",
    power: 20,
    acc: 100,
    effect: [99.6 /* 255/256 */, [["acc", -1]]],
  },
  octazooka: {
    kind: "damage",
    name: "Octazooka",
    pp: 10,
    type: "water",
    power: 65,
    acc: 85,
    effect: [50, [["acc", -1]]],
  },
  outrage: {
    kind: "damage",
    name: "Outrage",
    pp: 15,
    type: "dragon",
    power: 90,
    acc: 100,
    flag: "multi_turn",
    kingsRock: true,
  },
  powdersnow: {
    kind: "damage",
    name: "Powder Snow",
    pp: 25,
    type: "ice",
    power: 40,
    acc: 100,
    effect: [10, "frz"],
  },
  present: {
    kind: "damage",
    name: "Present",
    pp: 15,
    power: 0,
    type: "normal",
    acc: 90,
    flag: "present",
    kingsRock: true,
  },
  pursuit: {
    kind: "damage",
    name: "Pursuit",
    pp: 20,
    type: "dark",
    power: 40,
    acc: 100,
    kingsRock: true,
  },
  rapidspin: {
    kind: "damage",
    name: "Rapid Spin",
    pp: 40,
    type: "normal",
    power: 20,
    acc: 100,
    flag: "rapid_spin",
    kingsRock: true,
  },
  return: {
    kind: "damage",
    name: "Return",
    pp: 20,
    type: "normal",
    power: 0,
    acc: 100,
    kingsRock: true,
    getPower: user => idiv(user.friendship, 2.5),
  },
  reversal: {
    kind: "damage",
    name: "Reversal",
    pp: 15,
    type: "fight",
    power: 0,
    acc: 100,
    flag: "flail",
    kingsRock: true,
    getPower: getFlailPower,
  },
  rocksmash: {
    kind: "damage",
    name: "Rock Smash",
    pp: 15,
    type: "fight",
    power: 20,
    acc: 100,
    effect: [50, [["def", -1]]],
  },
  rollout: {
    kind: "damage",
    name: "Rollout",
    pp: 20,
    type: "rock",
    power: 30,
    acc: 90,
    flag: "rollout",
    kingsRock: true,
  },
  sacredfire: {
    kind: "damage",
    name: "Sacred Fire",
    pp: 5,
    type: "fire",
    power: 100,
    acc: 95,
    effect: [50, "brn"],
    selfThaw: true,
  },
  shadowball: {
    kind: "damage",
    name: "Shadow Ball",
    pp: 15,
    type: "ghost",
    power: 80,
    acc: 100,
    effect: [20, [["spd", -1]]],
  },
  sludgebomb: {
    kind: "damage",
    name: "Sludge Bomb",
    pp: 10,
    type: "poison",
    power: 90,
    acc: 100,
    effect: [30, "psn"],
  },
  snore: {
    kind: "damage",
    name: "Snore",
    pp: 15,
    type: "normal",
    power: 40,
    acc: 100,
    effect: [30, "flinch"],
    sleepOnly: true,
    whileAsleep: true,
    kingsRock: true,
  },
  spark: {
    kind: "damage",
    name: "Spark",
    pp: 20,
    type: "electric",
    power: 65,
    acc: 100,
    effect: [30, "par"],
  },
  steelwing: {
    kind: "damage",
    name: "Steel Wing",
    pp: 25,
    type: "steel",
    power: 70,
    acc: 90,
    effect: [10, [["def", +1]], true],
  },
  thief: {
    kind: "damage",
    name: "Thief",
    pp: 10,
    type: "dark",
    power: 40,
    acc: 100,
    noMetronome: true,
    effect: [99.6, "thief"],
    kingsRock: true,
  },
  triplekick: {
    kind: "damage",
    name: "Triple Kick",
    pp: 10,
    type: "fight",
    power: 10,
    acc: 90,
    flag: "triple",
    kingsRock: true,
  },
  twister: {
    kind: "damage",
    name: "Twister",
    pp: 20,
    type: "dragon",
    power: 40,
    acc: 100,
    effect: [20, "flinch"],
    ignore: ["fly", "bounce"],
    punish: true,
  },
  vitalthrow: {
    kind: "damage",
    name: "Vital Throw",
    pp: 10,
    type: "fight",
    power: 70,
    priority: -1,
    kingsRock: true,
  },
  whirlpool: {
    kind: "damage",
    name: "Whirlpool",
    pp: 15,
    type: "water",
    power: 15,
    acc: 70,
    flag: "trap",
  },
  zapcannon: {
    kind: "damage",
    name: "Zap Cannon",
    pp: 5,
    type: "electric",
    power: 100,
    acc: 50,
    effect: [99.6 /* 255/256 */, "par"],
  },
  // --
});

export const moveList = internalMoveList as Record<MoveId, Move>;

function getFlailPower(this: DamagingMove, user: Pokemon) {
  const percent = hpPercentExact(user.hp, user.stats.hp);
  if (percent >= 68.8) {
    return 20;
  } else if (percent >= 35.4) {
    return 40;
  } else if (percent >= 20.8) {
    return 80;
  } else if (percent >= 10.4) {
    return 100;
  } else if (percent >= 4.2) {
    return 150;
  } else {
    return 200;
  }
}
