import {moveFunctions, type Move} from "./index";
import {transform} from "../pokemon";
import {stageKeys, volatileFlags} from "../utils";

export type MoveId = keyof typeof internalMoveList;

const internalMoveList = Object.freeze({
  bide: {
    name: "Bide",
    pp: 10,
    type: "normal",
    use(battle, user, target, moveIndex) {
      if (!user.v.bide) {
        return moveFunctions.default.use!.call(this, battle, user, target, moveIndex);
      }

      // TODO: bulbapedia says lastDamage includes the opponent's self-inflicted confusion damage
      user.v.bide.dmg += user.lastDamage;
      if (--user.v.bide.turns !== 0) {
        return false;
      }

      battle.info(user, "bide");

      const dmg = user.v.bide.dmg;
      user.v.bide = undefined;

      if (dmg === 0) {
        battle.info(user, "miss");
        return false;
      }

      return target.damage(dmg * 2, user, battle, false, "attacked").dead;
    },
    exec(battle, user, target) {
      target.lastDamage = 0;
      user.v.bide = {move: this, turns: battle.rng.int(2, 3), dmg: 0};
      return false;
    },
  },
  conversion: {
    name: "Conversion",
    pp: 30,
    type: "normal",
    exec(battle, user, target) {
      user.v.types = [...target.v.types];
      battle.event({
        type: "conversion",
        user: user.owner.id,
        target: target.owner.id,
        types: [...user.v.types],
        volatiles: [{id: user.owner.id, v: {conversion: [...user.v.types]}}],
      });

      return false;
    },
  },
  disable: {
    name: "Disable",
    pp: 20,
    type: "normal",
    acc: 55,
    exec(battle, user, target) {
      target.lastDamage = 0;

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
        volatiles: [{id: target.owner.id, v: {disabled: true}}],
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

      for (const k of volatileFlags) {
        user.v.flags[k] = target.v.flags[k] = false;
      }

      user.v.counter = target.v.counter = 0;
      user.v.confusion = target.v.confusion = 0;
      user.v.disabled = target.v.disabled = undefined;
      user.v.stats = {...user.base.stats};
      target.v.stats = {...target.base.stats};

      if (user.base.status === "tox") {
        user.base.status = "psn";
      }

      if (target.base.status === "frz" || target.base.status === "slp") {
        // battle.info(target, target.base.status === "frz" ? "thaw" : "wake");
        target.base.sleepTurns = 0;
        target.v.hazed = true;
      }

      target.base.status = undefined;

      battle.info(user, "haze", [
        {id: user.owner.id, v: user.v.toClientVolatiles(user.base, battle)},
        {id: target.owner.id, v: target.v.toClientVolatiles(target.base, battle)},
      ]);
      return false;
    },
  },
  leechseed: {
    name: "Leech Seed",
    pp: 15,
    type: "grass",
    acc: 80,
    exec(battle, user, target) {
      if (target.v.types.includes(this.type)) {
        battle.info(target, "immune");
        return false;
      } else if (target.v.flags.seeded) {
        battle.info(target, "fail_generic");
        return false;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return false;
      }

      target.v.flags.seeded = true;
      battle.info(target, "seeded", [{id: target.owner.id, v: {seeded: true}}]);
      return false;
    },
  },
  metronome: {
    name: "Metronome",
    pp: 10,
    type: "normal",
    exec(battle, user, target): boolean {
      target.lastDamage = 0;
      return battle.callUseMove(moveList[battle.rng.choice(validMetronome)!], user, target);
    },
  },
  mimic: {
    name: "Mimic",
    pp: 10,
    type: "normal",
    acc: 100,
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
    exec(battle, user, target) {
      target.lastDamage = 0;
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
      // Gen 1 bug, if you have exactly 25% hp you can create a substitute and instantly die
      const hp = Math.floor(user.base.stats.hp / 4);
      if (user.v.substitute > 0) {
        battle.info(user, "has_substitute");
        return false;
      } else if (hp > user.base.hp) {
        battle.info(user, "cant_substitute");
        return false;
      }

      const {dead} = user.damage(hp, user, battle, false, "substitute");
      user.v.substitute = hp + 1;
      return dead;
    },
  },
  transform: {
    name: "Transform",
    pp: 10,
    type: "normal",
    exec(battle, user, target) {
      target.lastDamage = 0;
      user.base = transform(user.base.real, target.base);

      for (const k of stageKeys) {
        user.v.stages[k] = target.v.stages[k];
        if (k === "atk" || k === "def" || k == "spa" || k === "spe") {
          user.applyStages(k, false);
        }
      }

      user.v.types = [...target.v.types];
      battle.event({
        type: "transform",
        src: user.owner.id,
        target: target.owner.id,
        volatiles: [{id: user.owner.id, v: user.v.toClientVolatiles(user.base, battle)}],
      });
      return false;
    },
  },
  // --
  focusenergy: {kind: "volatile", name: "Focus Energy", pp: 30, type: "normal", flag: "focus"},
  lightscreen: {
    kind: "volatile",
    name: "Light Screen",
    pp: 30,
    type: "psychic",
    flag: "light_screen",
  },
  mist: {kind: "volatile", name: "Mist", pp: 30, type: "ice", flag: "mist"},
  reflect: {kind: "volatile", name: "Reflect", pp: 20, type: "psychic", flag: "reflect"},
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
  absorb: {kind: "damage", name: "Absorb", pp: 20, type: "grass", power: 20, acc: 100},
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
  },
  bind: {kind: "damage", name: "Bind", pp: 20, type: "normal", acc: 75, power: 15, flag: "trap"},
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
  clamp: {kind: "damage", name: "Clamp", pp: 10, type: "water", acc: 75, power: 35, flag: "trap"},
  cometpunch: {
    kind: "damage",
    name: "Comet Punch",
    pp: 15,
    type: "normal",
    power: 18,
    acc: 85,
    flag: "multi",
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
    flag: "counter",
  },
  crabhammer: {
    kind: "damage",
    name: "Crabhammer",
    pp: 10,
    type: "water",
    power: 90,
    acc: 85,
    flag: "high_crit",
  },
  cut: {kind: "damage", name: "Cut", pp: 30, type: "normal", power: 50, acc: 95},
  dig: {
    kind: "damage",
    name: "Dig",
    pp: 10,
    type: "ground",
    power: 100,
    acc: 100,
    flag: "charge_invuln",
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
  },
  doublekick: {
    kind: "damage",
    name: "Double Kick",
    pp: 30,
    type: "fight",
    power: 30,
    acc: 100,
    flag: "double",
  },
  doubleslap: {
    kind: "damage",
    name: "Double Slap",
    pp: 10,
    type: "normal",
    power: 15,
    acc: 85,
    flag: "multi",
  },
  dragonrage: {
    kind: "damage",
    name: "Dragon Rage",
    pp: 10,
    type: "dragon",
    acc: 100,
    power: 1,
    dmg: 40,
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
  drillpeck: {kind: "damage", name: "Drill Peck", pp: 20, type: "flying", power: 80, acc: 100},
  eggbomb: {kind: "damage", name: "Egg Bomb", pp: 10, type: "normal", power: 100, acc: 75},
  earthquake: {kind: "damage", name: "Earthquake", pp: 10, type: "ground", power: 100, acc: 100},
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
    flag: "charge_invuln",
  },
  furyattack: {
    kind: "damage",
    name: "Fury Attack",
    pp: 20,
    type: "normal",
    power: 15,
    acc: 85,
    flag: "multi",
  },
  furyswipes: {
    kind: "damage",
    name: "Fury Swipes",
    pp: 15,
    type: "normal",
    power: 18,
    acc: 80,
    flag: "multi",
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
  gust: {kind: "damage", name: "Gust", pp: 35, type: "normal", power: 40, acc: 100},
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
  },
  hornattack: {kind: "damage", name: "Horn Attack", pp: 25, type: "normal", power: 65, acc: 100},
  horndrill: {
    kind: "damage",
    name: "Horn Drill",
    pp: 5,
    type: "normal",
    acc: 30,
    power: 1,
    flag: "ohko",
  },
  hydropump: {kind: "damage", name: "Hydro Pump", pp: 5, type: "water", power: 120, acc: 80},
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
  },
  karatechop: {
    kind: "damage",
    name: "Karate Chop",
    pp: 25,
    type: "normal",
    power: 50,
    acc: 100,
    flag: "high_crit",
  },
  leechlife: {
    kind: "damage",
    name: "Leech Life",
    pp: 15,
    type: "bug",
    power: 20,
    acc: 100,
    flag: "drain",
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
  },
  megakick: {kind: "damage", name: "Mega Kick", pp: 5, type: "normal", power: 120, acc: 75},
  megapunch: {kind: "damage", name: "Mega Punch", pp: 20, type: "normal", power: 80, acc: 85},
  nightshade: {
    kind: "damage",
    name: "Night Shade",
    pp: 15,
    type: "ghost",
    acc: 100,
    power: 1,
    flag: "level",
  },
  payday: {
    kind: "damage",
    name: "Pay Day",
    pp: 20,
    type: "normal",
    power: 40,
    acc: 100,
    flag: "payday",
  },
  peck: {kind: "damage", name: "Peck", pp: 35, type: "flying", power: 35, acc: 100},
  petaldance: {
    kind: "damage",
    name: "Petal Dance",
    pp: 20,
    type: "grass",
    power: 70,
    acc: 100,
    flag: "multi_turn",
  },
  pinmissile: {
    kind: "damage",
    name: "Pin Missile",
    pp: 20,
    type: "bug",
    power: 14,
    acc: 85,
    flag: "multi",
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
  pound: {kind: "damage", name: "Pound", pp: 35, type: "normal", power: 40, acc: 100},
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
    flag: "psywave",
  },
  quickattack: {
    kind: "damage",
    name: "Quick Attack",
    pp: 30,
    type: "normal",
    power: 40,
    acc: 100,
    priority: +1,
  },
  rage: {kind: "damage", name: "Rage", pp: 20, type: "normal", acc: 100, power: 20, flag: "rage"},
  razorleaf: {
    kind: "damage",
    name: "Razor Leaf",
    pp: 25,
    type: "grass",
    power: 55,
    acc: 95,
    flag: "high_crit",
  },
  razorwind: {
    kind: "damage",
    name: "Razor Wind",
    pp: 10,
    type: "normal",
    power: 80,
    acc: 75,
    flag: "charge",
  },
  rockslide: {kind: "damage", name: "Rock Slide", pp: 10, type: "rock", power: 75, acc: 90},
  rockthrow: {kind: "damage", name: "Rock Throw", pp: 15, type: "rock", power: 50, acc: 65},
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
  },
  scratch: {kind: "damage", name: "Scratch", pp: 35, type: "normal", power: 40, acc: 100},
  seismictoss: {
    kind: "damage",
    name: "Seismic Toss",
    pp: 20,
    type: "fight",
    acc: 100,
    power: 1,
    flag: "level",
  },
  skullbash: {
    kind: "damage",
    name: "Skull Bash",
    pp: 15,
    type: "normal",
    power: 100,
    acc: 100,
    flag: "charge",
  },
  skyattack: {
    kind: "damage",
    name: "Sky Attack",
    pp: 5,
    type: "flying",
    power: 140,
    acc: 90,
    flag: "charge",
  },
  slam: {kind: "damage", name: "Slam", pp: 20, type: "normal", power: 80, acc: 75},
  slash: {
    kind: "damage",
    name: "Slash",
    pp: 20,
    type: "normal",
    power: 70,
    acc: 100,
    flag: "high_crit",
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
    flag: "charge_sun",
  },
  sonicboom: {
    kind: "damage",
    name: "SonicBoom",
    pp: 20,
    type: "normal",
    acc: 90,
    power: 1,
    dmg: 20,
  },
  spikecannon: {
    kind: "damage",
    name: "Spike Cannon",
    pp: 15,
    type: "normal",
    power: 20,
    acc: 100,
    flag: "multi",
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
  strength: {kind: "damage", name: "Strength", pp: 15, type: "normal", power: 80, acc: 100},
  struggle: {
    kind: "damage",
    name: "Struggle",
    pp: 10,
    type: "normal",
    acc: 100,
    power: 50,
    recoil: 2,
  },
  submission: {
    kind: "damage",
    name: "Submission",
    pp: 25,
    type: "fight",
    power: 80,
    acc: 80,
    recoil: 4,
  },
  superfang: {
    kind: "damage",
    name: "Super Fang",
    pp: 10,
    type: "normal",
    acc: 90,
    power: 1,
    flag: "super_fang",
  },
  surf: {kind: "damage", name: "Surf", pp: 15, type: "water", power: 95, acc: 100},
  swift: {kind: "damage", name: "Swift", pp: 20, type: "normal", power: 60},
  tackle: {kind: "damage", name: "Tackle", pp: 35, type: "normal", power: 35, acc: 95},
  takedown: {
    kind: "damage",
    name: "Take Down",
    pp: 20,
    type: "normal",
    power: 90,
    acc: 85,
    recoil: 4,
  },
  thrash: {
    kind: "damage",
    name: "Thrash",
    pp: 20,
    type: "normal",
    power: 90,
    acc: 100,
    flag: "multi_turn",
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
  },
  vinewhip: {kind: "damage", name: "Vine Whip", pp: 10, type: "grass", power: 35, acc: 100},
  vicegrip: {kind: "damage", name: "Vice Grip", pp: 30, type: "normal", power: 55, acc: 100},
  watergun: {kind: "damage", name: "Water Gun", pp: 25, type: "water", power: 40, acc: 100},
  waterfall: {kind: "damage", name: "Waterfall", pp: 15, type: "water", power: 80, acc: 100},
  wingattack: {kind: "damage", name: "Wing Attack", pp: 35, type: "flying", power: 35, acc: 100},
  wrap: {kind: "damage", name: "Wrap", pp: 20, type: "normal", acc: 85, power: 15, flag: "trap"},
  // --
  roar: {kind: "fail", name: "Roar", pp: 20, acc: 100, type: "normal", why: "whirlwind"},
  splash: {kind: "fail", name: "Splash", pp: 40, type: "normal", why: "splash"},
  teleport: {kind: "fail", name: "Teleport", pp: 20, type: "psychic", why: "fail_generic"},
  whirlwind: {kind: "fail", name: "Whirlwind", pp: 20, acc: 85, type: "normal", why: "whirlwind"},
  // >== Generation 2
  // attract: {},
  // batonpass: {},
  // beatup: {},
  // bellydrum: {},
  // conversion2: {},
  // curse: {},
  // destinybond: {},
  // detect: {},
  // encore: {},
  // endure: {},
  // foresight: {},
  // furycutter: {},
  // futuresight: {},
  // healbell: {},
  // lockon: {},
  // meanlook: {},
  // mindreader: {},
  // mirrorcoat: {},
  // moonlight: {},
  // morningsun: {},
  // nightmare: {},
  // painsplit: {},
  // perishsong: {},
  // present: {},
  // protect: {},
  // psychup: {},
  // pursuit: {},
  // rollout: {},
  // sketch: {},
  // sleeptalk: {},
  // spiderweb: {},
  // spikes: {},
  // spite: {},
  // swagger: {},
  // synthesis: {},
  // triplekick: {},
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
  },
  ancientpower: {
    kind: "damage",
    name: "Ancient Power",
    pp: 5,
    type: "rock",
    power: 60,
    acc: 100,
    // prettier-ignore
    effect: [0.10, [["atk", +1], ["def", +1], ["spa", +1], ["spd", +1], ["spe", +1]]],
    effect_self: true,
  },
  bonerush: {
    kind: "damage",
    name: "Bone Rush",
    pp: 10,
    type: "ground",
    power: 25,
    acc: 90,
    flag: "multi",
  },
  crosschop: {
    kind: "damage",
    name: "Cross Chop",
    pp: 5,
    type: "fight",
    power: 100,
    acc: 80,
    flag: "high_crit",
  },
  crunch: {kind: "damage", name: "Crunch", pp: 15, type: "dark", power: 80, acc: 100},
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
    name: "Extreme Speed",
    pp: 5,
    type: "normal",
    power: 80,
    acc: 100,
    priority: +1,
  },
  falseswipe: {
    kind: "damage",
    name: "False Swipe",
    pp: 40,
    type: "normal",
    power: 40,
    acc: 100,
    flag: "false_swipe",
  },
  feintattack: {kind: "damage", name: "Faint Attack", pp: 20, type: "dark", power: 60},
  flail: {kind: "damage", name: "Flail", pp: 15, type: "normal", power: 0, acc: 100, flag: "flail"},
  flamewheel: {
    kind: "damage",
    name: "Flame Wheel",
    pp: 25,
    type: "fire",
    power: 60,
    acc: 100,
    effect: [10, "brn"],
  },
  frustration: {
    kind: "damage",
    name: "Frustration",
    pp: 15,
    type: "normal",
    power: 0,
    acc: 100,
    flag: "frustration",
  },
  gigadrain: {
    kind: "damage",
    name: "Giga Drain",
    pp: 5,
    type: "grass",
    power: 60,
    acc: 100,
    flag: "drain",
  },
  hiddenpower: {
    kind: "damage",
    name: "Hidden Power",
    pp: 15,
    type: "normal",
    power: 0,
    acc: 100,
    flag: "hidden_power",
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
  },
  megahorn: {kind: "damage", name: "Megahorn", pp: 10, type: "bug", power: 120, acc: 85},
  metalclaw: {
    kind: "damage",
    name: "Metal Claw",
    pp: 35,
    type: "steel",
    power: 50,
    acc: 95,
    effect: [10, [["atk", +1]]],
    effect_self: true,
  },
  mudslap: {
    kind: "damage",
    name: "Mud Slap",
    pp: 10,
    type: "ground",
    power: 20,
    acc: 100,
    effect: [99.6 /* 255/256 */, [["acc", -1]]],
    effect_self: true,
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
  // rapidspin: {
  //   kind: "damage",
  //   name: "Rapid Spin",
  //   pp: 40,
  //   type: "normal",
  //   power: 20,
  //   acc: 100,
  //   flag: "rapid_spin",
  // },
  return: {
    kind: "damage",
    name: "Return",
    pp: 20,
    type: "normal",
    power: 0,
    acc: 100,
    flag: "return",
  },
  reversal: {
    kind: "damage",
    name: "Reversal",
    pp: 15,
    type: "fight",
    power: 0,
    acc: 100,
    flag: "flail",
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
  sacredfire: {
    kind: "damage",
    name: "Sacred Fire",
    pp: 5,
    type: "fire",
    power: 100,
    acc: 95,
    effect: [50, "brn"],
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
  snore: {
    kind: "damage",
    name: "Snore",
    pp: 15,
    type: "normal",
    power: 40,
    acc: 100,
    effect: [30, "flinch"],
    sleepOnly: true,
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
    effect: [10, [["def", +1]]],
    effect_self: true,
  },
  // thief: {
  //   kind: "damage",
  //   name: "Thief",
  //   pp: 10,
  //   type: "dark",
  //   power: 40,
  //   acc: 100,
  //   flag: "thief",
  // },
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
  vitalthrow: {kind: "damage", name: "Vital Throw", pp: 10, type: "fight", power: 70, priority: -1},
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
    effect: [99.6 /* 255/256 */, "confusion"],
  },
  // --
} satisfies Record<string, Move>);

