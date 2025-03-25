import type {Mods} from "~/game/battle";
import type {Status} from "../game/pokemon";
import {isSpecial, type Stages, type Type} from "../game/utils";
import type {DamagingMove, Move, MoveId} from "~/game/moves";
import type {Generation} from "~/game/gen1";
import type {ItemId} from "~/game/item";

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
  return move.kind === "damage" || move.power
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
  metronome: "Selects a move for the user to use at random.",
  mirrormove: "Uses the last move targeted at the user by a pokemon still on the field.",
  substitute:
    "The user sacrifices 1/4 its HP to create a substitute with 1/4 its HP + 1. The " +
    "substitute protects it from status and stat stage changes from the opponent's attacks, " +
    "excluding Leech Seed, Disable, direct sleep or paralysis, and indirect confusion.",
  superfang: "Deals damage equal to 1/2 the target's current HP. ",
  transform: "Copies the target's stats, species, moves, and types. Each move is given 5 PP.",
  focusenergy: "Quarters the user's critical hit rate.",
  lightscreen: "Halves damage dealt by special attacks. Ends on switch out.",
  reflect: "Halves damage dealt by physical attacks. Ends on switch out.",
  mist: "Protects the user from stat dropping moves. Ends on switch out.",
  bide:
    "The user sits dormant for 2-3 turns, then damages the opponent for 2x the damage received " +
    "during the idling period.",
  psywave: "Damages the target for a random amount between 1 HP and 1.5x the user's level. ",
  counter: "Deals 2x the last move's damage if it was normal or fighting type. ",
  frustration: "Higher power the lower the user's friendship is. ",
  return: "Higher power the higher the user's friendship is. ",
  hiddenpower: "Power and type of this move are determined by the user's DVs. ",
  seismictoss: "Deals damage equal to the user's level.",
  nightshade: "Deals damage equal to the user's level.",
  attract:
    "Infatuates the target, preventing it from moving 50% of the time. Fails on Pokémon of the " +
    "same gender, or when used by or on Pokémon with unknown gender. Ends when either pokemon " +
    "switches out. ",
  conversion2:
    "Randomly changes the user's type to one that resists the last move used by the opponent. ",
  curse:
    "If the user is not a ghost type, raises Attack and Defense and lowers Speed by 1 stage. " +
    "If the user is ghost type, sacrifices 1/2 its max HP to place a curse on the opponent that " +
    "deals 1/4 its max HP after every turn. ",
  bellydrum:
    "Sacrifices 1/2 its max HP to raise Attack to +6. Fails if the user's current HP is " +
    "less than 1/2 its max HP, rounded down. ",
  destinybond:
    "Until the user moves again, if the user faints as the direct result of a move, the " +
    "target will also faint. ",
  encore: "Forces the target to use its last selected move for the next 2-6 turns. ",
  swagger: "Raises the target's Attack by 2 stages and confuses it. ",
  spite: "Lowers the PP of the target's last used move by 2-5 PP. ",
  sketch: "Permanently replaces this move with the last move used by the target. ",
  perishsong:
    "Sets a 3-turn timer for all Pokémon on the field, after which they will faint. Switching removes the timer. ",
  futuresight: "After two turns, the target is hit with an attack. ",
  psychup: "Copies the stat stages of the target. Fails if they are all 0. ",
  pursuit: "Doubles damage and goes first if the target is switching out. ",
  spikes: "Sets an entry hazard that damages any Pokémon switching in for 1/8 its max HP. ",
  foresight:
    "While this move is in effect, accuracy checks against the target ignore evasion and " +
    "accuracy stages if the target's evasion is greater than the user's accuracy, and Normal and " +
    "Fighting-type moves deal neutral damage to Ghost types. Switching removes this effect. ",
  batonpass: "Switches while retaining stages and certain volatile status conditions. ",
  beatup:
    "Deals a typeless 10 power attack for each Pokémon in the user's party without a non-volatile status condition. ",
  nightmare:
    "The target loses 1/4 its max HP at the end of every turn while asleep. Fails if the " +
    "target is not asleep. ",
};

