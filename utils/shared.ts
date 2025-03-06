import type { Status } from "~/game/pokemon";
import type { Mods, VolatileStats } from "../game/battle";
import type { SpeciesId } from "../game/species";
import { volatileFlags, type Stages, type Type } from "../game/utils";
import type { MoveId } from "~/game/moveList";

export const clientVolatiles = [...volatileFlags, "substitute", "confused", "disabled"] as const;
export type ClientVolatileFlag = (typeof clientVolatiles)[number];

export type ClientActivePokemon = {
  hidden?: boolean;
  speciesId: SpeciesId;
  name: string;
  fainted: boolean;
  hpPercent: number;
  level: number;
  stages: Partial<Record<Stages, number>>;
  status?: Status;
  stats?: VolatileStats;
  transformed?: SpeciesId;
  conversion?: Type[];
  flags: Partial<Record<ClientVolatileFlag, boolean>>;
  charging?: MoveId;
};

export type ClientPlayer = {
  name: string;
  isSpectator: boolean;
  connected: boolean;
  nPokemon: number;
  nFainted: number;
  active?: ClientActivePokemon;
};

type FormatInfo = {
  name: string;
  icon: string;
  needsTeam: boolean;
  desc: string;
  mods: Mods;
};

export const formatInfo: Record<FormatId, FormatInfo> = {
  g1_standard: {
    name: "Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all Pokémon.",
    needsTeam: true,
    mods: { sleepClause: true, freezeClause: true, endlessBattle: true },
  },
  g1_nfe: {
    name: "Standard Battle (NFE)",
    icon: "mingcute:mickeymouse-line",
    desc: "A standard battle allowing only Pokémon that have not fully evoled.",
    needsTeam: true,
    mods: { sleepClause: true, freezeClause: true, endlessBattle: true },
  },
  g1_randoms: {
    name: "Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    needsTeam: false,
    mods: { sleepClause: true, freezeClause: true, endlessBattle: true },
  },
  g1_metronome: {
    name: "Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    needsTeam: false,
    mods: {},
  },
  g1_truly_randoms: {
    name: "Truly Random Battle",
    icon: "mdi:dice-5-outline",
    desc: "A random battle with no limits on the generated move sets.",
    needsTeam: false,
    mods: { sleepClause: true, freezeClause: true, endlessBattle: true },
  },
  g1_randoms_nfe: {
    name: "Random Battle (NFE)",
    icon: "mdi:dice-1-outline",
    desc: "A random battle where only Pokémon that are not fully evolved are included.",
    needsTeam: false,
    mods: { sleepClause: true, freezeClause: true, endlessBattle: true },
  },
};
