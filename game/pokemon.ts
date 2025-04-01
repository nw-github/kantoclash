import type {Generation} from "./gen";
import type {AbilityId, SpeciesId} from "./species";
import type {MoveId} from "./moves";
import type {StageStats, Stats} from "./utils";
import type {ItemId} from "./item";

export type Status = "psn" | "par" | "slp" | "frz" | "tox" | "brn";
export type Gender = "M" | "F" | "N";

export type PokemonDesc<
  Species extends string = string,
  Move extends string = string,
  Item extends string = string,
  Ability extends string = string,
> = {
  evs?: Partial<Stats>;
  ivs?: Partial<Stats>;
  level?: number;
  name?: string;
  species: Species;
  moves: Move[];
  friendship?: number;
  item?: Item;
  shiny?: bool;
  gender?: Gender;
  nature?: Nature;
  ability?: Ability;
};

export type ValidatedPokemonDesc = PokemonDesc<SpeciesId, MoveId, ItemId, AbilityId>;

export enum Nature {
  hardy,
  lonely,
  brave,
  adamant,
  naughty,
  bold,
  docile,
  relaxed,
  impish,
  lax,
  timid,
  hasty,
  serious,
  jolly,
  naive,
  modest,
  mild,
  quiet,
  bashful,
  rash,
  calm,
  gentle,
  sassy,
  careful,
  quirky,
}

export const natureTable: Record<Nature, Partial<Record<keyof StageStats, number>>> = {
  [Nature.lonely]: {atk: 1.1, def: 0.9},
  [Nature.brave]: {atk: 1.1, spe: 0.9},
  [Nature.adamant]: {atk: 1.1, spa: 0.9},
  [Nature.naughty]: {atk: 1.1, spd: 0.9},

  [Nature.bold]: {def: 1.1, atk: 0.9},
  [Nature.relaxed]: {def: 1.1, spe: 0.9},
  [Nature.impish]: {def: 1.1, spa: 0.9},
  [Nature.lax]: {def: 1.1, spd: 0.9},

  [Nature.modest]: {spa: 1.1, atk: 0.9},
  [Nature.mild]: {spa: 1.1, def: 0.9},
  [Nature.quiet]: {spa: 1.1, spd: 0.9},
  [Nature.rash]: {spa: 1.1, spe: 0.9},

  [Nature.calm]: {spd: 1.1, atk: 0.9},
  [Nature.gentle]: {spd: 1.1, def: 0.9},
  [Nature.sassy]: {spd: 1.1, spa: 0.9},
  [Nature.careful]: {spd: 1.1, spe: 0.9},

  [Nature.timid]: {spe: 1.1, atk: 0.9},
  [Nature.hasty]: {spe: 1.1, def: 0.9},
  [Nature.jolly]: {spe: 1.1, spa: 0.9},
  [Nature.naive]: {spe: 1.1, spd: 0.9},

  [Nature.hardy]: {},
  [Nature.docile]: {},
  [Nature.serious]: {},
  [Nature.bashful]: {},
  [Nature.quirky]: {},
};

export class Pokemon {
  readonly stats: Stats;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly name: string;
  readonly moves: MoveId[];
  item?: ItemId;
  pp: number[];
  hp: number;
  status?: Status;
  sleepTurns: number = 0;
  friendship: number;
  ivs: Stats;
  shiny: boolean;
  gender: Gender;

  constructor(
    readonly gen: Generation,
    {
      species,
      ivs,
      evs,
      level,
      moves,
      name,
      friendship,
      item,
      shiny,
      gender,
      nature,
    }: ValidatedPokemonDesc,
  ) {
    this.ivs = {
      hp: gen.getHpIv(ivs),
      atk: ivs?.atk ?? gen.maxIv,
      def: ivs?.def ?? gen.maxIv,
      spa: ivs?.spa ?? gen.maxIv,
      spd: ivs?.spd ?? gen.maxIv,
      spe: ivs?.spe ?? gen.maxIv,
    };
    this.speciesId = species;
    this.name = name || this.species.name;
    this.moves = moves;
    this.pp = moves.map(move => gen.getMaxPP(gen.moveList[move]));
    this.level = level ?? 100;
    this.item = item;
    this.stats = {
      hp: gen.calcStat("hp", this.species.stats, this.level, this.ivs, evs, nature),
      atk: gen.calcStat("atk", this.species.stats, this.level, this.ivs, evs, nature),
      def: gen.calcStat("def", this.species.stats, this.level, this.ivs, evs, nature),
      spa: gen.calcStat("spa", this.species.stats, this.level, this.ivs, evs, nature),
      spd: gen.calcStat("spd", this.species.stats, this.level, this.ivs, evs, nature),
      spe: gen.calcStat("spe", this.species.stats, this.level, this.ivs, evs, nature),
    };
    this.hp = this.stats.hp;
    this.friendship = friendship ?? 255;
    this.shiny = gen.getShiny(shiny ?? false, this.ivs);
    this.gender =
      gen.getGender(gender, this.species, this.ivs.atk) ??
      (Math.random() * 100 < this.species.genderRatio! ? "M" : "F");

    // const c2 = (iv?: number) => ((iv ?? 15) >> 1) & 0b11;
    // const unownLetter = idiv(
    //   gen1StatKeys.filter(v => v !== "hp").reduce((acc, v) => acc + c2(dvs[v]), 0), 10,
    // );
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
