import type { ActivePokemon, Battle } from "../battle";
import { Move } from "./move";
import type { Stages, Type } from "../utils";

export class StageMove extends Move {
  readonly stages: [Stages, number][];

  constructor({
    name,
    pp,
    type,
    acc,
    stages,
  }: {
    name: string;
    pp: number;
    type: Type;
    stages: StageMove["stages"];
    acc?: number;
  }) {
    super(name, pp, type, acc);
    this.stages = stages;
  }

  override execute(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
    target.lastDamage = 0;
    if (this.acc) {
      if (target.v.flags.mist || target.v.substitute) {
        battle.info(target, target.v.flags.mist ? "mist_protect" : "fail_generic");
        return false;
      }

      if (!this.checkAccuracy(battle, user, target)) {
        return false;
      }
    } else {
      target = user;
    }

    if (!target.modStages(user.owner, this.stages, battle)) {
      battle.info(target, "fail_generic");
    }
    return false;
  }
}
