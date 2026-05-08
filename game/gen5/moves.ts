import type {Battle, Battlemon} from "../battle";
import type {Move, MoveScripts, MoveId, MovePropOverrides, DamagingMove} from "../moves";
import {DMF, idiv1, Range, NO_SKILL_SWAP_ABILITIES} from "../utils";

export const moveScripts: Partial<MoveScripts> = {
  healbell(battle, user) {
    battle.info(user, this.why);
    for (const poke of user.owner.active) {
      poke.unstatus(battle);
    }
    const opp = battle.opponentOf(user.owner);
    for (const poke of user.owner.team) {
      if (user.owner.active.some(p => p.base === poke)) {
        continue;
      }

      poke.status = undefined;
      if (opp.sleepClausePoke === poke) {
        opp.sleepClausePoke = undefined;
      }
    }
  },
  skillswap(battle, user, [target]) {
    const userAbility = user.v.ability!;
    const targetAbility = target.v.ability!;
    if (
      NO_SKILL_SWAP_ABILITIES.has(userAbility) ||
      NO_SKILL_SWAP_ABILITIES.has(targetAbility) ||
      userAbility === targetAbility
    ) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    user.v.ability = targetAbility;
    target.v.ability = userAbility;
    // TODO: the ability effect should also activate here
    battle.ability(user);
    battle.ability(target);
    battle.event({type: "skill_swap", src: user.id, target: target.id});
  },
  worryseed(battle, user, [target]) {
    const ability = target.getAbilityId();
    if (ability === "truant" || ability === "multitype" || ability === "insomnia") {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    battle.ability(target);
    target.v.ability = "insomnia";
    battle.ability(target);
    battle.info(target, "worryseed");
    if (target.base.status === "slp") {
      target.unstatus(battle);
    }
  },
};

export const moveOverrides: Partial<MovePropOverrides> = {
  pow: {
    pursuit(_, user) {
      return user.v.inPursuit ? this.power << 1 : this.power;
    },
    crushgrip: getCrushGripPower,
    wringout: getCrushGripPower,
    payback(_, _user, target) {
      return target.choice?.executed && target.choice.move.kind !== "switch"
        ? this.power << 1
        : this.power;
    },
  },
  dmgPreCheck: {
    feint: () => true,
  },
};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  aquaring: {snatch: true},
  beatup: {noTechnician: false, power: 0},
  bind: {acc: 85},
  bonerush: {acc: 90},
  bulletseed: {power: 25},
  camouflage: {camouflageType: "ground"},
  chatter: {effect: [10, "confusion"]},
  clamp: {acc: 85, pp: 15},
  conversion: {snatch: true},
  cottonspore: {acc: 100},
  covet: {power: 60},
  crabhammer: {acc: 90},
  curse: {type: "ghost"},
  defog: {magicCoat: true},
  detect: {priority: +4},
  disable: {acc: 100},
  doomdesire: {power: 140, acc: 100},
  drainpunch: {power: 75, pp: 10},
  embargo: {magicCoat: true},
  endure: {priority: +4},
  extremespeed: {priority: +2},
  fakeout: {priority: +3},
  feint: {power: 30},
  firespin: {power: 35, acc: 85},
  foresight: {magicCoat: true},
  furycutter: {power: 20},
  futuresight: {power: 100, acc: 100, pp: 10},
  glare: {acc: 90},
  gigadrain: {power: 75},
  hijumpkick: {power: 130, pp: 10},
  iciclespear: {power: 25},
  imprison: {snatch: true},
  jumpkick: {power: 100, pp: 10},
  lastresort: {power: 140},
  luckychant: {snatch: true},
  magmastorm: {acc: 75},
  magnetrise: {snatch: true},
  minimize: {stages: [["eva", +1]]},
  miracleeye: {magicCoat: true},
  naturepower: {calls: "earthquake"},
  odorsleuth: {magicCoat: true},
  outrage: {pp: 10},
  petaldance: {power: 120, pp: 10},
  poisongas: {acc: 90, range: Range.AllAdjacentFoe},
  powertrick: {snatch: true},
  protect: {priority: +4},
  psychup: {snatch: false},
  recycle: {snatch: true},
  rockblast: {acc: 90},
  sandtomb: {power: 35, acc: 85},
  scaryface: {acc: 100},
  spitup: {flag: DMF.none},
  struggle: {noTechnician: false},
  tackle: {power: 50, acc: 100},
  tailglow: {stages: [["spa", +3]]},
  tailwind: {turns: 4 + 1},
  thrash: {power: 120, pp: 10},
  toxic: {acc: 90},
  uproar: {power: 90},
  whirlpool: {power: 35, acc: 85},
  wrap: {acc: 90},
};

function getCrushGripPower(_: Battle, _user: Battlemon, target: Battlemon) {
  return idiv1(target.base.hp * 120, target.base.maxHp);
}

export const isAffectedBySheerForce = (move: DamagingMove) => {
  const doesEffectCount = (effect?: DamagingMove["effect"]) => {
    if (!effect) {
      return false;
    }

    const [_chance, effectKind, effectSelf] = effect;
    if (effectKind === "knockoff" || effectKind === "thief") {
      return false;
    } else if (effectSelf && Array.isArray(effectKind) && effectKind.every(eff => eff[1] < 0)) {
      // Reducing user's own stats
      return false;
    }
    return true;
  };
  return doesEffectCount(move.effect) || doesEffectCount(move.effect2);
};
