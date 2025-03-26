import type {Move} from "~/game/moves";
import type {Gender} from "~/game/pokemon";
import type {SpeciesId} from "~/game/species";
import {isSpecial, type Type} from "~/game/utils";

export type ClientActivePokemon = {
  hidden?: boolean;
  gender?: Gender;
  speciesId: SpeciesId;
  name: string;
  fainted: boolean;
  hpPercent: number;
  level: number;
  transformed?: SpeciesId;
  shiny?: boolean;
  v: ClientVolatiles;
};

export type ClientPlayer = {
  name: string;
  isSpectator: boolean;
  connected: boolean;
  nPokemon: number;
  nFainted: number;
  active?: ClientActivePokemon;
};

export const gen1Gender: Partial<Record<SpeciesId, Gender>> = {
  nidoranf: "female",
  nidoranm: "male",
};

export const getCategory = (move: Move, type?: Type) => {
  return move.kind === "damage" || move.power
    ? isSpecial(type ?? move.type)
      ? "special"
      : "physical"
    : "status";
};