const gen2Descriptions: Partial<Record<MoveId, string>> = {
  conversion:
    "Randomly changes the user's type to the type of one of its moves. Cannot change type to one " +
    "that matches any of the user's current types.",
  disable: "Disables a move from the target's move set at random.",
  haze: "Removes the all stat stages for both the user and the target. ",
  substitute:
    "The user sacrifices 1/4 its HP to create a substitute with 1/4 its HP + 1. The " +
    "substitute protects it from status, stat stage changes, and confusion from the opponent's " +
    "attacks. ",
  focusenergy: "Raises the user's critical hit stages by 1. Does not stack. ",
  counter: "Deals 2x the last move's damage if it was physical. ",
  rage: "Rage builds when attacked while using this move consecutively, increasing its damage. ",
};

const flagDesc: Record<NonNullable<DamagingMove["flag"]>, string> = {
  drain: "The user recovers 1/2 the damage dealt. ",
  explosion: "Halves target defense during damage calculation. Causes the user to faint. ",
  crash: "If the user misses this move, it will take 1 HP due to crash damage. ",
  multi: "Hits 2-5 times. ",
  high_crit: "Has a high critical hit ratio. ",
  recharge: "After using this move, the user must spend one turn to recharge. ",
  double: "Hits twice. ",
  dream_eater: "The user recovers 1/2 the damage dealt. Only works on sleeping targets. ",
  payday: "",
  multi_turn: "Locks the user in for 3-4 turns. Afterwards, the user becomes confused.",
  rage:
    "After using this move, the user will not be able to switch or do anything else except " +
    "continue to use Rage until it faints or the battle ends. Every time it is hit by a move " +
    "or targeted by Disable, Explosion, or Self-Destruct, its attack will increase by one " +
    "stage. ",
  ohko: "Deals 65535 damage to the target. Fails on faster opponents. ",
  trap: "Deals damage and prevents the target from moving for 2-5 turns. ",
  flail: "Higher power the lower the user's HP is. ",
  magnitude: "Power is determined randomly. ",
  false_swipe: "Always leaves the target with at least 1 HP. ",
  tri_attack:
    "Has a 20% chance to burn, paralyze, or freeze the target, and a 1/3 chance to thaw the " +
    "target if it is frozen. ",
  rapid_spin: "Removes the entry hazards and the effects of trapping moves and Leech Seed. ",
  rollout:
    "Locks the user in for 5 turns, doubling in power for each consecutive hit. Boosted if " +
    "Defense Curl was previously used by the user. ",
  triple:
    "Hits up to 3 times. The second hit has a damage multiplier of 2, and the third hit has " +
    "a damage multiplier of 3. ",
  fury_cutter: "Base power doubles for each consecutive use, up to a maximum of 160. ",
  minimize: "Doubles damage against a target that has previously used minimize. ",
  present:
    "Deals damage with a base power of 40, 80, or 120, or heals the target for 1/4 its max HP. ",
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
  return `${stats} by ${Math.abs(count)} stage${count > 1 ? "s" : ""}`;
};

