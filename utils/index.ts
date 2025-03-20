import type {Mods} from "~/game/battle";
import type {Status} from "../game/pokemon";
import {isSpecial, type Stages, type Type} from "../game/utils";
import type {DamagingMove, Move, MoveId} from "~/game/moves";
import type {Generation} from "~/game/gen1";

export const randChoice = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export const musicTrackName = (track: string) => {
  return track.slice(track.lastIndexOf("/") + 1, track.lastIndexOf("."));
};

export const toSeconds = (pos: string) => {
  const [m, sms] = pos.split(":");
  if (!sms) {
    return +m;
  }

  const [s, ms] = sms.split(".").map(Number);
  return +m * 60 + s + ms / 1000;
};

export const toTitleCase = (s: string) => {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
};

export const roundTo = (num: number, places: number = 1) => {
  const pow = 10 ** places;
  return Math.round(num * pow) / pow;
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const modNames: Record<keyof Mods, {name: string; desc: string}> = {
  sleepClause: {
    name: "Sleep Clause",
    desc: "Only one enemy Pokémon can be put to sleep at a time.",
  },
  freezeClause: {name: "Freeze Clause", desc: "Only one Pokémon can be frozen at a time."},
  endlessBattle: {
    name: "Endless Battle Clause",
    desc: "Battles that cannot end naturally or exceed 1000 turns will result in a draw.",
  },
};

const dmgStatusTable: Record<Status, string> = {
  brn: "burn the target. ",
  par: "paralyze the target. ",
  frz: "freeze the target. ",
  psn: "poison the target. ",
  tox: "badly poison the target. ",
  slp: "put the target to sleep. ",
};

const statusTable: Record<Status, string> = {
  brn: "Burns the target",
  par: "Paralyzes the target",
  frz: "Freezes the target",
  psn: "Poisons the target",
  tox: "Badly poisons the target",
  slp: "Puts the target to sleep",
};

const stageTable: Record<Stages, string> = {
  atk: "Attack",
  def: "Defense",
  spa: "Special",
  spd: "Special Defense",
  spe: "Speed",
  acc: "Acccuracy",
  eva: "Evasion",
};

export const getStageTable = (gen: Generation) => {
  if (gen.id === 1) {
    return stageTable;
  } else {
    return {...stageTable, spa: "Special Attack"};
  }
};

export const getStatKeys = (gen: Generation) => {
  if (gen.id === 1) {
    return {hp: "HP", atk: "Atk", def: "Def", spa: "Spc", spe: "Spe"};
  } else {
    return {hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe"};
  }
};

export const getCategory = (move: Move, type?: Type) => {
  return move.kind === "damage"
    ? isSpecial(type ?? move.type)
      ? "special"
      : "physical"
    : "status";
};

const descriptions: Partial<Record<MoveId, string>> = {
  conversion: "Changes the user's types to match the target.",
  disable: "Disables a move from the target's move set at random.",
  haze:
    "Removes the effects of Leech Seed, Mist, Reflect, Light Screen, Focus Energy, and " +
    "Disable, the stat reduction for burn and paralysis, confusion, and all stat stages " +
    "for both the user and the target. Also turns bad poison into regular poison for the " +
    "user, and removes any non-volatile status for the target.",
  leechseed:
    "Plants a seed on the target. After the target attacks, it will lose 1/16 of its max " +
    "HP, and it will be restored to the user. Ends if the target switches out.",
  metronome: "Selects any move except Struggle for the user to use at random.",
  mirrormove: "Uses the last move targeted at the user by a pokemon still on the field.",
  substitute:
    "The user sacrifices 1/4 its HP to create a substitute with 1/4 its HP + 1. The " +
    "substitute protects it from status and stat stage changes from the opponent's attacks, " +
    "excluding Leech Seed, Disable, direct sleep or paralysis, and indirect confusion.",
  superfang: "Damages the target for 1/2 its current HP.",
  transform: "Copies the target's stats, species, moves, and types. Each move is given 5 PP.",
  focusenergy: "Quarters the user's critical hit rate.",
  lightscreen: "Halves damage dealt by special attacks. Ends on switch out.",
  reflect: "Halves damage dealt by physical attacks. Ends on switch out.",
  mist: "Protects the user from stat dropping moves. Ends on switch out.",
  bide:
    "The user sits dormant for 2-3 turns, then damages the opponent for 2x the damage received " +
    "during the idling period.",
};

const flagDesc: Record<NonNullable<DamagingMove["flag"]>, string> = {
  drain: "The user recovers 1/2 the damage dealt. ",
  explosion: "Causes the user to faint. ",
  crash: "If the user misses this move, it will take 1 HP due to crash damage. ",
  multi: "Hits 2-5 times. ",
  high_crit: "Has a high critical hit ratio. ",
  recharge: "After using this move, the user must spend one turn to recharge. ",
  double: "Hits twice. ",
  dream_eater: "The user recovers 1/2 the damage dealt. Only works on sleeping targets. ",
  payday: "",
  charge: "The user charges on the first turn, and attacks on the second. ",
  charge_sun:
    "The user charges on the first turn, and attacks on the second. Skips the charging " +
    "turn if sun is active.",
  charge_invuln:
    "The user charges on the first turn, and attacks on the second. While charging, the user " +
    "can only be hit by moves that do not check accuracy.",
  multi_turn: "Locks the user in for 3-4 turns. Afterwards, the user becomes confused.",
  rage:
    "After using this move, the user will not be able to switch or do anything else except " +
    "continue to use Rage until it faints or the battle ends. Every time it is hit by a move " +
    "or targeted by Disable, Explosion, or Self-Destruct, its attack will increase by one " +
    "stage. ",
  level: "Deals damage equal to the user's level.",
  ohko: "Deals 65535 damage to the target. Fails on faster opponents. ",
  trap: "Deals damage and prevents the target from moving for 2-5 turns. ",
  counter: "Deals 2x the last move's damage if it was normal or fighting type. ",
  super_fang: "Deals damage equal to 1/2 the target's current HP. ",
  psywave: "Damages the target for a random amount between 1 HP and 1.5x the user's level. ",
  frustration: "Higher power the lower the user's friendship is. ",
  return: "Higher power the higher the user's friendship is. ",
  flail: "Higher power the lower the user's HP is. ",
  hidden_power: "Power and type of this move are determined by the user's DVs. ",
  magnitude: "Power is determined randomly. ",
  false_swipe: "Always leaves the target with at least 1HP. ",
  tri_attack:
    "Has a 1/5 chance to burn, paralyze, or freeze the target, and a 1/3 chance to thaw the " +
    "target if it is frozen. ",
};

const formatStages = (stages: [Stages, number][]) => {
  const statsBefore = stages.map(v => stageTable[v[0]]);
  let stats = "";
  if (statsBefore.length > 1) {
    stats = statsBefore.slice(0, -1).join(", ") + ", and " + statsBefore.at(-1);
  } else {
    stats = statsBefore[0];
  }

  const [, count] = stages[0];
  return `${stats} by ${Math.abs(count)} stage(s)`;
};

export const describeMove = (gen: Generation, id: MoveId) => {
  const move = gen.moveList[id];
  if (move.kind === "damage") {
    let buf = move.flag && move.flag in flagDesc ? flagDesc[move.flag] : "";
    if (move.effect) {
      const [chance, effect] = move.effect;
      buf += `Has a ${chance}% chance to `;
      if (Array.isArray(effect)) {
        const raise = effect[0][1] < 0 ? "drop" : "raise";
        buf += `${raise} ${formatStages(effect)}. `;
      } else if (effect === "confusion") {
        buf += "confuse the target. ";
      } else if (effect === "flinch") {
        buf += "flinch the target. ";
      } else {
        buf += dmgStatusTable[effect];
      }
    }

    if (move.dmg) {
      buf += `Deals ${move.dmg} damage. `;
    }

    if (move.recoil) {
      buf += `The user takes 1/${move.recoil} the damage dealt due to recoil. `;
    }

    return buf.length ? buf : "No additional effects.";
  } else if (move.kind === "status") {
    return statusTable[move.status] + ". ";
  } else if (move.kind === "stage") {
    const [, count] = move.stages[0];
    const target = move.acc ? "target" : "user";
    const raise = count < 0 ? "Drops" : "Raises";
    return `${raise} the ${target}'s ${formatStages(move.stages)}. `;
  } else if (move.kind === "confuse") {
    return "Confuses the target. ";
  } else if (move.kind === "fail") {
    return "Has no effect. ";
  } else if (move.kind === "recover") {
    if (move.why === "rest") {
      return "The user goes to sleep for two turns, recovering HP and curing status conditions. ";
    } else {
      return "The user recovers 1/2 its max HP. ";
    }
  } else if (move.kind === "phaze") {
    return "Forces the target to switch to a different Pokémon. Fails if the target has no other living Pokémon, or if the move is used before the target attacks. ";
  } else if (move.kind === "weather") {
    let base = `Sets the weather to ${move.weather} for 5 turns. `;
    // FIXME: mention moonlight, morning sun, etc.
    if (move.weather === "sun") {
      base +=
        "While sun is active, fire moves have their base power doubled and water moves have their base power halved. Additionally, Solar Beam does not require a charge turn. ";
    } else if (move.weather === "rain") {
      base +=
        "While rain is active, water moves have their base power doubled and fire moves and the move Solar Beam have their base power halved. ";
    } else if (move.weather === "sand") {
      base +=
        "While sandstorm is active, pokemon that are not steel, rock, or ground type lose 1/8 of their health at the end of each turn. ";
    }
    return base;
  } else if (move.kind === "screen") {
    const msg = {
      light_screen:
        "Halves damage dealt by special attacks for all pokemon on the user's side for 5 turns. ",
      reflect:
        "Halves damage dealt by physical attacks for all pokemon on the user's side for 5 turns. ",
    };
    return msg[move.screen];
  } else if (id in descriptions) {
    return descriptions[id];
  }
};
