import { getMaxPP, moveList, type MoveId } from "./moves";
import { speciesList, type SpeciesId } from "./species";
import { idiv, type StageStats, type Stats, type Type } from "./utils";

export type Status = "psn" | "par" | "slp" | "frz" | "tox" | "brn";
export type Gender = Pokemon["gender"];

export class Pokemon {
  readonly stats: Stats;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly name: string;
  readonly moves: MoveId[];
  readonly gender?: "male" | "female";
  pp: number[];
  hp: number;
  status?: Status;
  sleepTurns: number = 0;
  shiny: boolean;
  friendship: number;
  dvs: Stats;

  constructor(
    speciesId: SpeciesId,
    dvs: Partial<StageStats>,
    statexp: Partial<Stats>,
    level: number,
    moves: MoveId[],
    name?: string,
    friendship?: number,
  ) {
    const calcStatBase = (stat: keyof Stats) => {
      // Gen 2 uses the Spc IV for SpA and SpD
      return calcStat(
        stat === "hp",
        this.species.stats[stat],
        level,
        this.dvs[stat === "spd" ? "spa" : stat],
        statexp[stat],
      );
    };

    this.dvs = {
      hp: getHpDv(dvs),
      atk: dvs.atk ?? 15,
      def: dvs.def ?? 15,
      spa: dvs.spa ?? 15,
      spd: dvs.spd ?? 15,
      spe: dvs.spe ?? 15,
    };
    this.speciesId = speciesId;
    this.name = name || this.species.name;
    this.moves = moves;
    this.pp = moves.map(move => getMaxPP(moveList[move]));
    this.level = level;
    // https://bulbapedia.bulbagarden.net/wiki/Individual_values#Usage
    this.stats = {
      hp: calcStatBase("hp"),
      atk: calcStatBase("atk"),
      def: calcStatBase("def"),
      spa: calcStatBase("spa"),
      spd: calcStatBase("spd"),
      spe: calcStatBase("spe"),
    };
    this.hp = this.stats.hp;
    if (this.species.genderRatio) {
      this.gender =
        this.dvs.atk < 15 - Math.floor(this.species.genderRatio * 15) ? "female" : "male";
    } else if (this.species.genderRatio === 0) {
      this.gender = "female";
    }
    this.shiny =
      dvs.def === 10 &&
      dvs.spe === 10 &&
      dvs.spa === 10 &&
      [2, 3, 6, 7, 10, 11, 14, 15].includes(dvs.atk);
    this.friendship = friendship ?? 255;

    // const c2 = (iv?: number) => ((iv ?? 15) >> 1) & 0b11;
    // const unownLetter = idiv(
    //   gen1StatKeys.filter(v => v !== "hp").reduce((acc, v) => acc + c2(dvs[v]), 0), 10,
    // );
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
    (((dvs.spa ?? 15) & 1) << 1) |
    ((dvs.spe ?? 15) & 1)
  );
};

export const getHiddenPower = (dvs: Partial<StageStats>) => {
  const hpTypes: Type[] = [
    "fight",
    "flying",
    "poison",
    "ground",
    "rock",
    "bug",
    "ghost",
    "steel",
    "fire",
    "water",
    "grass",
    "electric",
    "psychic",
    "ice",
    "dragon",
    "dark",
  ];

  const msb = (dv?: number) => +(((dv ?? 15) & (1 << 3)) !== 0);

  const x = msb(dvs.spa) | (msb(dvs.spe) << 1) | (msb(dvs.def) << 2) | (msb(dvs.atk) << 3);
  const y = (dvs.spa ?? 15) & 0b11;
  return [
    hpTypes[(((dvs.atk ?? 15) & 0b11) << 2) | ((dvs.def ?? 15) & 0b11)],
    idiv(5 * x + y, 2) + 31,
  ] as const;
};
