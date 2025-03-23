import type {Generation} from "./gen";
import type {Species, SpeciesId} from "./species";
import type {MoveId} from "./moves";
import type {StageStats, Stats} from "./utils";

export type Status = "psn" | "par" | "slp" | "frz" | "tox" | "brn";
export type Gender = "male" | "female" | undefined;

export type PokemonDesc<Species extends string = string, Move extends string = string> = {
  evs?: Partial<Stats>;
  ivs?: Partial<Stats>;
  level?: number;
  name?: string;
  species: Species;
  moves: Move[];
  friendship?: number;
};

export type ValidatedPokemonDesc = PokemonDesc<SpeciesId, MoveId>;

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
  friendship: number;
  dvs: Stats;

  constructor(
    readonly gen: Generation,
    {species, ivs, evs, level, moves, name, friendship}: ValidatedPokemonDesc,
  ) {
    this.dvs = {
      hp: getHpDv(ivs),
      atk: ivs?.atk ?? 15,
      def: ivs?.def ?? 15,
      spa: ivs?.spa ?? 15,
      spd: ivs?.spd ?? 15,
      spe: ivs?.spe ?? 15,
    };
    this.speciesId = species;
    this.name = name || this.species.name;
    this.moves = moves;
    this.pp = moves.map(move => gen.getMaxPP(gen.moveList[move]));
    this.level = level ?? 100;
    // https://bulbapedia.bulbagarden.net/wiki/Individual_values#Usage
    this.stats = {
      hp: calcStat("hp", this.species.stats, this.level, this.dvs, evs),
      atk: calcStat("atk", this.species.stats, this.level, this.dvs, evs),
      def: calcStat("def", this.species.stats, this.level, this.dvs, evs),
      spa: calcStat("spa", this.species.stats, this.level, this.dvs, evs),
      spd: calcStat("spd", this.species.stats, this.level, this.dvs, evs),
      spe: calcStat("spe", this.species.stats, this.level, this.dvs, evs),
    };
    this.hp = this.stats.hp;
    this.friendship = friendship ?? 255;

    // const c2 = (iv?: number) => ((iv ?? 15) >> 1) & 0b11;
    // const unownLetter = idiv(
    //   gen1StatKeys.filter(v => v !== "hp").reduce((acc, v) => acc + c2(dvs[v]), 0), 10,
    // );
  }

  get shiny() {
    if (this.gen.id === 1) {
      return undefined;
    }
    return getShiny(this.dvs);
  }

  get gender() {
    if (this.gen.id === 1) {
      return undefined;
    }
    return getGender(this.species, this.dvs.atk);
  }

  get species() {
    return this.gen.speciesList[this.speciesId];
  }

  get transformed() {
    return false;
  }

  get real() {
    return this;
  }
}

export const transform = (user: Pokemon, transformed: Pokemon) => {
  const moves = [...transformed.moves];
  const pp = transformed.moves.map(move => Math.min(user.gen.getMaxPP(user.gen.moveList[move]), 5));
  const stats = {...transformed.stats, hp: user.stats.hp};

  return new Proxy(user, {
    get(target, prop: keyof Pokemon) {
      // prettier-ignore
      switch (prop) {
      case "real": return user;
      case "transformed": return true;
      case "moves": return moves;
      case "pp": return pp;
      case "stats": return stats;
      case "speciesId":
      case "shiny":
        return transformed[prop];
      default:
        return target[prop];
      }
    },
    set(target, prop: keyof Pokemon, val) {
      (target as any)[prop] = val;
      return true;
    },
  });
};

export const calcStat = (
  stat: keyof Stats,
  bases: Stats,
  level: number,
  dvs?: Partial<Stats>,
  statexp?: Partial<Stats>,
) => {
  const base = bases[stat];
  // Gen 2 uses the Spc IV/EVs for SpA and SpD
  stat = stat === "spd" ? "spa" : stat;

  let dv = dvs?.[stat] ?? 15;
  if (stat === "hp") {
    dv = getHpDv(dvs);
  }
  const s = Math.min(Math.ceil(Math.sqrt(statexp?.[stat] ?? 65535)), 255);
  return Math.floor((((base + dv) * 2 + s / 4) * level) / 100) + (stat === "hp" ? level + 10 : 5);
};

export const getHpDv = (dvs?: Partial<StageStats>) => {
  return (
    (((dvs?.atk ?? 15) & 1) << 3) |
    (((dvs?.def ?? 15) & 1) << 2) |
    (((dvs?.spa ?? 15) & 1) << 1) |
    ((dvs?.spe ?? 15) & 1)
  );
};

export const getGender = (species: Species, atk: number) => {
  if (species.genderRatio) {
    return atk < 15 - Math.floor(species.genderRatio * 15) ? "female" : "male";
  } else if (species.genderRatio === 0) {
    return "female";
  }
};

export const getShiny = (dvs: Partial<Stats>) => {
  return (
    dvs.def === 10 &&
    dvs.spe === 10 &&
    dvs.spa === 10 &&
    [2, 3, 6, 7, 10, 11, 14, 15].includes(dvs.atk)
  );
};
