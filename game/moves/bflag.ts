import type { ActivePokemon, Battle } from "../battle";
import { Move } from "./move";
import type { Type, VolatileFlag } from "../utils";

export class VolatileFlagMove extends Move {
  readonly flag: VolatileFlag;

  constructor({
    name,
    pp,
    type,
    flag,
    acc,
  }: {
    name: string;
    pp: number;
    type: Type;
    flag: VolatileFlag;
    acc?: number;
  }) {
    super(name, pp, type, acc);
    this.flag = flag;
  }

  override execute(battle: Battle, user: ActivePokemon) {
    if (user.v.flags[this.flag]) {
      battle.info(user, "fail_generic");
    } else {
      user.v.flags[this.flag] = true;
      battle.info(user, this.flag);
    }
    return false;
  }
}
