import type { ActivePokemon, Battle } from "../battle";
import { Move } from "./move";
import type { Status } from "../pokemon";
import {
    checkAccuracy,
    floatTo255,
    getEffectiveness,
    randChance255,
    randRangeInclusive,
    type Type,
    isSpecial,
    calcDamage,
    type Stages,
} from "../utils";

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
    | "multi_turn";

export class DamagingMove extends Move {
    readonly flag?: Flag;
    readonly effect?: [number, Effect];
    readonly recoil?: number;

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
    }) {
        super(name, pp, type, acc, priority, power);
        this.flag = flag;
        this.effect = effect;
        this.recoil = recoil;
    }

    override use(battle: Battle, user: ActivePokemon, target: ActivePokemon, moveIndex?: number) {
        if ((this.flag === "charge" || this.flag === "charge_invuln") && user.charging !== this) {
            battle.pushEvent({
                type: "charge",
                id: user.owner.id,
                move: battle.moveIdOf(this)!,
            });
            user.charging = this;
            if (this.flag === "charge_invuln") {
                user.invuln = true;
            }

            return false;
        }

        user.charging = undefined;
        if (this.flag === "charge_invuln") {
            user.invuln = false;
        }
        return super.use(battle, user, target, moveIndex);
    }

    override execute(battle: Battle, user: ActivePokemon, target: ActivePokemon): boolean {
        if (this.flag === "multi_turn" && !user.thrashing) {
            user.thrashing = {
                move: this,
                turns: randRangeInclusive(2, 3),
            };
        } else if (user.thrashing) {
            --user.thrashing.turns;
            if (user.thrashing.turns <= 0) {
                user.thrashing = undefined;
                user.inflictConfusion(battle, true);
            }
        }
        // https://bulbapedia.bulbagarden.net/wiki/Damage#Generation_I
        const eff = getEffectiveness(this.type, target.types);
        if (eff === 0) {
            battle.pushEvent({
                type: "failed",
                src: target.owner.id,
                why: "immune",
            });
            return this.damageOnMiss(battle, user, target);
        }

        if (this.flag === "dream_eater" && target.base.status !== "slp") {
            battle.pushEvent({
                type: "failed",
                src: target.owner.id,
                why: "generic",
            });
            return false;
        }

        if (this.acc && !checkAccuracy(this.acc, battle, user, target)) {
            return this.damageOnMiss(battle, user, target);
        }

        const isCrit = randChance255(this.critChance(user));
        const [atks, defs]: ["spc" | "atk", "spc" | "def"] = isSpecial(this.type)
            ? ["spc", "spc"]
            : ["atk", "def"];
        const atk = user.getStat(atks, isCrit);
        const ls = atks === "spc" && target.flags.light_screen;
        const reflect = atks === "atk" && target.flags.reflect;
        const explosion = this.flag === "explosion" ? 2 : 1;
        const def = Math.floor(target.getStat(defs, isCrit, true, ls || reflect) / explosion);
        const stab = user.types.includes(this.type) ? 1.5 : 1;
        let dmg = calcDamage({
            lvl: user.base.level,
            pow: this.power!,
            crit: isCrit ? 2 : 1,
            atk,
            def,
            stab,
            eff,
        });
        if (dmg === 0) {
            battle.pushEvent({
                type: "failed",
                src: user.owner.id,
                why: "miss",
            });
            return false;
        }

        const rand = dmg === 1 ? 255 : randRangeInclusive(217, 255);
        dmg = Math.floor(dmg * (rand / 255));
        const hadSub = target.substitute !== 0;
        let { dealt, brokeSub, dead } = target.inflictDamage(
            dmg,
            user,
            battle,
            isCrit,
            "attacked",
            false,
            eff
        );

        console.log(
            `${this.name} (Pow ${this.power})`,
            `(${atks} ${atk})`,
            `(${defs} ${def})`,
            `(Stab ${stab})`,
            `(Rand ${rand})`,
            `(Eff ${eff})`,
            `(Crit? ${isCrit})`,
            ` = ${dmg}`
        );
        if (!brokeSub) {
            if (this.recoil) {
                dead =
                    user.inflictDamage(
                        Math.max(Math.floor(dealt / this.recoil), 1),
                        user,
                        battle,
                        false,
                        "recoil",
                        true
                    ).dead || dead;
            }

            if (this.flag === "drain" || this.flag === "dream_eater") {
                user.inflictDamage(
                    -Math.max(Math.floor(dealt / 2), 1),
                    target,
                    battle,
                    false,
                    "drain",
                    true
                );
            } else if (this.flag === "explosion") {
                dead =
                    user.inflictDamage(user.base.hp, user, battle, false, "explosion", true).dead ||
                    dead;
            } else if (this.flag === "double") {
                dead =
                    dead ||
                    target.inflictDamage(dmg, user, battle, isCrit, "attacked", false, eff).dead;
            } else if (this.flag === "multi") {
                let count = randChance255(96) ? 1 : null;
                count ??= randChance255(96) ? 2 : null;
                count ??= randChance255(32) ? 3 : null;
                count ??= 4;

                while (!dead && !brokeSub && count-- > 0) {
                    ({ dead, brokeSub } = target.inflictDamage(
                        dmg,
                        user,
                        battle,
                        isCrit,
                        "attacked",
                        false,
                        eff
                    ));
                }
            } else if (this.flag === "payday") {
                battle.pushEvent({
                    type: "info",
                    id: user.owner.id,
                    why: "payday",
                });
            }
        }

        if (dead || brokeSub) {
            return dead;
        }

        if (this.flag === "recharge") {
            user.recharge = this;
        }

        if (this.effect) {
            const [chance, effect] = this.effect;
            if (effect === "brn" && target.base.status === "frz") {
                target.base.status = null;
                battle.pushEvent({
                    type: "info",
                    id: target.owner.id,
                    why: "thaw",
                });
                // TODO: can you thaw and then burn?
                return dead;
            }

            if (!randChance255(floatTo255(chance))) {
                return dead;
            }

            if (effect === "confusion") {
                if (target.confusion === 0) {
                    target.inflictConfusion(battle);
                }
                return dead;
            } else if (hadSub) {
                return dead;
            } else if (Array.isArray(effect)) {
                target.inflictStages(user.owner, effect, battle);
            } else if (effect === "flinch") {
                target.flinch = battle.turn;
            } else {
                if (target.base.status || target.types.includes(this.type)) {
                    return dead;
                }

                target.inflictStatus(effect, battle);
            }
        }

        return dead;
    }

    private critChance(user: ActivePokemon) {
        const baseSpeed = user.base.species.stats.spe;
        if (this.flag === "high_crit") {
            return user.flags.focus ? 4 * (baseSpeed / 4) : 8 * (baseSpeed / 2);
        } else {
            return user.flags.focus ? baseSpeed / 8 : baseSpeed / 2;
        }
    }

    private damageOnMiss(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
        if (this.flag === "crash") {
            // https://www.smogon.com/dex/rb/moves/high-jump-kick/
            if (user.substitute && target.substitute) {
                target.inflictDamage(1, user, battle, false, "attacked");
            } else if (!user.substitute) {
                return user.inflictDamage(1, user, battle, false, "crash", true).dead;
            }
        } else if (this.flag === "explosion") {
            return user.inflictDamage(user.base.hp, user, battle, false, "explosion", true).dead;
        }
        return false;
    }
}

