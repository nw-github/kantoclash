import type { ActivePokemon, Battle } from "../battle";
import type { FailReason } from "../events";
import { Move } from "./move";
import type { Type } from "../utils";

export class AlwaysFailMove extends Move {
  readonly why: FailReason;

  constructor({
    name,
    pp,
    type,
    why,
    acc,
  }: {
    name: string;
    pp: number;
    type: Type;
    why: FailReason;
    acc?: number;
  }) {
    super(name, pp, type, acc);
    this.why = why;
  }

  override execute(battle: Battle, user: ActivePokemon) {
    battle.info(user, this.why);
    return false;
  }
}
