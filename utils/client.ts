import type {PlayerId, PokeId} from "~/game/events";
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
  base?: Pokemon;
  indexInTeam: number;
};

export type ClientPlayer = {
  name: string;
  isSpectator: boolean;
  connected: boolean;

  active: (ClientActivePokemon | undefined)[];
  nPokemon: number;
  nFainted: number;
  spikes?: boolean;
  screens?: Partial<Record<Screen, boolean>>;
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

export const getTypeAndPower = (gen: Generation, move: Move, poke: Pokemon) => {
  let type = move.type;
  let pow = move.power;
  if (move.kind === "damage" && poke && move.getPower) {
    pow = move.getPower(poke);
  }
  if (move.kind === "damage" && poke && move.getType) {
    type = move.getType(poke);
  }
  if (pow && pow !== 1 && poke?.item && gen.itemTypeBoost[poke.item]?.type === type) {
    pow += Math.floor(pow / gen.itemTypeBoost[poke.item]!.percent);
  }

  return [type, pow] as const;
};
