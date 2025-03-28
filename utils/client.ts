import type {Generation} from "~/game/gen1";
import type {Move} from "~/game/moves";
import type {Gender, Pokemon} from "~/game/pokemon";
import type {SpeciesId} from "~/game/species";
import {isSpecial, type Screen, type Type} from "~/game/utils";

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

  active?: ClientActivePokemon;
  nPokemon: number;
  nFainted: number;
  spikes?: boolean;
  screens?: Partial<Record<Screen, boolean>>;
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

export const getTypeAndPower = (gen: Generation, move: Move, poke: Pokemon) => {
  let type = move.type;
  let pow = move.power;
  if (move.kind === "damage" && poke && move.getPower) {
    pow = move.getPower(poke);
  }
  if (move.kind === "damage" && poke && move.getType) {
    type = move.getType(poke);
  }
  if (pow && pow !== 1 && poke?.item && gen.itemTypeBoost[poke.item] === type) {
    pow += Math.floor(pow / 10);
  }

  return [type, pow] as const;
};
