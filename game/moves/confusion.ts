import type { ActivePokemon, Battle } from "../battle";
import { Move } from "./move";
import type { Type } from "../utils";

export class ConfusionMove extends Move {
  constructor({ name, pp, type, acc }: { name: string; pp: number; type: Type; acc?: number }) {
    super(name, pp, type, acc);
  }

  override execute(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
    if (target.v.substitute) {
      battle.info(target, "fail_generic");
      return false;
    } else if (!this.checkAccuracy(battle, user, target)) {
      return false;
    }

    if (!target.confuse(battle)) {
      battle.info(target, "fail_generic");
    }
    return false;
  }
}
