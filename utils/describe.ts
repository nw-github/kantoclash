import type {ScreenId, StageId} from "~/game/utils";
import type {Status} from "../game/pokemon";
import type {DamagingMove, MoveId} from "~/game/moves";
import type {Generation} from "~/game/gen";
import type {ItemId} from "~/game/item";

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

const descriptions: Partial<Record<number, Partial<Record<MoveId, string>>>> = {
  [1]: {
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
    flatter: "Raises the target's Special Attack by 2 stages and confuses it. ",
    spite: "Lowers the PP of the target's last used move by 2-5 PP. ",
    sketch: "Permanently replaces this move with the last move used by the target. ",
    perishsong:
      "Sets a 3-turn timer for all Pokémon on the field, after which they will faint. Switching removes the timer. ",
    futuresight:
      "After two turns, the target is hit with an attack. Damage is calculated upon use " +
      "of the move. ",
    psychup: "Copies the stat stages of the target. Fails if they are all 0. ",
    pursuit: "Doubles damage and goes first if the target is switching out. ",
    spikes: "Sets an entry hazard that damages any Pokémon switching in for 1/8 its max HP. ",
    foresight:
      "While this move is in effect, accuracy checks against the target ignore evasion and " +
      "accuracy stages if the target's evasion is greater than the user's accuracy, and Normal and " +
      "Fighting-type moves deal neutral damage to Ghost types. Switching removes this effect. ",
    odorsleuth:
      "While this move is in effect, accuracy checks against the target ignore evasion and " +
      "accuracy stages if the target's evasion is greater than the user's accuracy, and Normal and " +
      "Fighting-type moves deal neutral damage to Ghost types. Switching removes this effect. ",
    batonpass: "Switches while retaining stages and certain volatile status conditions. ",
    nightmare:
      "The target loses 1/4 its max HP at the end of every turn while asleep. Fails if the " +
      "target is not asleep. ",
    mirrorcoat: "Deals 2x the last move's damage if it was special. Never counters Hidden Power. ",
    painsplit: "Adds the user and targets's HP, then shares the total equally. ",
    flail: "Higher power the lower the user's HP is. ",
    reversal: "Higher power the lower the user's HP is. ",
    trick: "Swaps the user and target's item. ",
    taunt: "Prevents the target from using non-damaging moves. ",
    endeavor: "Sets the target's HP to the user's current HP. Fails if the user's HP is higher. ",
    grudge:
      "Until the user moves again, if the user faints as the direct result of a move, the " +
      "target will lose all PP for that move. ",
    helpinghand: "Boosts the target's next damaging move by 50%. ",
    ingrain:
      "Prevents switching out and moves that force the target to switch, and heals the user " +
      "for 1/16 its max HP at the end of every turn. ",
    focuspunch:
      "Only works if the user was not hit with a damaging attack before the move executes. Being " +
      "hit while behind a substitute does not disrupt this move. ",
    naturepower: "Always calls Swift. ",
    refresh: "Cures the user of poison, paralysis, or burn. ",
    skillswap: "Swaps the user and target's abilities. ",
    wish: "At the end of the next turn, the Pokémon in this slot will recover 1/2 its max HP. ",
    charge: "Boost the next move's damage by 50% if it is electric type. ",
    followme: "Draws opponent single-target attacks toward the user. ",
    swallow:
      "Heals 25%, 50%, or 100% of the user's HP, based on the number of stockpiles, which is reset " +
      "after use of this move. Fails if the user has not used stockpile yet.",
    stockpile: "+1 stockpile, changing the properties of Spit Up and Swallow. Max 3.",
    weatherball: "Power doubles if weather is active. Changes type with the weather. ",
    watersport: "Reduces power of Fire-type attacks by 50% until the user switches out. ",
    mudsport: "Reduces power of Electric-type attacks by 50% until the user switches out. ",
    snatch: "Steals the next beneficial status move used by any Pokémon this turn. ",
    imprison: "Prevents opponents from using any move known by the user until it switches out. ",
    torment: "Prevents the target from using the same move twice in a row. ",
    assist: "Calls a random eligible move known by one of the user's teammates. ",
  },
  [2]: {
    conversion:
      "Randomly changes the user's type to the type of one of its moves. Cannot change type to " +
      "one that matches any of the user's current types.",
    disable: "Disables the target's last used move.",
    haze: "Removes all stat stages for both the user and the target (except critical hit stages). ",
    substitute:
      "The user sacrifices 1/4 its HP to create a substitute with 1/4 its HP + 1. The " +
      "substitute protects it from status, stat stage changes, and confusion from the opponent's " +
      "attacks. ",
    focusenergy: "Raises the user's critical hit stages by 1. Does not stack. ",
    counter: "Deals 2x the last move's damage if it was physical. Always counters Hidden Power. ",
    rage: "Rage builds when attacked while using this move consecutively, increasing its damage. ",
  },
  [3]: {
    spikes:
      "Sets an entry hazard that damages any Pokémon switching in for 1/8, 1/6, or 1/4 its " +
      "HP, depending on the number of uses of this move (Max 3). ",
    psychup: "Copies the stat stages of the target. ",
    focusenergy: "Raises the user's critical hit stages by 2. Does not stack. ",
    lowkick: "Power increases with the weight of the target. ",
  },
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
  none: "",
  payday: "",
  multi_turn: "Locks the user in for 3-4 turns. Afterwards, the user becomes confused.",
  rage:
    "After using this move, the user will not be able to switch or do anything else except " +
    "continue to use Rage until it faints or the battle ends. Every time it is hit by a move " +
    "or targeted by Disable, Explosion, or Self-Destruct, its attack will increase by one " +
    "stage. ",
  ohko: "Fails on faster opponents. ",
  trap: "Deals damage and prevents the target from moving for 2-5 turns. ",
  norand: "",
  magnitude: "Power is determined randomly. ",
  false_swipe: "Always leaves the target with at least 1 HP. ",
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
  bide:
    "The user sits dormant for 2-3 turns, then damages the opponent for 2x the damage received " +
    "during the idling period.",
  beatup:
    "Hits with a typeless 10 power attack for each Pokémon in the user's party without a non-volatile status condition. ",
  facade: "Doubles damage when poisoned, paralyzed or burned.",
  remove_screens: "Removes the effects of Light Screen and Reflect. ",
  smellingsalt: "Doubles power against paralyzed a paralyzed target, but cures its paralysis. ",
  spitup:
    "Damage multiplied by number of stockpiles, which is reset after use of this move. Fails if " +
    "the user has not used stockpile yet.",
  uproar:
    "Locks the user in for 2-5 turns and starts an uproar, waking sleeping Pokémon up and " +
    "preventing Pokémon from falling asleep. ",
  revenge: "Doubles damage if the target was the last Pokémon to hit the user in this turn. ",
};

