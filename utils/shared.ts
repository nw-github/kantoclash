import type {Gender, Status} from "~/game/pokemon";
import type {Mods, VolatileStats} from "../game/battle";
import type {SpeciesId} from "../game/species";
import type {Stages, Type, VolatileFlag} from "../game/utils";
import type {MoveId} from "~/game/moves";
import type {Generation} from "~/game/gen1";

export type ClientVolatiles = {
  stages: Partial<Record<Stages, number>>;
  // Status isnt really a volatile, but multiple things can inflict/remove it, so let server handle it
  status?: Status;
  stats?: VolatileStats;
  charging?: MoveId;
  types?: Type[];
  flags?: VolatileFlag;
  perishCount?: number;
};

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
  "g2_metronome",
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
  g2_metronome: {
    name: "[Gen 2] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    needsTeam: false,
    mods: {},
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

export const mergeVolatiles = <T extends object>(ext: any, obj: T) => {
  const isObject = (foo: any): foo is object => {
    return !Array.isArray(foo) && typeof foo === "object";
  };

  const result: any = {};
  for (const kk of new Set([...Object.keys(obj), ...Object.keys(ext)])) {
    const k = kk as keyof T;
    if (ext[k] === null) {
      continue;
    } else if (isObject(obj[k]) || isObject(ext[k])) {
      result[k] = mergeVolatiles(ext[k] ?? {}, obj[k] ?? {});
    } else {
      result[k] = ext[k] ?? obj[k];
    }
  }

  return result as T;
};

export const isValidSketchMove = (gen: Generation, id: string) => {
  const move = gen.moveList[id as MoveId];
  if (!move) {
    return false;
  }
  return !gen.invalidSketchMoves.includes(id) && move.idx! <= gen.lastMoveIdx;
};
