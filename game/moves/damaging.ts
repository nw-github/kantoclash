import type { ActivePokemon, Battle } from "../battle";
import { Move } from "./move";
import type { Status } from "../pokemon";
import {
  floatTo255,
  getEffectiveness,
  isSpecial,
  calcDamage,
  type Type,
  type Stages,
} from "../utils";
import type { Random } from "random";

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
  | "charge_invuln"
  | "multi_turn"
  | "rage"
  | "trap"
  | "level"
  | "ohko"
  | "counter"
  | "super_fang"
  | "psywave";

export class DamagingMove extends Move {
  readonly flag?: Flag;
  readonly effect?: [number, Effect];
  readonly recoil?: number;
  readonly dmg?: number;

  constructor({
    name,
    pp,
    type,
    power,
    acc,
    priority,
    effect,
    recoil,
    flag,
    dmg,
  }: {
    name: string;
    pp: number;
    type: Type;
    power: number;
    acc?: number;
    priority?: number;
    effect?: [number, Effect];
    recoil?: number;
    flag?: Flag;
    dmg?: number;
  }) {
    super(name, pp, type, acc, priority, power);
    this.flag = flag;
    this.effect = effect;
    this.recoil = recoil;
    this.dmg = dmg;
  }

  override use(battle: Battle, user: ActivePokemon, target: ActivePokemon, moveIndex?: number) {
    if (user.v.trapping && target.v.trapped) {
      const dead = target.damage(target.lastDamage, user, battle, false, "trap").dead;
      if (dead || --user.v.trapping.turns === 0) {
        user.v.trapping = undefined;
      }
      return dead;
    }

    if ((this.flag === "charge" || this.flag === "charge_invuln") && user.v.charging !== this) {
      battle.event({ type: "charge", id: user.owner.id, move: battle.moveIdOf(this)! });
      user.v.charging = this;
      user.v.invuln = this.flag === "charge_invuln" || user.v.invuln;
      return false;
    }

    user.v.charging = undefined;
    user.v.trapping = undefined;
    target.lastDamage = 0;
    if (this.flag === "charge_invuln") {
      user.v.invuln = false;
    }
    return super.use(battle, user, target, moveIndex);
  }

