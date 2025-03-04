import type { MoveId } from "./moveList";
import type { Pokemon } from "./pokemon";
import type { Stats } from "./utils";

export class TransformedPokemon {
  readonly stats: Stats;
  readonly moves: MoveId[];
  readonly pp: number[];

  constructor(readonly base: Pokemon, readonly transformed: Pokemon) {
    this.moves = [...transformed.moves];
    this.pp = transformed.pp.map(_ => 5);
    this.stats = { ...this.transformed.stats, hp: base.stats.hp };
  }

  get speciesId() {
    return this.transformed.speciesId;
  }

  get level() {
    return this.base.level;
  }

  get name() {
    return this.base.name;
  }

  get hp() {
    return this.base.hp;
  }

  set hp(value) {
    this.base.hp = value;
  }

  get status() {
    return this.base.status;
  }

  set status(value) {
    this.base.status = value;
  }

  get sleepTurns() {
    return this.base.sleepTurns;
  }

  set sleepTurns(value) {
    this.base.sleepTurns = value;
  }

  get species() {
    return this.base.species;
  }
}
