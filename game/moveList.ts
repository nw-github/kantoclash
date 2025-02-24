import type { ActivePokemon, Battle } from "./battle";
import {
  Move,
  VolatileFlagMove,
  ConfusionMove,
  DamagingMove,
  AlwaysFailMove,
  RecoveryMove,
  StageMove,
  StatusMove,
  UniqueMove,
} from "./moves";
import { TransformedPokemon } from "./transformed";
import { stageKeys, volatileFlags } from "./utils";

export type MoveId = keyof typeof moveList;

export const moveList = Object.freeze({
  bide: new (class extends Move {
    constructor() {
      super("Bide", 10, "normal");
    }

    override use(battle: Battle, user: ActivePokemon, target: ActivePokemon, moveIndex?: number) {
      if (!user.v.bide) {
        return super.use(battle, user, target, moveIndex);
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
    }

    override execute(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
      target.lastDamage = 0;
      user.v.bide = { move: this, turns: battle.rng.int(2, 3), dmg: 0 };
      return false;
    }
  })(),
  conversion: new UniqueMove({
    name: "Conversion",
    pp: 30,
    type: "normal",
    execute(battle, user, target) {
      user.v.types = [...target.v.types];
      battle.event({
        type: "conversion",
        user: user.owner.id,
        target: target.owner.id,
        types: [...user.v.types],
      });

      return false;
    },
  }),
  disable: new UniqueMove({
    name: "Disable",
    pp: 20,
    type: "normal",
    acc: 55,
    execute(battle, user, target) {
      target.lastDamage = 0;

      const options = [...target.base.moves.keys()].filter(i => target.base.pp[i] !== 0);
      if (!options.length || target.v.disabled) {
        battle.info(user, "fail_generic");
        target.handleRage(battle);
        return false;
      } else if (!this.checkAccuracy(battle, user, target)) {
        target.handleRage(battle);
        return false;
      }

      const indexInMoves = battle.rng.choice(options)!;
      target.v.disabled = { indexInMoves, turns: battle.rng.int(1, 8) };
      battle.event({
        type: "disable",
        id: target.owner.id,
        move: target.base.moves[indexInMoves],
      });
      target.handleRage(battle);
      return false;
    },
  }),
  haze: new UniqueMove({
    name: "Haze",
    pp: 30,
    type: "ice",
    execute(battle, user, target) {
      battle.info(user, "haze");

      for (const k of stageKeys) {
        user.v.stages[k] = target.v.stages[k] = 0;
      }

      for (const k of volatileFlags) {
        user.v.flags[k] = target.v.flags[k] = false;
      }

      user.v.counter = target.v.counter = 0;
      user.v.confusion = target.v.confusion = 0;
      user.v.disabled = target.v.disabled = undefined;
      user.v.stats = { ...user.base.stats };
      target.v.stats = { ...target.base.stats };

      if (user.base.status === "tox") {
        user.base.status = "psn";
      }

      if (target.base.status === "frz" || target.base.status === "slp") {
        battle.info(target, target.base.status === "frz" ? "thaw" : "wake");
        target.base.sleepTurns = 0;
        target.v.hazed = true;
      }

      target.base.status = undefined;
      return false;
    },
  }),
  leechseed: new UniqueMove({
    name: "Leech Seed",
    pp: 15,
    type: "grass",
    acc: 80,
    execute(battle, user, target) {
      if (target.v.types.includes(this.type)) {
        battle.info(target, "immune");
        return false;
      } else if (target.v.flags.seeded) {
        battle.info(target, "fail_generic");
        return false;
      } else if (!this.checkAccuracy(battle, user, target)) {
        return false;
      }

      target.v.flags.seeded = true;
      battle.info(target, "seeded");
      return false;
    },
  }),
  metronome: new UniqueMove({
    name: "Metronome",
    pp: 10,
    type: "normal",
    execute(battle, user, target): boolean {
      target.lastDamage = 0;
      const moves: Move[] = Object.values(moveList);

      let move;
      do {
        move = battle.rng.choice(moves);
      } while (move === this || move === moveList.struggle);

      return move!.use(battle, user, target);
    },
  }),
  mimic: new UniqueMove({
    name: "Mimic",
    pp: 10,
    type: "normal",
    acc: 100,
    execute(battle, user, target, indexInMoves) {
      if (!this.checkAccuracy(battle, user, target)) {
        return false;
      }

      user.v.mimic = {
        indexInMoves: indexInMoves ?? user.v.lastMoveIndex ?? -1,
        move: battle.rng.choice(target.base.moves)!,
      };

      battle.event({ type: "mimic", id: user.owner.id, move: user.v.mimic.move });
      return false;
    },
  }),
  mirrormove: new UniqueMove({
    name: "Mirror Move",
    pp: 20,
    type: "flying",
    execute(battle, user, target) {
      target.lastDamage = 0;
      if (!target.v.lastMove || target.v.lastMove === this) {
        battle.info(user, "fail_generic");
        return false;
      }

      return target.v.lastMove.use(battle, user, target);
    },
  }),
  substitute: new UniqueMove({
    name: "Substitute",
    pp: 10,
    type: "normal",
    execute(battle, user) {
      // Gen 1 bug, if you have exactly 25% hp you can create a substitute and instantly die
      const hp = Math.floor(user.base.stats.hp / 4);
      if (user.v.substitute > 0) {
        battle.info(user, "has_substitute");
        return false;
      } else if (hp > user.base.hp) {
        battle.info(user, "cant_substitute");
        return false;
      }

      const { dead } = user.damage(hp, user, battle, false, "substitute");
      user.v.substitute = hp + 1;
      return dead;
    },
  }),
  transform: new UniqueMove({
    name: "Transform",
    pp: 10,
    type: "normal",
    execute(battle, user, target) {
      target.lastDamage = 0;
      if (user.base instanceof TransformedPokemon) {
        user.base = new TransformedPokemon(user.base.base, target.base);
      } else {
        user.base = new TransformedPokemon(user.base, target.base);
      }

      for (const k of stageKeys) {
        user.v.stages[k] = target.v.stages[k];
        if (k === "atk" || k === "def" || k == "spc" || k === "spe") {
          user.applyStages(k, false);
        }
      }

      user.v.types = [...target.v.types];
      battle.event({ type: "transform", src: user.owner.id, target: target.owner.id });
      return false;
    },
  }),
  // --
  focusenergy: new VolatileFlagMove({
    name: "Focus Energy",
    pp: 30,
    type: "normal",
    flag: "focus",
  }),
  lightscreen: new VolatileFlagMove({
    name: "Light Screen",
    pp: 30,
    type: "psychic",
    flag: "light_screen",
  }),
  mist: new VolatileFlagMove({
    name: "Mist",
    pp: 30,
    type: "ice",
    flag: "mist",
  }),
  reflect: new VolatileFlagMove({
    name: "Reflect",
    pp: 20,
    type: "psychic",
    flag: "reflect",
  }),
  // --
  recover: new RecoveryMove({
    name: "Recover",
    pp: 20,
    type: "normal",
    why: "recover",
  }),
  rest: new RecoveryMove({
    name: "Rest",
    pp: 10,
    type: "psychic",
    why: "rest",
  }),
  softboiled: new RecoveryMove({
    name: "Softboiled",
    pp: 10,
    type: "normal",
    why: "recover",
  }),
  // --
  confuseray: new ConfusionMove({
    name: "Confuse Ray",
    pp: 10,
    type: "ghost",
    acc: 100,
  }),
  supersonic: new ConfusionMove({
    name: "Supersonic",
    pp: 20,
    type: "normal",
    acc: 55,
  }),
  // --
  glare: new StatusMove({
    name: "Glare",
    pp: 30,
    type: "normal",
    acc: 75,
    status: "par",
  }),
  hypnosis: new StatusMove({
    name: "Hypnosis",
    pp: 20,
    type: "psychic",
    acc: 60,
    status: "slp",
  }),
  lovelykiss: new StatusMove({
    name: "Lovely Kiss",
    pp: 10,
    type: "normal",
    acc: 75,
    status: "slp",
  }),
  poisongas: new StatusMove({
    name: "Poison Gas",
    pp: 40,
    type: "poison",
    acc: 55,
    status: "psn",
  }),
  poisonpowder: new StatusMove({
    name: "Poison Powder",
    pp: 35,
    type: "poison",
    acc: 75,
    status: "psn",
  }),
  sing: new StatusMove({
    name: "Sing",
    pp: 15,
    type: "normal",
    acc: 55,
    status: "slp",
  }),
  sleeppowder: new StatusMove({
    name: "Sleep Powder",
    pp: 15,
    type: "grass",
    acc: 75,
    status: "slp",
  }),
  spore: new StatusMove({
    name: "Spore",
    pp: 15,
    type: "grass",
    acc: 100,
    status: "slp",
  }),
  stunspore: new StatusMove({
    name: "Stun Spore",
    pp: 30,
    type: "grass",
    acc: 75,
    status: "par",
  }),
  thunderwave: new StatusMove({
    name: "Thunder Wave",
    pp: 20,
    type: "electric",
    acc: 100,
    status: "par",
  }),
  toxic: new StatusMove({
    name: "Toxic",
    pp: 15,
    type: "poison",
    acc: 85,
    status: "tox",
  }),
  // --
  acidarmor: new StageMove({
    name: "Acid Armor",
    pp: 40,
    type: "poison",
    stages: [["def", 2]],
  }),
  agility: new StageMove({
    name: "Agility",
    pp: 30,
    type: "psychic",
    stages: [["spe", 2]],
  }),
  amnesia: new StageMove({
    name: "Amnesia",
    pp: 20,
    type: "psychic",
    stages: [["spc", 2]],
  }),
  barrier: new StageMove({
    name: "Barrier",
    pp: 30,
    type: "psychic",
    stages: [["def", 2]],
  }),
  defensecurl: new StageMove({
    name: "Defense Curl",
    pp: 40,
    type: "normal",
    stages: [["def", 1]],
  }),
  doubleteam: new StageMove({
    name: "Double Team",
    pp: 15,
    type: "normal",
    stages: [["eva", 1]],
  }),
  flash: new StageMove({
    name: "Flash",
    pp: 20,
    type: "normal",
    acc: 70,
    stages: [["acc", -1]],
  }),
  growl: new StageMove({
    name: "Growl",
    pp: 40,
    type: "normal",
    acc: 100,
    stages: [["atk", -1]],
  }),
  growth: new StageMove({
    name: "Growth",
    pp: 40,
    type: "normal",
    stages: [["spc", 1]],
  }),
  harden: new StageMove({
    name: "Harden",
    pp: 30,
    type: "normal",
    stages: [["def", 1]],
  }),
  kinesis: new StageMove({
    name: "Kinesis",
    pp: 15,
    type: "psychic",
    acc: 80,
    stages: [["acc", -1]],
  }),
  leer: new StageMove({
    name: "Leer",
    pp: 30,
    type: "normal",
    acc: 100,
    stages: [["def", -1]],
  }),
  meditate: new StageMove({
    name: "Meditate",
    pp: 40,
    type: "psychic",
    stages: [["atk", 1]],
  }),
  minimize: new StageMove({
    name: "Minimize",
    pp: 15,
    type: "normal",
    stages: [["eva", +1]],
  }),
  sandattack: new StageMove({
    name: "Sand Attack",
    pp: 15,
    type: "normal",
    acc: 100,
    stages: [["acc", -1]],
  }),
  screech: new StageMove({
    name: "Screech",
    pp: 40,
    type: "normal",
    acc: 85,
    stages: [["def", -2]],
  }),
  sharpen: new StageMove({
    name: "Sharpen",
    pp: 30,
    type: "normal",
    stages: [["atk", 1]],
  }),
  smokescreen: new StageMove({
    name: "Smokescreen",
    pp: 20,
    type: "normal",
    acc: 100,
    stages: [["acc", -1]],
  }),
  stringshot: new StageMove({
    name: "String Shot",
    pp: 40,
    type: "bug",
    acc: 95,
    stages: [["spe", -1]],
  }),
  swordsdance: new StageMove({
    name: "Swords Dance",
    pp: 30,
    type: "normal",
    stages: [["atk", 2]],
  }),
  tailwhip: new StageMove({
    name: "Tail Whip",
    pp: 30,
    type: "normal",
    acc: 100,
    stages: [["def", -1]],
  }),
  withdraw: new StageMove({
    name: "Withdraw",
    pp: 40,
    type: "water",
    stages: [["def", 1]],
  }),
  // --
  absorb: new DamagingMove({
    name: "Absorb",
    pp: 20,
    type: "grass",
    power: 20,
    acc: 100,
  }),
  acid: new DamagingMove({
    name: "Acid",
    pp: 30,
    type: "poison",
    power: 40,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["spc", -1]]],
  }),
  aurorabeam: new DamagingMove({
    name: "Aurora Beam",
    pp: 20,
    type: "ice",
    power: 65,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["atk", -1]]],
  }),
  barrage: new DamagingMove({
    name: "Barrage",
    pp: 20,
    type: "normal",
    power: 15,
    acc: 85,
    flag: "multi",
  }),
  bind: new DamagingMove({
    name: "Bind",
    pp: 20,
    type: "normal",
    acc: 75,
    power: 15,
    flag: "trap",
  }),
  bodyslam: new DamagingMove({
    name: "Body Slam",
    pp: 15,
    type: "normal",
    power: 85,
    acc: 100,
    effect: [30.1 /* 77/256 */, "par"],
  }),
  bonemerang: new DamagingMove({
    name: "Bonemerang",
    pp: 10,
    type: "ground",
    power: 50,
    acc: 90,
    flag: "double",
  }),
  bubble: new DamagingMove({
    name: "Bubble",
    pp: 30,
    type: "water",
    power: 20,
    acc: 100,
  }),
  bubblebeam: new DamagingMove({
    name: "Bubble Beam",
    pp: 20,
    type: "water",
    power: 65,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["spe", -1]]],
  }),
  bite: new DamagingMove({
    name: "Bite",
    pp: 25,
    type: "normal",
    power: 60,
    acc: 100,
    effect: [10.2 /* 26/256 */, "flinch"],
  }),
  blizzard: new DamagingMove({
    name: "Blizzard",
    pp: 5,
    type: "ice",
    power: 120,
    acc: 90,
    effect: [10.2 /* 26/256 */, "frz"],
  }),
  boneclub: new DamagingMove({
    name: "Bone Club",
    pp: 20,
    type: "ground",
    power: 65,
    acc: 85,
    effect: [10.2 /* 26/256 */, "flinch"],
  }),
  clamp: new DamagingMove({
    name: "Clamp",
    pp: 10,
    type: "water",
    acc: 75,
    power: 35,
    flag: "trap",
  }),
  cometpunch: new DamagingMove({
    name: "Comet Punch",
    pp: 15,
    type: "normal",
    power: 18,
    acc: 85,
    flag: "multi",
  }),
  confusion: new DamagingMove({
    name: "Confusion",
    pp: 25,
    type: "psychic",
    power: 50,
    acc: 100,
    effect: [10 /* 25/256 */, "confusion"],
  }),
  constrict: new DamagingMove({
    name: "Constrict",
    pp: 35,
    type: "normal",
    power: 10,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["spe", -1]]],
  }),
  counter: new DamagingMove({
    name: "Counter",
    pp: 20,
    type: "fight",
    acc: 100,
    power: 1,
    priority: -1,
    flag: "counter",
  }),
  crabhammer: new DamagingMove({
    name: "Crabhammer",
    pp: 10,
    type: "water",
    power: 90,
    acc: 85,
    flag: "high_crit",
  }),
  cut: new DamagingMove({
    name: "Cut",
    pp: 30,
    type: "normal",
    power: 50,
    acc: 95,
  }),
  dig: new DamagingMove({
    name: "Dig",
    pp: 10,
    type: "ground",
    power: 100,
    acc: 100,
    flag: "charge_invuln",
  }),
  dizzypunch: new DamagingMove({
    name: "Dizzy Punch",
    pp: 10,
    type: "normal",
    power: 70,
    acc: 100,
  }),
  doubleedge: new DamagingMove({
    name: "Double Edge",
    pp: 15,
    type: "normal",
    power: 100,
    acc: 100,
    recoil: 4, // 1 / 4
  }),
  doublekick: new DamagingMove({
    name: "Double Kick",
    pp: 30,
    type: "fight",
    power: 30,
    acc: 100,
    flag: "double",
  }),
  doubleslap: new DamagingMove({
    name: "Double Slap",
    pp: 10,
    type: "normal",
    power: 15,
    acc: 85,
    flag: "multi",
  }),
  dragonrage: new DamagingMove({
    name: "Dragon Rage",
    pp: 10,
    type: "dragon",
    acc: 100,
    power: 1,
    dmg: 40,
  }),
  dreameater: new DamagingMove({
    name: "Dream Eater",
    pp: 15,
    type: "psychic",
    power: 100,
    acc: 100,
    flag: "dream_eater",
  }),
  drillpeck: new DamagingMove({
    name: "Drill Peck",
    pp: 20,
    type: "flying",
    power: 80,
    acc: 100,
  }),
  eggbomb: new DamagingMove({
    name: "Egg Bomb",
    pp: 10,
    type: "normal",
    power: 100,
    acc: 75,
  }),
  earthquake: new DamagingMove({
    name: "Earthquake",
    pp: 10,
    type: "ground",
    power: 100,
    acc: 100,
  }),
  ember: new DamagingMove({
    name: "Ember",
    pp: 25,
    type: "fire",
    power: 40,
    acc: 100,
    effect: [10.2 /* 26/256 */, "brn"],
  }),
  explosion: new DamagingMove({
    name: "Explosion",
    pp: 5,
    type: "normal",
    power: 170,
    acc: 100,
    flag: "explosion",
  }),
  fireblast: new DamagingMove({
    name: "Fire Blast",
    pp: 5,
    type: "fire",
    power: 120,
    acc: 85,
    effect: [30.1 /* 77/256 */, "brn"],
  }),
  firepunch: new DamagingMove({
    name: "Fire Punch",
    pp: 15,
    type: "fire",
    power: 75,
    acc: 100,
    effect: [10.2 /* 26/256 */, "brn"],
  }),
  firespin: new DamagingMove({
    name: "Fire Spin",
    pp: 15,
    type: "fire",
    acc: 70,
    power: 15,
    flag: "trap",
  }),
  fissure: new DamagingMove({
    name: "Fissure",
    pp: 5,
    type: "ground",
    acc: 30,
    power: 1,
    flag: "ohko",
  }),
  flamethrower: new DamagingMove({
    name: "Flamethrower",
    pp: 15,
    type: "fire",
    power: 95,
    acc: 100,
    effect: [10.2 /* 26/256 */, "brn"],
  }),
  fly: new DamagingMove({
    name: "Fly",
    pp: 15,
    type: "flying",
    power: 70,
    acc: 95,
    flag: "charge_invuln",
  }),
  furyattack: new DamagingMove({
    name: "Fury Attack",
    pp: 20,
    type: "normal",
    power: 15,
    acc: 85,
    flag: "multi",
  }),
  furyswipes: new DamagingMove({
    name: "Fury Swipes",
    pp: 15,
    type: "normal",
    power: 18,
    acc: 80,
    flag: "multi",
  }),
  guillotine: new DamagingMove({
    name: "Guillotine",
    pp: 5,
    type: "normal",
    acc: 30,
    power: 1,
    flag: "ohko",
  }),
  gust: new DamagingMove({
    name: "Gust",
    pp: 35,
    type: "normal",
    power: 40,
    acc: 100,
  }),
  headbutt: new DamagingMove({
    name: "Headbutt",
    pp: 15,
    type: "normal",
    power: 70,
    acc: 100,
    effect: [30.1 /* 77/256 */, "flinch"],
  }),
  hijumpkick: new DamagingMove({
    name: "Hi Jump Kick",
    pp: 20,
    type: "fight",
    power: 85,
    acc: 90,
    flag: "crash",
  }),
  hornattack: new DamagingMove({
    name: "Horn Attack",
    pp: 25,
    type: "normal",
    power: 65,
    acc: 100,
  }),
  horndrill: new DamagingMove({
    name: "Horn Drill",
    pp: 5,
    type: "normal",
    acc: 30,
    power: 1,
    flag: "ohko",
  }),
  hydropump: new DamagingMove({
    name: "Hydro Pump",
    pp: 5,
    type: "water",
    power: 120,
    acc: 80,
  }),
  hyperbeam: new DamagingMove({
    name: "Hyper Beam",
    pp: 5,
    type: "normal",
    power: 150,
    acc: 90,
    flag: "recharge",
  }),
  hyperfang: new DamagingMove({
    name: "Hyper Fang",
    pp: 15,
    type: "normal",
    power: 80,
    acc: 90,
    effect: [10.2 /* 26/256 */, "flinch"],
  }),
  icebeam: new DamagingMove({
    name: "Ice Beam",
    pp: 10,
    type: "ice",
    power: 95,
    acc: 100,
    effect: [10.2 /* 26/256 */, "frz"],
  }),
  icepunch: new DamagingMove({
    name: "Ice Punch",
    pp: 15,
    type: "ice",
    power: 75,
    acc: 100,
    effect: [10.2 /* 26/256 */, "frz"],
  }),
  jumpkick: new DamagingMove({
    name: "Jump Kick",
    pp: 25,
    type: "fight",
    power: 70,
    acc: 95,
    flag: "crash",
  }),
  karatechop: new DamagingMove({
    name: "Karate Chop",
    pp: 25,
    type: "normal",
    power: 50,
    acc: 100,
    flag: "high_crit",
  }),
  leechlife: new DamagingMove({
    name: "Leech Life",
    pp: 15,
    type: "bug",
    power: 20,
    acc: 100,
    flag: "drain",
  }),
  lick: new DamagingMove({
    name: "Lick",
    pp: 30,
    type: "ghost",
    power: 20,
    acc: 100,
    effect: [30.1 /* 77/256 */, "par"],
  }),
  lowkick: new DamagingMove({
    name: "Low Kick",
    pp: 20,
    type: "fight",
    power: 50,
    acc: 100,
    effect: [30.1 /* 77/256 */, "flinch"],
  }),
  megadrain: new DamagingMove({
    name: "Mega Drain",
    pp: 10,
    type: "grass",
    power: 40,
    acc: 100,
    flag: "drain",
  }),
  megakick: new DamagingMove({
    name: "Mega Kick",
    pp: 5,
    type: "normal",
    power: 120,
    acc: 75,
  }),
  megapunch: new DamagingMove({
    name: "Mega Punch",
    pp: 20,
    type: "normal",
    power: 80,
    acc: 85,
  }),
  nightshade: new DamagingMove({
    name: "Night Shade",
    pp: 15,
    type: "ghost",
    acc: 100,
    power: 1,
    flag: "level",
  }),
  payday: new DamagingMove({
    name: "Pay Day",
    pp: 20,
    type: "normal",
    power: 40,
    acc: 100,
    flag: "payday",
  }),
  peck: new DamagingMove({
    name: "Peck",
    pp: 35,
    type: "flying",
    power: 35,
    acc: 100,
  }),
  petaldance: new DamagingMove({
    name: "Petal Dance",
    pp: 20,
    type: "grass",
    power: 70,
    acc: 100,
    flag: "multi_turn",
  }),
  pinmissile: new DamagingMove({
    name: "Pin Missile",
    pp: 20,
    type: "bug",
    power: 14,
    acc: 85,
    flag: "multi",
  }),
  poisonsting: new DamagingMove({
    name: "Poison Sting",
    pp: 35,
    type: "poison",
    power: 15,
    acc: 100,
    effect: [20.4 /* 52/256 */, "psn"],
  }),
  pound: new DamagingMove({
    name: "Pound",
    pp: 35,
    type: "normal",
    power: 40,
    acc: 100,
  }),
  psybeam: new DamagingMove({
    name: "Psybeam",
    pp: 20,
    type: "psychic",
    power: 65,
    acc: 100,
    effect: [10 /* 25/256 */, "confusion"],
  }),
  psychic: new DamagingMove({
    name: "Psychic",
    pp: 10,
    type: "psychic",
    power: 90,
    acc: 100,
    effect: [33.21 /* 85/256 */, [["spc", -1]]],
  }),
  psywave: new DamagingMove({
    name: "Psywave",
    pp: 15,
    type: "psychic",
    power: 1,
    acc: 80,
    flag: "psywave",
  }),
  quickattack: new DamagingMove({
    name: "Quick Attack",
    pp: 30,
    type: "normal",
    power: 40,
    acc: 100,
    priority: +1,
  }),
  rage: new DamagingMove({
    name: "Rage",
    pp: 20,
    type: "normal",
    acc: 100,
    power: 20,
    flag: "rage",
  }),
  razorleaf: new DamagingMove({
    name: "Razor Leaf",
    pp: 25,
    type: "grass",
    power: 55,
    acc: 95,
    flag: "high_crit",
  }),
  razorwind: new DamagingMove({
    name: "Razor Wind",
    pp: 10,
    type: "normal",
    power: 80,
    acc: 75,
    flag: "charge",
  }),
  rockslide: new DamagingMove({
    name: "Rock Slide",
    pp: 10,
    type: "rock",
    power: 75,
    acc: 90,
  }),
  rockthrow: new DamagingMove({
    name: "Rock Throw",
    pp: 15,
    type: "rock",
    power: 50,
    acc: 90,
  }),
  rollingkick: new DamagingMove({
    name: "Rolling Kick",
    pp: 15,
    type: "fight",
    power: 60,
    acc: 85,
    effect: [30.1 /* 77/256 */, "flinch"],
  }),
  selfdestruct: new DamagingMove({
    name: "Self-Destruct",
    pp: 5,
    type: "normal",
    power: 130,
    acc: 100,
    flag: "explosion",
  }),
  scratch: new DamagingMove({
    name: "Scratch",
    pp: 35,
    type: "normal",
    power: 40,
    acc: 100,
  }),
  seismictoss: new DamagingMove({
    name: "Seismic Toss",
    pp: 20,
    type: "fight",
    acc: 100,
    power: 1,
    flag: "level",
  }),
  skullbash: new DamagingMove({
    name: "Skull Bash",
    pp: 15,
    type: "normal",
    power: 100,
    acc: 100,
    flag: "charge",
  }),
  skyattack: new DamagingMove({
    name: "Sky Attack",
    pp: 5,
    type: "flying",
    power: 140,
    acc: 90,
    flag: "charge",
  }),
  slam: new DamagingMove({
    name: "Slam",
    pp: 20,
    type: "normal",
    power: 80,
    acc: 75,
  }),
  slash: new DamagingMove({
    name: "Slash",
    pp: 20,
    type: "normal",
    power: 70,
    acc: 100,
    flag: "high_crit",
  }),
  sludge: new DamagingMove({
    name: "Sludge",
    pp: 20,
    type: "poison",
    power: 65,
    acc: 100,
    effect: [40.4 /* 103/256 */, "psn"],
  }),
  smog: new DamagingMove({
    name: "Smog",
    pp: 20,
    type: "poison",
    power: 20,
    acc: 70,
    effect: [40.4 /* 103/256 */, "psn"],
  }),
  solarbeam: new DamagingMove({
    name: "SolarBeam",
    pp: 10,
    type: "grass",
    power: 120,
    acc: 100,
    flag: "charge",
  }),
  sonicboom: new DamagingMove({
    name: "SonicBoom",
    pp: 20,
    type: "normal",
    acc: 90,
    power: 1,
    dmg: 20,
  }),
  spikecannon: new DamagingMove({
    name: "Spike Cannon",
    pp: 15,
    type: "normal",
    power: 20,
    acc: 100,
    flag: "multi",
  }),
  stomp: new DamagingMove({
    name: "Stomp",
    pp: 20,
    type: "normal",
    power: 65,
    acc: 100,
    effect: [30.1 /* 77/256 */, "flinch"],
  }),
  strength: new DamagingMove({
    name: "Strength",
    pp: 15,
    type: "normal",
    power: 80,
    acc: 100,
  }),
  struggle: new DamagingMove({
    name: "Struggle",
    pp: 10,
    type: "normal",
    acc: 100,
    power: 50,
    recoil: 2,
  }),
  submission: new DamagingMove({
    name: "Submission",
    pp: 25,
    type: "fight",
    power: 80,
    acc: 80,
    recoil: 4,
  }),
  superfang: new DamagingMove({
    name: "Super Fang",
    pp: 10,
    type: "normal",
    acc: 90,
    power: 1,
    flag: "super_fang",
  }),
  surf: new DamagingMove({
    name: "Surf",
    pp: 15,
    type: "water",
    power: 95,
    acc: 100,
  }),
  swift: new DamagingMove({
    name: "Swift",
    pp: 20,
    type: "normal",
    power: 60,
  }),
  tackle: new DamagingMove({
    name: "Tackle",
    pp: 35,
    type: "normal",
    power: 35,
    acc: 100,
  }),
  takedown: new DamagingMove({
    name: "Take Down",
    pp: 20,
    type: "normal",
    power: 90,
    acc: 85,
    recoil: 4,
  }),
  thrash: new DamagingMove({
    name: "Thrash",
    pp: 20,
    type: "normal",
    power: 90,
    acc: 100,
    flag: "multi_turn",
  }),
  thunder: new DamagingMove({
    name: "Thunder",
    pp: 10,
    type: "electric",
    power: 120,
    acc: 70,
    effect: [10.2 /* 26/256 */, "par"],
  }),
  thunderpunch: new DamagingMove({
    name: "Thunder Punch",
    pp: 15,
    type: "electric",
    power: 75,
    acc: 100,
    effect: [10.2 /* 26/256 */, "par"],
  }),
  thundershock: new DamagingMove({
    name: "Thunder Shock",
    pp: 30,
    type: "electric",
    power: 40,
    acc: 100,
    effect: [10.2 /* 26/256 */, "par"],
  }),
  thunderbolt: new DamagingMove({
    name: "Thunderbolt",
    pp: 15,
    type: "electric",
    power: 95,
    acc: 100,
    effect: [10.2 /* 26/256 */, "par"],
  }),
  triattack: new DamagingMove({
    name: "Tri Attack",
    pp: 10,
    type: "normal",
    power: 80,
    acc: 100,
  }),
  twineedle: new DamagingMove({
    name: "Twineedle",
    pp: 20,
    type: "bug",
    power: 25,
    acc: 100,
    flag: "double",
    effect: [20 /* 51/256 [citation needed] */, "psn"],
  }),
  vinewhip: new DamagingMove({
    name: "Vine Whip",
    pp: 10,
    type: "grass",
    power: 45,
    acc: 100,
  }),
  vicegrip: new DamagingMove({
    name: "Vice Grip",
    pp: 30,
    type: "normal",
    power: 55,
    acc: 100,
  }),
  watergun: new DamagingMove({
    name: "Water Gun",
    pp: 25,
    type: "water",
    power: 40,
    acc: 100,
  }),
  waterfall: new DamagingMove({
    name: "Waterfall",
    pp: 15,
    type: "water",
    power: 80,
    acc: 100,
  }),
  wingattack: new DamagingMove({
    name: "Wing Attack",
    pp: 35,
    type: "flying",
    power: 35,
    acc: 100,
  }),
  wrap: new DamagingMove({
    name: "Wrap",
    pp: 20,
    type: "normal",
    acc: 85,
    power: 15,
    flag: "trap",
  }),
  // --
  roar: new AlwaysFailMove({
    name: "Roar",
    pp: 20,
    acc: 100,
    type: "normal",
    why: "whirlwind",
  }),
  splash: new AlwaysFailMove({
    name: "Splash",
    pp: 40,
    type: "normal",
    why: "splash",
  }),
  teleport: new AlwaysFailMove({
    name: "Teleport",
    pp: 20,
    type: "psychic",
    why: "fail_generic",
  }),
  whirlwind: new AlwaysFailMove({
    name: "Whirlwind",
    pp: 20,
    acc: 100,
    type: "normal",
    why: "whirlwind",
  }),
});