const formatStages = (gen: Generation, stages: [StageId, number][]) => {
  const table = getStageTable(gen);
  const statsBefore = stages.map(v => table[v[0]]);
  let stats = "";
  if (statsBefore.length > 1) {
    stats = statsBefore.slice(0, -1).join(", ") + ", and " + statsBefore.at(-1);
  } else {
    stats = statsBefore[0];
  }

  const [, count] = stages[0];
  return `${stats} by ${Math.abs(count)} stage${Math.abs(count) > 1 ? "s" : ""}`;
};

export const describeMove = (gen: Generation, id: MoveId) => {
  for (let i = gen.id; i > 0; i--) {
    const desc = descriptions[i];
    if (desc && id in desc) {
      return desc[id];
    }
  }

  const move = gen.moveList[id];
  if (move.kind === "damage") {
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
        buf += `On the charge turn, ${raise} ${formatStages(gen, move.charge)}. `;
      }
    }

    effect: if (move.effect) {
      const [chance, effect] = move.effect;
      if (!chance) {
        break effect;
      }

      buf += `Has a ${chance}% chance to `;
      if (Array.isArray(effect)) {
        const raise = effect[0][1] < 0 ? "drop" : "raise";
        buf += `${raise} ${formatStages(gen, effect)}. `;
      } else if (effect === "confusion") {
        buf += "confuse the target. ";
      } else if (effect === "flinch") {
        buf += "flinch the target. ";
      } else if (effect === "thief") {
        buf += "steal the target's item if it has one and the user does not. ";
      } else if (effect === "tri_attack") {
        buf +=
          "burn, paralyze, or freeze the target, and a 1/3 chance to thaw the target if it is frozen. ";
      } else if (effect === "knockoff") {
        buf += "render the target's item unusable. ";
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
    return `${raise} the ${target}'s ${formatStages(gen, move.stages)}. `;
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
    const msg: Record<ScreenId, string> = {
      light_screen:
        "Halves damage dealt by special attacks for all pokemon on the user's side for 5 turns. ",
      reflect:
        "Halves damage dealt by physical attacks for all pokemon on the user's side for 5 turns. ",
      safeguard:
        "Protects the user's side from non-volatile status conditions and confusion for 5 turns. ",
      mist: "Protects the user's side from stat stage drops for 5 turns. ",
    };
    return msg[move.screen];
  } else if (move.kind === "protect") {
    if (move.endure) {
      return "Allows the user to survive any move that would cause it to faint with 1 HP. More likely to fail if used successively. ";
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
  dragonscale: "Boosts Dragon-type moves by 10%.", // Gen 2
  dragonfang: "Boosts Dragon-type moves by 10%.", // Gen 3 +
  blackglasses: "Boosts Dark-type moves by 10%.",
  silkscarf: "Boosts Normal-type moves by 10%.",
  seaincense: "Boosts Water-type moves by 5%.",

  brightpowder: "Makes foes less accurate.",
  laxincense: "Makes foes less accurate.",

  metalpowder: "Boosts Ditto's Def and SpD by 50%.",
  lightball: "Boosts Pikachu's SpA by 50%.",
  thickclub: "Boosts Marowak's Atk by 50%.",
  souldew: "Boosts Latios/Latias's SpA and SpD by 50%.",
  deepseatooth: "Boosts Clamperl's SpA by 50%.",
  deepseascale: "Boosts Clamperl's SpD by 50%.",

  quickclaw: "Small chance to go first in priority bracket.",
  stick: "Boosts Farfetch'd's critical hit ratio by 2.",
  scopelens: "Boosts critical hit ratio.",
  leftovers: "Heal 1/16 HP after each turn.",
  kingsrock: "Small chance to flinch on most moves.",
  focusband: "Small chance to endure hits that would kill.",
  berserkgene: "Boosts Atk but permanently confuses.",

  oranberry: "Restores 10 HP once below 50% HP.",
  berry: "Restores 10 HP once below 50% HP.",
  berryjuice: "Restores 20 HP once below 50% HP.",
  goldberry: "Restores 30 HP once below 50% HP.",
  sitrusberry: "Restores 30 HP once below 50% HP.",

  mintberry: "Cures sleep once.",
  psncureberry: "Cures poison once.",
  przcureberry: "Cures paralysis once.",
  iceberry: "Cures burn once.",
  burntberry: "Cures freeze once.",
  miracleberry: "Cures status or confusion once.",
  bitterberry: "Cures confusion once.",
  mysteryberry: "Restores PP by 5 once.",

  chestoberry: "Cures sleep once.",
  pechaberry: "Cures poison once.",
  cheriberry: "Cures paralysis once.",
  rawstberry: "Cures burn once.",
  aspearberry: "Cures freeze once.",
  lumberry: "Cures status or confusion once.",
  persimberry: "Cures confusion once.",
  leppaberry: "Restores PP by 10 once.",

  figyberry: "Heals 1/8 HP below 50% HP. Confuses if -Atk.",
  wikiberry: "Heals 1/8 HP below 50% HP. Confuses if -SpA.",
  magoberry: "Heals 1/8 HP below 50% HP. Confuses if -Spe.",
  aguavberry: "Heals 1/8 HP below 50% HP. Confuses if -SpD.",
  iapapaberry: "Heals 1/8 HP below 50% HP. Confuses if -Def.",

  liechiberry: "Raises Atk by 1 when below 25% HP.",
  ganlonberry: "Raises Def by 1 when below 25% HP.",
  salacberry: "Raises Spe by 1 when below 25% HP.",
  petayaberry: "Raises SpA by 1 when below 25% HP.",
  apicotberry: "Raises SpD by 1 when below 25% HP.",
  lansatberry: "Raises Crit by 2 when below 25% HP.",
  starfberry: "Raises a random stat by 2 when below 25% HP.",

  choiceband: "Boosts Atk by 50% but prevents switching moves.",
  mentalherb: "Prevents infatuation.",
  shellbell: "Restores 1/8 damage dealt on each attack.",
  whiteherb: "Resets negative stat stages once.",
};
