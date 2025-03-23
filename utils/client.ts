import type {Gender} from "~/game/pokemon";
import type {SpeciesId} from "~/game/species";

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
