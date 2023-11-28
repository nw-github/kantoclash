import type { ActivePokemon, Battle } from "../battle";
import { floatTo255, randChance255, scaleAccuracy255, type Type } from "../utils";

export abstract class Move {
    readonly pp: number;

    constructor(
        readonly name: string,
        pp: number,
        readonly type: Type,
        readonly acc?: number,
        readonly priority?: number,
        readonly power?: number
    ) {
        this.pp = Math.min(Math.floor((pp * 8) / 5), 61);
    }

    checkAccuracy(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
        if (!this.acc) {
            return true;
        }

        const chance = scaleAccuracy255(
            user.v.thrashing?.acc ?? floatTo255(this.acc),
            user,
            target
        );
        // https://www.smogon.com/dex/rb/moves/petal-dance/
        // https://www.youtube.com/watch?v=NC5gbJeExbs
        if (user.v.thrashing) {
            user.v.thrashing.acc = chance;
        }

        console.log(`Accuracy: ${this.acc} (${chance}/256)`);
        if (target.v.invuln || !randChance255(chance)) {
            battle.pushEvent({
                type: "info",
                id: user.owner.id,
                why: "miss",
            });
            return false;
        }
        return true;
    }

    use(battle: Battle, user: ActivePokemon, target: ActivePokemon, moveIndex?: number) {
        const move = battle.moveIdOf(this)!;
        if (move === user.base.moves[user.v.disabled?.indexInMoves ?? -1]) {
            battle.pushEvent({
                move,
                type: "move",
                src: user.owner.id,
                disabled: true,
            });
            user.v.charging = undefined;
            return false;
        }

        if (moveIndex !== undefined && !user.v.thrashing) {
            user.base.pp[moveIndex]--;
            if (user.base.pp[moveIndex] < 0) {
                user.base.pp[moveIndex] = 63;
            }
            user.v.lastMoveIndex = moveIndex;
        }

        battle.pushEvent({
            move,
            type: "move",
            src: user.owner.id,
            thrashing: user.v.thrashing ? true : undefined,
        });
        user.v.lastMove = this;
        return this.execute(battle, user, target);
    }

    protected abstract execute(battle: Battle, user: ActivePokemon, target: ActivePokemon): boolean;
}
