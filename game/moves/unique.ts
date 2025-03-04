import type { ActivePokemon, Battle } from "../battle";
import type { Type } from "../utils";
import { Move } from "./move";

export class UniqueMove extends Move {
  executeFn: (
    this: UniqueMove,
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    indexInMoves?: number
  ) => boolean;

  constructor({
    name,
    pp,
    type,
    acc,
    priority,
    power,
    execute,
  }: {
    name: string;
    pp: number;
    type: Type;
    acc?: number;
    priority?: number;
    power?: number;
    execute: UniqueMove["executeFn"];
  }) {
    super(name, pp, type, acc, priority, power);
    this.executeFn = execute;
  }

  override execute(
    battle: Battle,
    user: ActivePokemon,
    target: ActivePokemon,
    indexInMoves?: number
  ) {
    return this.executeFn.call(this, battle, user, target, indexInMoves);
  }
}
