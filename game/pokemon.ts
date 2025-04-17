import type {Generation} from "./gen";
import type {AbilityId, SpeciesId} from "./species";
import type {MoveId} from "./moves";
import type {StageStats, Stats, StatStageId} from "./utils";
import type {ItemId} from "./item";

export type Status = "psn" | "par" | "slp" | "frz" | "tox" | "brn";
export type Gender = "M" | "F" | "N";

export type PokemonDesc<
  Species extends string = string,
  Move extends string = string,
  Item extends string = string,
  Ability extends string = string,
  Form extends string = string,
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
  form?: Form;
};

// prettier-ignore
export const UNOWN_FORM = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
  "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  "exclamation", "question",
] as const;

export const CASTFORM_FORM = ["rainy", "snowy", "sunny"] as const;

export type UnownForm = (typeof UNOWN_FORM)[number];
export type CastformForm = (typeof CASTFORM_FORM)[number];
export type FormId = UnownForm | CastformForm;

export type ValidatedPokemonDesc = PokemonDesc<SpeciesId, MoveId, ItemId, AbilityId, FormId>;

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
  _item?: ItemId;
  itemUnusable = false;
  pp: number[];
  hp: number;
  status?: Status;
  sleepTurns: number = 0;
  friendship: number;
  ivs: Stats;
  shiny: bool;
  gender: Gender;
  ability?: AbilityId;
  nature?: Nature;
  form?: FormId;

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
      ability,
      form,
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
    this.ability = ability;
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
    this.nature = nature;
    this.gender =
      gen.getGender(gender, this.species, this.ivs.atk) ??
      (Math.random() * 100 < this.species.genderRatio! ? "M" : "F");
    this.form = gen.getForm(form, this.speciesId, this.ivs);
  }

  belowHp(amt: number) {
    return this.hp <= Math.floor(this.stats.hp / amt);
  }

  get item() {
    return this.itemUnusable ? undefined : this._item;
  }

  set item(value) {
    this._item = value;
    this.itemUnusable = false;
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
  let form = transformed.form;

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
      case "form":
        return form;
      default:
        return target[prop];
      }
    },
    set(target, prop: keyof Pokemon, val) {
      if (prop === "form") {
        form = val;
      } else {
        (target as any)[prop] = val;
      }
      return true;
    },
  });
};

export const applyItemStatBoost = (poke: Pokemon, stat: StatStageId, value: number) => {
  if (poke.gen.items[poke.item!]?.halveSpeed && stat === "spe") {
    return Math.floor(value / 2);
  } else if (poke.gen.items[poke.item!]?.choice === stat) {
    return value + Math.floor(value / 2);
  }

  const boostItem = poke.gen.items[poke.item!]?.boostStats?.[poke.real.speciesId];
  if (boostItem && boostItem.stats.includes(stat) && (boostItem.transformed || !poke.transformed)) {
    value += Math.floor(value * boostItem.amount);
  }

  if (poke.transformed && poke.real.speciesId !== poke.speciesId) {
    const boostItem = poke.gen.items[poke.item!]?.boostStats?.[poke.speciesId];
    if (boostItem && boostItem.stats.includes(stat) && boostItem.transformed) {
      value += Math.floor(value * boostItem.amount);
    }
  }

  return value;
};
