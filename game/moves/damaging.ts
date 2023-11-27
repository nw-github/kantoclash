import type { ActivePokemon, Battle } from "../battle";
import { Move } from "./move";
import type { Status } from "../pokemon";
import {
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
    | "multi_turn"
    | "rage"
    | "trap"
    | "level"
    | "ohko";

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
            user.thrashing = { move: this, turns: randRangeInclusive(2, 3) };
        } else if (user.thrashing && user.thrashing.turns !== -1) {
            --user.thrashing.turns;
            if (user.thrashing.turns <= 0) {
                user.thrashing = undefined;
                user.inflictConfusion(battle, true);
            }
        }

        const { dmg, isCrit, eff } = this.getDamage(user, target);
        if (dmg === 0) {
            battle.pushEvent({
                type: "info",
                id: user.owner.id,
                why: eff === 0 ? "immune" : "miss",
            });
            if (this.flag === "crash" && eff === 0) {
                return false;
            }

            return this.onMiss(battle, user, target);
        }

        if (!this.checkAccuracy(battle, user, target)) {
            return this.onMiss(battle, user, target);
        }

        if (this.flag === "rage") {
            user.thrashing = { move: this, turns: -1 };
        }

        const hadSub = target.substitute !== 0;
        let { dealt, brokeSub, dead, event } = target.inflictDamage(
            dmg,
            user,
            battle,
            isCrit,
            this.flag === "ohko" ? "ohko" : "attacked",
            false,
            eff
        );

        if (this.flag === "multi" || this.flag === "double") {
            event.hitCount = 1;
        }

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
                user.inflictRecovery(Math.max(Math.floor(dealt / 2), 1), target, battle, "drain");
            } else if (this.flag === "explosion") {
                dead =
                    user.inflictDamage(user.base.hp, user, battle, false, "explosion", true).dead ||
                    dead;
            } else if (this.flag === "double") {
                if (!dead) {
                    event.hitCount = 0;
                    ({ dead, event } = target.inflictDamage(
                        dmg,
                        user,
                        battle,
                        isCrit,
                        "attacked",
                        false,
                        eff
                    ));
                    event.hitCount = 2;
                }
            } else if (this.flag === "multi") {
                let count = DamagingMove.multiHitCount();
                for (let hits = 1; !dead && !brokeSub && count-- > 0; hits++) {
                    event.hitCount = 0;
                    ({ dead, brokeSub, event } = target.inflictDamage(
                        dmg,
                        user,
                        battle,
                        isCrit,
                        "attacked",
                        false,
                        eff
                    ));
                    event.hitCount = hits;
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
                target.base.status = undefined;
                target.hazed = true;
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
                target.flinch = true;
            } else {
                if (target.base.status || target.types.includes(this.type)) {
                    return dead;
                }

                target.inflictStatus(effect, battle);
            }
        }

        return dead;
    }

    private onMiss(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
        if (this.flag === "crash") {
            // https://www.smogon.com/dex/rb/moves/high-jump-kick/
            if (user.substitute && target.substitute) {
                target.inflictDamage(1, user, battle, false, "attacked");
            } else if (!user.substitute) {
                return user.inflictDamage(1, user, battle, false, "crash", true).dead;
            }
        } else if (this.flag === "explosion") {
            // according to showdown, explosion also boosts rage even on miss/failure
            target.handleRage(battle);
            return user.inflictDamage(user.base.hp, user, battle, false, "explosion", true).dead;
        }
        return false;
    }

    private getDamage(user: ActivePokemon, target: ActivePokemon) {
        // https://bulbapedia.bulbagarden.net/wiki/Damage#Generation_I
        const eff = getEffectiveness(this.type, target.types);
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
        } else if (this.dmg) {
            return { dmg: this.dmg, isCrit: false, eff: 1 };
        }

        const baseSpe = user.base.species.stats.spe;
        let chance: number;
        if (this.flag === "high_crit") {
            chance = user.flags.focus ? 4 * Math.floor(baseSpe / 4) : 8 * Math.floor(baseSpe / 2);
        } else {
            chance = Math.floor(user.flags.focus ? baseSpe / 8 : baseSpe / 2);
        }

        const isCrit = randChance255(chance);
        const [atks, defs] = isSpecial(this.type)
            ? (["spc", "spc"] as const)
            : (["atk", "def"] as const);
        const ls = atks === "spc" && target.flags.light_screen;
        const reflect = atks === "atk" && target.flags.reflect;
        const explosion = this.flag === "explosion" ? 2 : 1;
        const dmg = calcDamage({
            lvl: user.base.level,
            pow: this.power!,
            crit: isCrit ? 2 : 1,
            atk: user.getStat(atks, isCrit),
            def: Math.floor(target.getStat(defs, isCrit, true, ls || reflect) / explosion),
            stab: user.types.includes(this.type) ? 1.5 : 1,
            eff,
        });
        if (dmg === 0) {
            return { dmg: 0, isCrit: false, eff };
        }

        const rand = dmg === 1 ? 255 : randRangeInclusive(217, 255);
        return { dmg: Math.floor((dmg * rand) / 255), isCrit, eff };
    }

    private static multiHitCount() {
        let count = randChance255(96) ? 1 : null;
        count ??= randChance255(96) ? 2 : null;
        count ??= randChance255(32) ? 3 : null;
        count ??= 4;
        return count;
    }
}
