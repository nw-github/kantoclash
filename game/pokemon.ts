import type {Generation} from "./gen";
import type {AbilityId, SpeciesId} from "./species";
import type {MoveId} from "./moves";
import type {StageStats, Stats, StatStageId, Type} from "./utils";
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
  speciesId: Species;
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
export type CherrimForm = "sunshine" | "overcast";
export type ArceusForm = Exclude<Type, "???">;
export type FormId = UnownForm | CastformForm | CherrimForm | ArceusForm;

export type ValidatedPokemonDesc = PokemonDesc<SpeciesId, MoveId, ItemId, AbilityId, FormId> & {
  level: number;
};

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
  [Nature.rash]: {spa: 1.1, spd: 0.9},
  [Nature.quiet]: {spa: 1.1, spe: 0.9},

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

type RawPokemonInit = {
  gen: Generation;
  stats: Stats;
  speciesId: SpeciesId;
  level: number;
  name: string;
  moves: MoveId[];
  pp: number[];
  hp: number;
  status?: Status;
  friendship: number;
  ivs: Stats;
  shiny: bool;
  gender: Gender;
  ability?: AbilityId;
  nature?: Nature;
  form?: FormId;
  item?: ItemId;
};

export class Pokemon {
  readonly gen: Generation;
  readonly ivs: Stats;
  readonly stats: Stats;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly name: string;
  readonly moves: MoveId[];
  readonly pp: number[];
  readonly shiny: bool;
  readonly gender: Gender;
  readonly friendship: number;
  readonly nature?: Nature;
  _item?: ItemId;
  itemUnusable = false;
  hp: number;
  status?: Status;
  sleepTurns: number = 0;
  ability?: AbilityId;
  form?: FormId;

  constructor({
    gen,
    stats,
    speciesId,
    level,
    name,
    moves,
    pp,
    hp,
    status,
    friendship,
    ivs,
    shiny,
    gender,
    ability,
    nature,
    form,
    item,
  }: RawPokemonInit) {
    this.gen = gen;
    this.stats = stats;
    this.speciesId = speciesId;
    this.level = level;
    this.name = name;
    this.moves = moves;
    this.pp = pp;
    this.hp = hp;
    this.status = status;
    this.friendship = friendship;
    this.ivs = ivs;
    this.shiny = shiny;
    this.gender = gender;
    this.ability = ability;
    this.nature = nature;
    this.form = form;
    this.item = item;
  }

