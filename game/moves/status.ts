import type { ActivePokemon, Battle } from "../battle";
import { Move } from "./move";
import type { Status } from "../pokemon";
import { getEffectiveness, type Type } from "../utils";

export class StatusMove extends Move {
  readonly status: Status;

  constructor({
    name,
    pp,
    type,
    acc,
    status,
  }: {
    name: string;
    pp: number;
    type: Type;
    status: Status;
    acc?: number;
  }) {
    super(name, pp, type, acc);
    this.status = status;
  }

  override execute(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
    if (target.v.substitute && this.status !== "par" && this.status !== "slp") {
      battle.info(target, "fail_generic");
      return false;
    } else if (
      (this.type === "electric" && getEffectiveness(this.type, target.v.types) === 0) ||
      (this.type === "poison" && target.v.types.includes("poison"))
    ) {
      battle.info(target, "immune");
      return false;
    } else if (this.status === "slp" && target.v.recharge) {
      // https://www.youtube.com/watch?v=x2AgAdQwyGI
      target.status(this.status, battle, true);
      return false;
    } else if (!this.checkAccuracy(battle, user, target)) {
      return false;
    }

    if (!target.status(this.status, battle)) {
      battle.info(target, "fail_generic");
    }
    return false;
  }
}
