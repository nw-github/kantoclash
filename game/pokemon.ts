import { moveList, type MoveId } from "./moveList";
import { speciesList, type SpeciesId } from "./species";
import type { StageStats, Stats } from "./utils";

export type Status = "psn" | "par" | "slp" | "frz" | "tox" | "brn";

export class Pokemon {
  readonly stats: Stats;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly name: string;
  readonly moves: MoveId[];
  pp: number[];
  hp: number;
  status?: Status;
  sleepTurns: number = 0;

  constructor(
    speciesId: SpeciesId,
    dvs: Partial<StageStats>,
    statexp: Partial<Stats>,
    level: number,
    moves: MoveId[],
    name?: string,
  ) {
    dvs.atk ??= 15;
    dvs.def ??= 15;
    dvs.spc ??= 15;
    dvs.spe ??= 15;
    const calcStatBase = (stat: keyof Stats) => {
      return calcStat(
        stat === "hp",
        this.species.stats[stat],
        level,
        stat === "hp" ? getHpDv(dvs) : dvs[stat],
        statexp[stat],
      );
    };

    this.speciesId = speciesId;
    this.name = name || this.species.name;
    this.moves = moves;
    this.pp = moves.map(move => moveList[move].pp);
    this.level = level;
    // https://bulbapedia.bulbagarden.net/wiki/Individual_values#Usage
    this.stats = {
      hp: calcStatBase("hp"),
      atk: calcStatBase("atk"),
      def: calcStatBase("def"),
      spc: calcStatBase("spc"),
      spe: calcStatBase("spe"),
    };
    this.hp = this.stats.hp;
  }

  get species() {
    return speciesList[this.speciesId];
  }

  static fromDescriptor({ species, dvs, statexp, level, moves, name }: Gen1PokemonDesc) {
    return new Pokemon(species, dvs, statexp, level, moves, name);
  }
}

export const calcStat = (
  hp: boolean,
  base: number,
  level: number,
  dv?: number,
  statexp?: number,
) => {
  const s = Math.min(Math.ceil(Math.sqrt(statexp ?? 65535)), 255);
  return Math.floor((((base + (dv ?? 15)) * 2 + s / 4) * level) / 100) + (hp ? level + 10 : 5);
};

export const getHpDv = (dvs: Partial<StageStats>) => {
  return (
    (((dvs.atk ?? 15) & 1) << 3) |
    (((dvs.def ?? 15) & 1) << 2) |
    (((dvs.spc ?? 15) & 1) << 1) |
    ((dvs.spe ?? 15) & 1)
  );
};
