import type {ActivePokemon, Battle} from "../battle";
import {moveFunctions, type BaseMove} from "./index";
import {getHiddenPower, type Pokemon, type Status} from "../pokemon";
import {isSpecial, type Stages, randChoiceWeighted, idiv, hpPercentExact} from "../utils";
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
  | "charge"
  | "charge_sun"
  | "charge_invuln"
  | "multi_turn"
  | "rage"
  | "trap"
  | "level"
  | "ohko"
  | "counter"
  | "super_fang"
  | "psywave"
  | "frustration"
  | "return"
  | "flail"
  | "hidden_power"
  | "magnitude"
  | "false_swipe"
  | "tri_attack";

export interface DamagingMove extends BaseMove {
  readonly kind: "damage";
  readonly power: number;
  readonly flag?: Flag;
  readonly effect?: [number, Effect];
  readonly effect_self?: boolean | "charge";
  readonly recoil?: number;
  readonly dmg?: number;
  readonly punish?: boolean;
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
    return dead;
  }

  if (
    (this.flag === "charge" || this.flag === "charge_sun" || this.flag === "charge_invuln") &&
    user.v.charging !== this
  ) {
    battle.event({type: "charge", src: user.owner.id, move: battle.moveIdOf(this)!});
    if (!(this.flag === "charge_sun" && battle.weather?.kind === "sun")) {
      user.v.charging = this;
      user.v.invuln = this.flag === "charge_invuln" || user.v.invuln;
      return false;
    }
  }

  user.v.charging = undefined;
  user.v.trapping = undefined;
  target.lastDamage = 0;
  if (this.flag === "charge_invuln") {
    user.v.invuln = false;
  }
  return moveFunctions.default.use!.call(this, battle, user, target, moveIndex);
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
      user.confuse(battle, true);
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
        return false;
      }
    }

    if (this.flag === "crash") {
      // https://www.smogon.com/dex/rb/moves/high-jump-kick/
      if (user.v.substitute && target.v.substitute) {
        target.damage(1, user, battle, false, "attacked");
      } else if (!user.v.substitute) {
        return user.damage(1, user, battle, false, "crash", true).dead;
      }
    } else if (this.flag === "explosion") {
      // according to showdown, explosion also boosts rage even on miss/failure
      target.handleRage(battle);
      return user.damage(user.base.hp, user, battle, false, "explosion", true).dead;
    }

    return false;
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
    return dead;
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
      target.v.hazed = true;
      battle.info(target, "thaw");
      // TODO: can you thaw and then burn?
      return dead;
    }

    if (!battle.rand100(chance)) {
      return dead;
    }

    if (effect === "confusion") {
      if (target.v.confusion === 0) {
        target.confuse(battle);
      }
      return dead;
    } else if (hadSub) {
      return dead;
    } else if (Array.isArray(effect)) {
      const poke = this.effect_self ? user : target;
      poke.modStages(user.owner, effect, battle);
    } else if (effect === "flinch") {
      target.v.flinch = true;
    } else {
      if (target.base.status || target.v.types.includes(this.type)) {
        return dead;
      }

      target.status(effect, battle);
    }
  } else if (this.flag === "tri_attack") {
    const choice = battle.rng.choice(["brn", "par", "frz"] as const)!;
    if (target.base.status === "frz" && choice === "brn") {
      target.base.status = undefined;
      target.v.hazed = true;
      battle.info(target, "thaw");
      return dead;
    } else if (!target.base.status && battle.rand100(20)) {
      // In Gen 2, tri attack can burn fire types and freeze ice types
      target.status(choice, battle);
    }
  }

  return dead;
}

function getDamage(self: DamagingMove, battle: Battle, user: ActivePokemon, target: ActivePokemon) {
  // eslint-disable-next-line prefer-const
  let [type, pow] = getMovePower(self, user.base);

  // https://bulbapedia.bulbagarden.net/wiki/Damage#Generation_I
  const eff = battle.getEffectiveness(type, target.v.types);
  if (self.flag === "dream_eater" && target.base.status !== "slp") {
    return {dmg: 0, isCrit: false, eff: 1};
  } else if (self.flag === "level") {
    return {dmg: user.base.level, isCrit: false, eff: 1};
  } else if (self.flag === "ohko") {
    const targetIsFaster = target.getStat("spe") > user.getStat("spe");
    return {dmg: targetIsFaster || eff === 0 ? 0 : 65535, isCrit: false, eff: eff === 0 ? 0 : 1};
  } else if (self.flag === "counter") {
    // https://www.youtube.com/watch?v=ftTalHMjPRY
    //  On cartrige, the move counter uses is updated whenever a player hovers over a move (even
    //  if he doesn't select it). In a link battle, this information is not shared between both
    //  players. This means, that a player can influence the ability of counter to succeed by
    //  hovering over a move on their side, cancelling the 'FIGHT' menu, and switching out. Since
    //  we don't have a FIGHT menu, and this can cause a desync anyway, just use the last
    //  attempted move.

    const mv = target.lastChosenMove;
    let dmg = user.lastDamage * 2;
    if (mv && ((mv.type !== "normal" && mv.type !== "fight") || !mv.power || mv === self)) {
      dmg = 0;
    } else if (target.owner.choice?.move === self) {
      dmg = 0;
    }
    // Counter can crit, but it won't do any more damage
    return {dmg, isCrit: false, eff: 1};
  } else if (self.flag === "super_fang") {
    return {dmg: Math.max(Math.floor(target.base.hp / 2), 1), isCrit: false, eff: 1};
  } else if (self.flag === "psywave") {
    // psywave has a desync glitch that we don't emulate
    const dmg = battle.rng.int(1, Math.max(Math.floor(user.base.level * 1.5 - 1), 1));
    return {dmg, isCrit: false, eff: 1};
  } else if (self.dmg) {
    return {dmg: self.dmg, isCrit: false, eff: 1};
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
      type === "fire" || self.flag === "charge_sun"
        ? "penalty"
        : type === "water"
        ? "bonus"
        : undefined;
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

export function getMovePower(self: DamagingMove, user: Pokemon) {
  let pow = self.power;
  let type = self.type;
  if (self.flag === "hidden_power") {
    [type, pow] = getHiddenPower(user.dvs);
  }

  if (self.flag === "frustration") {
    pow = idiv(255 - user.friendship, 2.5);
  } else if (self.flag === "return") {
    pow = idiv(user.friendship, 2.5);
  } else if (self.flag === "flail") {
    const percent = hpPercentExact(user.hp, user.stats.hp);
    if (percent >= 68.8) {
      pow = 20;
    } else if (percent >= 35.4) {
      pow = 40;
    } else if (percent >= 20.8) {
      pow = 80;
    } else if (percent >= 10.4) {
      pow = 100;
    } else if (percent >= 4.2) {
      pow = 150;
    } else {
      pow = 200;
    }
  }

  return [type, pow] as const;
}
