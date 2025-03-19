import { getMaxPP, moveList, type MoveId } from "./moves";
import type { Pokemon } from "./pokemon";
import type { Stats } from "./utils";

export class TransformedPokemon {
  readonly stats: Stats;
  readonly moves: MoveId[];
  readonly pp: number[];

  constructor(readonly base: Pokemon, readonly transformed: Pokemon) {
    this.moves = [...transformed.moves];
    this.pp = transformed.moves.map(move => Math.min(getMaxPP(moveList[move]), 5));
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

  get shiny() {
    return this.transformed.shiny;
  }

  get gender() {
    return this.base.gender;
  }

  get dvs() {
    return this.base.dvs;
  }

  get friendship() {
    return this.base.friendship;
  }
}