  static fromDescriptor(
    gen: Generation,
    {
      speciesId,
      ivs: rawIvs,
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
    const species = gen.speciesList[speciesId];
    const ivs = {
      hp: gen.getHpIv(rawIvs),
      atk: rawIvs?.atk ?? gen.maxIv,
      def: rawIvs?.def ?? gen.maxIv,
      spa: rawIvs?.spa ?? gen.maxIv,
      spd: rawIvs?.spd ?? gen.maxIv,
      spe: rawIvs?.spe ?? gen.maxIv,
    };
    const stats = {
      hp: gen.calcStat("hp", species.stats, level, ivs, evs, nature),
      atk: gen.calcStat("atk", species.stats, level, ivs, evs, nature),
      def: gen.calcStat("def", species.stats, level, ivs, evs, nature),
      spa: gen.calcStat("spa", species.stats, level, ivs, evs, nature),
      spd: gen.calcStat("spd", species.stats, level, ivs, evs, nature),
      spe: gen.calcStat("spe", species.stats, level, ivs, evs, nature),
    };

    return new Pokemon({
      gen,
      ivs,
      speciesId,
      level,
      item,
      ability,
      stats,
      nature,
      moves,
      pp: moves.map(move => gen.getMaxPP(gen.moveList[move])),
      name: name || species.name,
      hp: stats.hp,
      friendship: friendship ?? 255,
      shiny: gen.getShiny(shiny ?? false, ivs),
      gender:
        gen.getGender(gender, species, ivs.atk) ??
        (Math.random() * 100 < species.genderRatio! ? "M" : "F"),
      form: gen.getForm(form, speciesId, ivs, item),
    });
  }

  belowHp(amt: number) {
    return this.hp <= Math.floor(this.stats.hp / amt);
  }

  isMaxHp() {
    return this.stats.hp === this.hp;
  }

  get hpPercent() {
    return (this.hp / this.stats.hp) * 100;
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

  get real(): Pokemon {
    return this;
  }
}

// prettier-ignore
class TransformedPokemon extends Pokemon {
  constructor(readonly base: Pokemon, target: Pokemon) {
    super({
      stats: {...target.stats, hp: base.stats.hp},
      speciesId: target.speciesId,
      moves: [...target.moves],
      pp: target.moves.map(move => Math.min(base.gen.getMaxPP(base.gen.moveList[move]), 5)),
      shiny: target.shiny,
      form: target.form,

      gen: base.gen,
      level: base.level,
      name: base.name,
      hp: base.hp,
      status: base.status,
      friendship: base.friendship,
      ivs: base.ivs,
      gender: base.gender,
      ability: base.ability,
      nature: base.nature,
      item: base.item,
    });

    delete this._item;
    // @ts-expect-error operand of delete must be optional
    delete this.itemUnusable;
    // @ts-expect-error operand of delete must be optional
    delete this.hp;
    delete this.status;
    // @ts-expect-error operand of delete must be optional
    delete this.sleepTurns;
    delete this.ability;
    delete this.form;
  }

  // @ts-expect-error defined as property, overriden as getter
  override get _item() { return this.base._item; }
  // @ts-expect-error defined as property, overriden as getter
  override get itemUnusable() { return this.base.itemUnusable; }
  // @ts-expect-error defined as property, overriden as getter
  override get hp() { return this.base.hp; }
  // @ts-expect-error defined as property, overriden as getter
  override get status() { return this.base.status; }
  // @ts-expect-error defined as property, overriden as getter
  override get sleepTurns() { return this.base.sleepTurns; }
  // @ts-expect-error defined as property, overriden as getter
  override get ability() { return this.base.ability; }
  // @ts-expect-error defined as property, overriden as getter
  override get form() { return this.base.form; }

  override set _item(v) {  if (this.base) { this.base._item = v; } }
  override set itemUnusable(v) {  if (this.base) { this.base.itemUnusable = v; } }
  override set hp(v) {  if (this.base) { this.base.hp = v; } }
  override set status(v) {  if (this.base) { this.base.status = v; } }
  override set sleepTurns(v) {  if (this.base) { this.base.sleepTurns = v; } }
  override set ability(v) {  if (this.base) { this.base.ability = v; } }
  override set form(v) {  if (this.base) { this.base.form = v; } }

  override get transformed() { return true; }
  override get real() { return this.base; }
}

// export const transform = (user: Pokemon, transformed: Pokemon) => {
//   const moves = [...transformed.moves];
//   const pp = transformed.moves.map(move => Math.min(user.gen.getMaxPP(user.gen.moveList[move]), 5));
//   const stats = {...transformed.stats, hp: user.stats.hp};
//   const speciesId = transformed.speciesId;
//   const shiny = transformed.shiny;
//   let form = transformed.form;
//
//   return new Proxy(user, {
//     get(target, prop: keyof Pokemon) {
//       // prettier-ignore
//       switch (prop) {
//       case "real": return user;
//       case "transformed": return true;
//       case "moves": return moves;
//       case "pp": return pp;
//       case "stats": return stats;
//       case "speciesId": return speciesId;
//       case "shiny": return shiny;
//       case "form": return form;
//       case "species": return target.gen.speciesList[speciesId];
//       default: return target[prop];
//       }
//     },
//     set(target, prop: keyof Pokemon, val) {
//       if (prop === "form") {
//         form = val;
//       } else {
//         (target as any)[prop] = val;
//       }
//       return true;
//     },
//   });
// };

export const transform = (user: Pokemon, target: Pokemon) => {
  return new TransformedPokemon(user, target) as Pokemon;
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
