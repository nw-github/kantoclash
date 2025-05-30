import type {PlayerId, PokeId} from "~/game/events";
import type {Move} from "~/game/moves";
import type {FormId, Gender, Pokemon} from "~/game/pokemon";
import {speciesList, type SpeciesId} from "~/game/species";
import {isSpecial, type ScreenId, type Type} from "~/game/utils";

export type ClientActivePokemon = {
  hidden?: bool;
  gender?: Gender;
  speciesId: SpeciesId;
  name: string;
  fainted: bool;
  hpPercent: number;
  level: number;
  transformed?: SpeciesId;
  shiny?: bool;
  form?: FormId;
  v: ClientVolatiles;
  base?: Pokemon;
  indexInTeam: number;
  abilityUnknown?: bool;
};

export type ClientPlayer = {
  name: string;
  isSpectator: bool;
  connected: bool;

  active: (ClientActivePokemon | undefined)[];
  nPokemon: number;
  nFainted: number;
  spikes?: number;
  screens?: Partial<Record<ScreenId, bool>>;
};

export class Players {
  items: Record<string, ClientPlayer> = {};

  get(id: PlayerId) {
    return this.items[id];
  }

  byPokeId(id: PlayerId) {
    const [player] = id.split(":");
    return this.items[player];
  }

  poke(id: PokeId) {
    const [player, pos] = id.split(":");
    return this.items[player]?.active[Number(pos)];
  }

  setPoke(id: PokeId, active: ClientActivePokemon | undefined) {
    const [player, pos] = id.split(":");
    this.items[player].active[Number(pos)] = active;
  }

  add(id: PlayerId, player: ClientPlayer) {
    this.items[id] = player;
  }
}

export const gen1Gender: Partial<Record<SpeciesId, Gender>> = {
  nidoranf: "F",
  nidoranm: "M",
};

export const getCategory = (move: Move, type?: Type) => {
  return move.kind === "damage" || move.power
    ? isSpecial(type ?? move.type)
      ? "special"
      : "physical"
    : "status";
};

export const getSpritePath = (
  species: string | undefined,
  female?: bool,
  shiny?: bool,
  back?: bool,
  form?: FormId,
) => {
  if (!species || !(species in speciesList)) {
    return `/sprites/battle/unknown.png`;
  }

  const sp = speciesList[species as SpeciesId];
  let id = sp.sprite ?? String(sp.dexId);
  if (form) {
    id += `-${form}`;
  }

  let extra = shiny ? "shiny/" : "";
  if (female && femaleIds.has(id)) {
    extra += "female/";
  }

  if (!back) {
    return `/sprites/battle/${extra}${id}.gif`;
  } else {
    return `/sprites/battle/back/${extra}${id}.gif`;
  }
};
