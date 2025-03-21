import type {ActivePokemon, Battle} from "../battle";
import type {BaseMove} from "./index";
import type {Pokemon, Status} from "../pokemon";
import {isSpecial, type Stages, randChoiceWeighted, type Type} from "../utils";
import type {Random} from "random";
import type {CalcDamageParams} from "../gen";

type Effect = Status | [Stages, number][] | "confusion" | "flinch";

type Flag =
  | "high_crit"
  | "drain"
  | "explosion"
  | "recharge"
  | "crash"
  | "double"
  | "multi"
  | "dream_eater"
  | "payday"
  | "multi_turn"
  | "rage"
  | "trap"
  | "ohko"
  | "flail"
  | "magnitude"
  | "false_swipe"
  | "tri_attack";

export interface DamagingMove extends BaseMove {
  readonly kind: "damage";
  readonly power: number;
  readonly flag?: Flag;
  readonly effect?: [number, Effect];
  readonly effect_self?: boolean;
  readonly recoil?: number;
  readonly punish?: boolean;
  readonly charge?: boolean | "sun" | "invuln" | [Stages, number][];
  readonly getPower?: (user: Pokemon) => number;
  readonly getType?: (user: Pokemon) => Type;
  readonly getDamage?:
    | number
    | ((battle: Battle, user: ActivePokemon, target: ActivePokemon, eff: number) => number | false);
}

export function use(
  this: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  moveIndex?: number,
) {
  if (user.v.trapping && target.v.trapped) {
    const dead = target.damage(target.lastDamage, user, battle, false, "trap").dead;
    if (dead || --user.v.trapping.turns === 0) {
      user.v.trapping = undefined;
    }
    return;
  }

  if (this.charge && user.v.charging !== this) {
    battle.event({type: "charge", src: user.owner.id, move: battle.moveIdOf(this)!});
    if (Array.isArray(this.charge)) {
      user.modStages(user.owner, this.charge, battle);
    }

    if (this.charge !== "sun" || battle.weather?.kind !== "sun") {
      user.v.charging = this;
      user.v.invuln = this.charge === "invuln" || user.v.invuln;
      return;
    }
  }

  user.v.charging = undefined;
  user.v.trapping = undefined;
  target.lastDamage = 0;
  if (this.charge === "invuln") {
    user.v.invuln = false;
  }
  return battle.defaultUseMove(this, user, target, moveIndex);
}

export function exec(
  this: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
) {
  if (this.flag === "multi_turn" && !user.v.thrashing) {
    user.v.thrashing = {move: this, turns: battle.rng.int(2, 3)};
  } else if (user.v.thrashing && user.v.thrashing.turns !== -1) {
    if (--user.v.thrashing.turns === 0) {
      user.v.thrashing = undefined;
      if (!user.owner.screens.safeguard) {
        user.confuse(battle, true);
      }
    }
  }

  if (this.flag === "trap") {
    target.v.recharge = undefined;
  }

  const {dmg, isCrit, eff} = getDamage(this, battle, user, target);
  if (dmg === 0 || !battle.checkAccuracy(this, user, target)) {
    if (dmg === 0) {
      if (eff === 0) {
        battle.info(target, "immune");
        if (this.flag === "trap") {
          trapTarget(this, battle.rng, user, target);
        }
      } else {
        battle.info(user, "miss");
      }

      if (this.flag === "crash" && eff === 0) {
        return;
      }
    }

    if (this.flag === "crash") {
      // https://www.smogon.com/dex/rb/moves/high-jump-kick/
      if (user.v.substitute && target.v.substitute) {
        target.damage(1, user, battle, false, "attacked");
      } else if (!user.v.substitute) {
        user.damage(1, user, battle, false, "crash", true);
      }
    } else if (this.flag === "explosion") {
      // according to showdown, explosion also boosts rage even on miss/failure
      target.handleRage(battle);
      user.damage(user.base.hp, user, battle, false, "explosion", true);
    }
    return;
  }

  if (this.flag === "rage") {
    user.v.thrashing = {move: this, turns: -1};
  }

  const hadSub = target.v.substitute !== 0;
  // eslint-disable-next-line prefer-const
  let {dealt, brokeSub, dead, event} = target.damage(
    dmg,
    user,
    battle,
    isCrit,
    this.flag === "ohko" ? "ohko" : "attacked",
    false,
    eff,
  );

  if (this.flag === "multi" || this.flag === "double") {
    event.hitCount = 1;
  }

  if (!brokeSub) {
    if (this.recoil) {
      dead =
        user.damage(
          Math.max(Math.floor(dealt / this.recoil), 1),
          user,
          battle,
          false,
          "recoil",
          true,
        ).dead || dead;
    }

    if (this.flag === "drain" || this.flag === "dream_eater") {
      // https://www.smogon.com/forums/threads/past-gens-research-thread.3506992/#post-5878612
      //  - DRAIN HP SIDE EFFECT
      const dmg = Math.max(Math.floor(dealt / 2), 1);
      target.lastDamage = dmg;
      user.recover(dmg, target, battle, "drain");
    } else if (this.flag === "explosion") {
      dead = user.damage(user.base.hp, user, battle, false, "explosion", true).dead || dead;
    } else if (this.flag === "double" || this.flag === "multi") {
      const count = this.flag === "double" ? 2 : multiHitCount(battle.rng);
      for (let hits = 1; !dead && !brokeSub && hits < count; hits++) {
        event.hitCount = 0;
        ({dead, brokeSub, event} = target.damage(
          dmg,
          user,
          battle,
          isCrit,
          "attacked",
          false,
          eff,
        ));
        event.hitCount = hits + 1;
      }
    } else if (this.flag === "payday") {
      battle.info(user, "payday");
    }
  }

  if (dead || brokeSub) {
    return;
  }

  if (this.flag === "recharge") {
    user.v.recharge = this;
  } else if (this.flag === "trap") {
    trapTarget(this, battle.rng, user, target);
  }

  if (this.effect) {
    const [chance, effect] = this.effect;
    if (effect === "brn" && target.base.status === "frz") {
      target.base.status = undefined;
      battle.unstatus(target, "thaw");
      target.v.hazed = true;
      // TODO: can you thaw and then burn?
      return;
    }

    if (!battle.rand100(chance)) {
      return;
    }

    if (effect === "confusion") {
      if (target.v.confusion === 0 && !user.owner.screens.safeguard) {
        target.confuse(battle);
      }
      return;
    } else if (hadSub) {
      return;
    } else if (Array.isArray(effect)) {
      const poke = this.effect_self ? user : target;
      poke.modStages(user.owner, effect, battle);
    } else if (effect === "flinch") {
      target.v.flinch = true;
    } else {
      if (
        target.owner.screens.safeguard ||
        target.base.status ||
        target.v.types.includes(this.type)
      ) {
        return;
      }

      target.status(effect, battle);
    }
  } else if (this.flag === "tri_attack") {
    const choice = battle.rng.choice(["brn", "par", "frz"] as const)!;
    if (target.base.status === "frz" && choice === "brn") {
      target.v.hazed = true;
      battle.unstatus(target, "thaw");
      return;
    } else if (!target.base.status && !target.owner.screens.safeguard && battle.rand100(20)) {
      // In Gen 2, tri attack can burn fire types and freeze ice types
      target.status(choice, battle);
    }
  }
}