  override execute(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
    if (this.flag === "multi_turn" && !user.v.thrashing) {
      user.v.thrashing = { move: this, turns: battle.rng.int(2, 3) };
    } else if (user.v.thrashing && user.v.thrashing.turns !== -1) {
      if (--user.v.thrashing.turns === 0) {
        user.v.thrashing = undefined;
        user.confuse(battle, true);
      }
    }

    if (this.flag === "trap") {
      target.v.recharge = undefined;
    }

    const { dmg, isCrit, eff } = this.getDamage(battle, user, target);
    if (dmg === 0 || !this.checkAccuracy(battle, user, target)) {
      if (dmg === 0) {
        if (eff === 0) {
          battle.info(target, "immune");
          if (this.flag === "trap") {
            this.trapTarget(battle.rng, user, target);
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
      user.v.thrashing = { move: this, turns: -1 };
    }

    const hadSub = target.v.substitute !== 0;
    let { dealt, brokeSub, dead, event } = target.damage(
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
        const count = this.flag === "double" ? 2 : DamagingMove.multiHitCount(battle.rng);
        for (let hits = 1; !dead && !brokeSub && hits < count; hits++) {
          event.hitCount = 0;
          ({ dead, brokeSub, event } = target.damage(
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
      this.trapTarget(battle.rng, user, target);
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

      if (battle.rng.int(1, 256) > Math.floor((chance / 100) * 256)) {
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
        target.modStages(user.owner, effect, battle);
      } else if (effect === "flinch") {
        target.v.flinch = true;
      } else {
        if (target.base.status || target.v.types.includes(this.type)) {
          return dead;
        }

        target.status(effect, battle);
      }
    }

    return dead;
  }

  static getDamageVariables(
    special: boolean,
    user: ActivePokemon,
    target: ActivePokemon,
    isCrit: boolean,
  ) {
    const [atks, defs] = special ? (["spc", "spc"] as const) : (["atk", "def"] as const);

    const ls = atks === "spc" && target.v.flags.light_screen;
    const reflect = atks === "atk" && target.v.flags.reflect;

    let atk = user.getStat(atks, isCrit);
    let def = target.getStat(defs, isCrit, true, ls || reflect);
    if (atk >= 256 || def >= 256) {
      atk = Math.max(Math.floor(atk / 4) % 256, 1);
      // defense doesn't get capped here on cart, potentially causing divide by 0
      def = Math.max(Math.floor(def / 4) % 256, 1);
    }
    return [atk, def] as const;
  }

  private getDamage(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
    // https://bulbapedia.bulbagarden.net/wiki/Damage#Generation_I
    const eff = getEffectiveness(this.type, target.v.types);
    if (this.flag === "dream_eater" && target.base.status !== "slp") {
      return { dmg: 0, isCrit: false, eff: 1 };
    } else if (this.flag === "level") {
      return { dmg: user.base.level, isCrit: false, eff: 1 };
    } else if (this.flag === "ohko") {
      const targetIsFaster = target.getStat("spe") > user.getStat("spe");
      return {
        dmg: targetIsFaster || eff === 0 ? 0 : 65535,
        isCrit: false,
        eff,
      };
    } else if (this.flag === "counter") {
      // https://www.youtube.com/watch?v=ftTalHMjPRY
      //  On cartrige, the move counter uses is updated whenever a player hovers over a move (even
      //  if he doesn't select it). In a link battle, this information is not shared between both
      //  players. This means, that a player can influence the ability of counter to succeed by
      //  hovering over a move on their side, cancelling the 'FIGHT' menu, and switching out. Since
      //  we don't have a FIGHT menu, and this can cause a desync anyway, just use the last
      //  attempted move.

      const mv = target.lastChosenMove;
      let dmg = user.lastDamage * 2;
      if (mv && ((mv.type !== "normal" && mv.type !== "fight") || !mv.power || mv === this)) {
        dmg = 0;
      } else if (target.owner.choice?.move === this) {
        dmg = 0;
      }
      // Counter can crit, but it won't do any more damage
      return { dmg, isCrit: false, eff: 1 };
    } else if (this.flag === "super_fang") {
      return { dmg: Math.max(Math.floor(target.base.hp / 2), 1), isCrit: false, eff: 1 };
    } else if (this.flag === "psywave") {
      // psywave has a desync glitch that we don't emulate
      const dmg = battle.rng.int(1, Math.max(Math.floor(user.base.level * 1.5 - 1), 1));
      return { dmg, isCrit: false, eff: 1 };
    } else if (this.dmg) {
      return { dmg: this.dmg, isCrit: false, eff: 1 };
    }

    const baseSpe = user.base.species.stats.spe;
    let chance;
    if (this.flag === "high_crit") {
      chance = user.v.flags.focus ? 4 * Math.floor(baseSpe / 4) : 8 * Math.floor(baseSpe / 2);
    } else {
      chance = Math.floor(user.v.flags.focus ? baseSpe / 8 : baseSpe / 2);
    }

    const isCrit = battle.rand255(chance);
    const explosion = this.flag === "explosion" ? 2 : 1;
    const [atk, def] = DamagingMove.getDamageVariables(isSpecial(this.type), user, target, isCrit);
    const dmg = calcDamage({
      lvl: user.base.level,
      pow: this.power!,
      atk,
      def: Math.max(Math.floor(def / explosion), 1),
      isCrit,
      isStab: user.v.types.includes(this.type),
      rand: battle.rng,
      eff,
    });
    return { dmg, isCrit, eff };
  }

  private static multiHitCount(rng: Random) {
    return randChoiceWeighted(rng, [2, 3, 4, 5], [37.5, 37.5, 12.5, 12.5]);
  }

  private trapTarget(rng: Random, user: ActivePokemon, target: ActivePokemon) {
    target.v.trapped = true;
    user.v.trapping = { move: this, turns: DamagingMove.multiHitCount(rng) - 1 };
  }
}

const randChoiceWeighted = <T>(rng: Random, arr: T[], weights: number[]) => {
  let i;
  for (i = 1; i < weights.length; i++) {
    weights[i] += weights[i - 1];
  }

  const random = rng.float() * weights.at(-1)!;
  for (i = 0; i < weights.length; i++) {
    if (weights[i] > random) {
      break;
    }
  }

  return arr[i];
};