export const describeMove = (gen: Generation, id: MoveId) => {
  const move = gen.moveList[id];
  // FIXME: more generic solution
  if (id in gen2Descriptions && gen.id === 2) {
    return gen2Descriptions[id];
  } else if (id in descriptions) {
    return descriptions[id];
  } else if (move.kind === "damage") {
    let buf = move.flag && move.flag in flagDesc ? flagDesc[move.flag] : "";
    if (move.flag === "drain" && gen.id === 2) {
      buf += "Always fails on a target with a substitute. ";
    }

    if (move.charge) {
      buf += "The user charges on the first turn, and attacks on the second. ";
      if (move.charge === "invuln") {
        buf += "While charging, the user can not be hit by most moves. ";
      } else if (move.charge === "sun") {
        buf += "Skips the charging turn if sun is active.";
      } else if (Array.isArray(move.charge)) {
        const raise = move.charge[0][1] < 0 ? "drops" : "raises";
        buf += `On the charge turn, ${raise} ${formatStages(move.charge)}. `;
      }
    }

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
      } else if (effect === "thief") {
        buf += "steal the target's item if it has one and the user does not. ";
      } else {
        buf += dmgStatusTable[effect];
      }
    }

    if (typeof move.getDamage === "number") {
      buf += `Deals ${move.getDamage} damage. `;
    }

    if (move.recoil) {
      buf += `The user takes 1/${move.recoil} the damage dealt due to recoil. `;
    }

    if (move.sleepOnly) {
      buf += "Fails if the user is not asleep. ";
    }

    if (move.selfThaw) {
      buf += "Thaws out the user if used while frozen. ";
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
      if (move.weather) {
        return "The user recovers a percenage of its max HP, varying with the weather. ";
      } else {
        return "The user recovers 1/2 its max HP. ";
      }
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
      safeguard:
        "Protects the user's side from non-volatile status conditions and confusion for 5 turns. ",
    };
    return msg[move.screen];
  } else if (move.kind === "protect") {
    if (move.endure) {
      return "Allows the user to survive any move that would faint it with 1 HP. More likely to fail if used successively. ";
    } else {
      return "Protects the user from most moves that target it directly. More likely to fail if used successively. ";
    }
  } else if (move.kind === "noSwitch") {
    return "Prevents the target from switching out. ";
  } else if (move.kind === "lockOn") {
    return "The next move used against the target will always hit, unless it is Earthquake, Fissure, or Magnitude and the target is in the semi-invulnerable turn of Fly. ";
  } else {
    return "No description. ";
  }
};

export const itemDesc: Partial<Record<ItemId, string>> = {
  softsand: "Boosts Ground-type moves by 10%.",
  hardstone: "Boosts Rock-type moves by 10%.",
  metalcoat: "Boosts Steel-type moves by 10%.",
  pinkbow: "Boosts Normal-type moves by 10%.",
  blackbelt: "Boosts Fighting-type moves by 10%.",
  sharpbeak: "Boosts Flying-type moves by 10%.",
  poisonbarb: "Boosts Poison-type moves by 10%.",
  silverpowder: "Boosts Bug-type moves by 10%.",
  spelltag: "Boosts Ghost-type moves by 10%.",
  polkadotbow: "Boosts Normal-type moves by 10%.",
  charcoal: "Boosts Fire-type moves by 10%.",
  mysticwater: "Boosts Water-type moves by 10%.",
  miracleseed: "Boosts Grass-type moves by 10%.",
  magnet: "Boosts Electric-type moves by 10%.",
  twistedspoon: "Boosts Psychic-type moves by 10%.",
  nevermeltice: "Boosts Ice-type moves by 10%.",
  dragonscale: "Boosts Dragon-type moves by 10%.",
  blackglasses: "Boosts Dark-type moves by 10%.",
  brightpowder: "Makes foes less accurate.",
  metalpowder: "Boosts Ditto's Def and SpD by 50%.",
  lightball: "Boosts Pikachu's SpA by 50%.",
  quickclaw: "Small chance to go first in priority bracket.",
  stick: "Boosts Farfetch'd's critical hit ratio by 2.",
  thickclub: "Boosts Marowak's Atk by 50%.",
  scopelens: "Boosts critical hit ratio.",
  leftovers: "Heal 1/16 HP after each turn.",
  kingsrock: "Small chance to flinch on most moves.",
  focusband: "Small chance to endure hits that would kill.",
  berserkgene: "Boosts Atk but permanently confuses.",
  berry: "Restores 10 HP once below 50%.",
  berryjuice: "Restores 20 HP once below 50%.",
  goldberry: "Restores 30 HP once below 50%.",
  mintberry: "Cures sleep once.",
  psncureberry: "Cures poison once.",
  przcureberry: "Cures paralyze once.",
  iceberry: "Cures burn once.",
  burntberry: "Cures freeze once.",
  miracleberry: "Cures status or confusion once.",
  bitterberry: "Cures confusion once.",
  mysteryberry: "Restores PP by 5 once.",
};