export class FixedDamageMove extends Move {
    readonly dmg: number | "level";

    constructor({
        name,
        pp,
        dmg,
        type,
        acc,
    }: {
        name: string;
        pp: number;
        type: Type;
        dmg: number | "level";
        acc?: number;
    }) {
        super(name, pp, type, acc, 0, 1);
        this.dmg = dmg;
    }

    override execute(battle: Battle, user: ActivePokemon, target: ActivePokemon): boolean {
        // Fixed damage moves are not affected by type immunity in Gen 1
        if (this.acc && !checkAccuracy(this.acc, battle, user, target)) {
            return false;
        }

        const dmg = this.dmg === "level" ? user.base.level : this.dmg;
        return target.inflictDamage(dmg, user, battle, false, "attacked").dead;
    }
}

export class OHKOMove extends Move {
    constructor({ name, pp, type, acc }: { name: string; pp: number; type: Type; acc?: number }) {
        super(name, pp, type, acc ?? 30, 0, 1);
    }

    override execute(battle: Battle, user: ActivePokemon, target: ActivePokemon): boolean {
        if (getEffectiveness(this.type, target.base.species.types) === 0) {
            battle.pushEvent({
                type: "failed",
                src: target.owner.id,
                why: "immune",
            });
            return false;
        }

        if (target.getStat("spe") > user.getStat("spe")) {
            battle.pushEvent({
                type: "failed",
                src: target.owner.id,
                why: "generic",
            });
            return false;
        }

        if (!checkAccuracy(this.acc!, battle, user, target)) {
            return false;
        }

        return target.inflictDamage(65535, user, battle, false, "ohko", false, 1).dead;
    }
}