function getDamage(self: DamagingMove, battle: Battle, user: ActivePokemon, target: ActivePokemon) {
  let pow = self.getPower ? self.getPower(user.base) : self.power;
  const type = self.getType ? self.getType(user.base) : self.type;
  const eff = battle.getEffectiveness(type, target.v.types);
  if (self.flag === "dream_eater" && target.base.status !== "slp") {
    return {dmg: 0, isCrit: false, eff: 1};
  } else if (typeof self.getDamage === "number") {
    return {dmg: self.getDamage, isCrit: false, eff: 1};
  } else if (self.getDamage) {
    const result = self.getDamage(battle, user, target, eff);
    if (typeof result === "number") {
      return {dmg: result, isCrit: false, eff: 1};
    } else {
      return {dmg: 0, isCrit: false, eff: 0};
    }
  }

  let isCrit = battle.rand255(battle.gen.getCritChance(user, self.flag === "high_crit"));
  let rand: number | false | Random = battle.rng;
  if (self.flag === "flail") {
    isCrit = false;
    rand = false;
  } else if (self.flag === "magnitude") {
    const magnitude = battle.rng.int(4, 10);
    pow = [10, 30, 50, 70, 90, 110, 150][magnitude - 4];
    battle.event({type: "magnitude", magnitude});
  }

  let weather: CalcDamageParams["weather"];
  if (battle.weather?.kind === "rain") {
    weather =
      type === "fire" || self.charge === "sun" ? "penalty" : type === "water" ? "bonus" : undefined;
  } else if (battle.weather?.kind === "sun") {
    weather = type === "fire" ? "bonus" : type === "water" ? "penalty" : undefined;
  }

  const explosion = self.flag === "explosion" ? 2 : 1;
  const [atk, def] = battle.gen.getDamageVariables(isSpecial(type), user, target, isCrit);
  let dmg = battle.gen.calcDamage({
    lvl: user.base.level,
    pow,
    atk,
    def: Math.max(Math.floor(def / explosion), 1),
    isCrit,
    isStab: user.v.types.includes(type),
    rand,
    eff,
    weather,
  });

  if (self.flag === "false_swipe" && dmg >= target.base.hp && !target.v.substitute) {
    dmg = target.base.hp - 1;
  }
  return {dmg, isCrit, eff};
}

function trapTarget(self: DamagingMove, rng: Random, user: ActivePokemon, target: ActivePokemon) {
  target.v.trapped = true;
  user.v.trapping = {move: self, turns: multiHitCount(rng) - 1};
}

function multiHitCount(rng: Random) {
  return randChoiceWeighted(rng, [2, 3, 4, 5], [37.5, 37.5, 12.5, 12.5]);
}