export const moveList = internalMoveList as Record<MoveId, Move>;

// prettier-ignore
export const validMetronome: MoveId[] = [
  "bide", "conversion", "disable", "haze", "leechseed", "mimic", "mirrormove", "substitute",
  "transform", "focusenergy", "lightscreen", "mist", "reflect", "recover", "rest", "softboiled",
  "confuseray", "supersonic", "glare", "hypnosis", "lovelykiss", "poisongas", "poisonpowder",
  "sing", "sleeppowder", "spore", "stunspore", "thunderwave", "toxic", "acidarmor", "agility",
  "amnesia", "barrier", "defensecurl", "doubleteam", "flash", "growl", "growth", "harden",
  "kinesis", "leer", "meditate", "minimize", "sandattack", "screech", "sharpen", "smokescreen",
  "stringshot", "swordsdance", "tailwhip", "withdraw", "absorb", "acid", "aurorabeam", "barrage",
  "bind", "bodyslam", "bonemerang", "bubble", "bubblebeam", "bite", "blizzard", "boneclub", "clamp",
  "cometpunch", "confusion", "constrict", "counter", "crabhammer", "cut", "dig", "dizzypunch",
  "doubleedge", "doublekick", "doubleslap", "dragonrage", "dreameater", "drillpeck", "eggbomb",
  "earthquake", "ember", "explosion", "fireblast", "firepunch", "firespin", "fissure",
  "flamethrower", "fly", "furyattack", "furyswipes", "guillotine", "gust", "headbutt", "hijumpkick",
  "hornattack", "horndrill", "hydropump", "hyperbeam", "hyperfang", "icebeam", "icepunch",
  "jumpkick", "karatechop", "leechlife", "lick", "lowkick", "megadrain", "megakick", "megapunch",
  "nightshade", "payday", "peck", "petaldance", "pinmissile", "poisonsting", "pound", "psybeam",
  "psychic", "psywave", "quickattack", "rage", "razorleaf", "razorwind", "rockslide", "rockthrow",
  "rollingkick", "selfdestruct", "scratch", "seismictoss", "skullbash", "skyattack", "slam",
  "slash", "sludge", "smog", "solarbeam", "sonicboom", "spikecannon", "stomp", "strength",
  "submission", "superfang", "surf", "swift", "tackle", "takedown", "thrash", "thunder",
  "thunderpunch", "thundershock", "thunderbolt", "triattack", "twineedle", "vinewhip", "vicegrip",
  "watergun", "waterfall", "wingattack", "wrap", "roar", "splash", "teleport", "whirlwind"
];
