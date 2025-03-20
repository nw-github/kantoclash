import type {Status} from "~/game/pokemon";
import type {Mods, VolatileStats} from "../game/battle";
import type {SpeciesId} from "../game/species";
import {volatileFlags, type Stages, type Type} from "../game/utils";
import type {MoveId} from "~/game/moves";
import {createDefu} from "defu";

export const clientVolatiles = [...volatileFlags, "substitute", "confused", "disabled"] as const;
export type ClientVolatileFlag = (typeof clientVolatiles)[number];

export type ClientVolatiles = Partial<Record<ClientVolatileFlag, boolean>> & {
  stages: Partial<Record<Stages, number>>;
  // Status isnt really a volatile, but it can get hazed away in Gen 1
  status?: Status;
  stats?: VolatileStats;
  charging?: MoveId;
  conversion?: Type[];
};

export const mergeVolatiles = createDefu((obj, key, value) => {
  if (value === null) {
    // @ts-expect-error undefined is not assignable to type
    obj[key] = undefined;
    return true;
  }
});

export type ClientActivePokemon = {
  hidden?: boolean;
  speciesId: SpeciesId;
  name: string;
  fainted: boolean;
  hpPercent: number;
  level: number;
  transformed?: SpeciesId;
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

type FormatInfo = {
  name: string;
  icon: string;
  needsTeam?: boolean;
  desc: string;
  mods: Mods;
  chooseLead?: boolean;
  generation: number;
};

export const battleFormats = [
  "g2_standard",
  "g1_standard",
  "g1_nfe",
  "g1_randoms",
  "g1_randoms_nfe",
  "g1_truly_randoms",
  "g1_metronome",
] as const;

export type FormatId = (typeof battleFormats)[number];

export const formatInfo: Record<FormatId, FormatInfo> = {
  g2_standard: {
    name: "[Gen 2] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 2,
  },
  g1_standard: {
    name: "Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_nfe: {
    name: "Standard Battle (NFE)",
    icon: "mingcute:mickeymouse-line",
    desc: "A standard battle allowing only Pokémon that have not fully evoled.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_randoms: {
    name: "Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    needsTeam: false,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_metronome: {
    name: "Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    needsTeam: false,
    mods: {},
    generation: 1,
  },
  g1_truly_randoms: {
    name: "Truly Random Battle",
    icon: "mdi:dice-5-outline",
    desc: "A random battle with no limits on the generated move sets.",
    needsTeam: false,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_randoms_nfe: {
    name: "Random Battle (NFE)",
    icon: "mdi:dice-1-outline",
    desc: "A random battle where only Pokémon that are not fully evolved are included.",
    needsTeam: false,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
};
