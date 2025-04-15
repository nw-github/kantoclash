import type {Status} from "~/game/pokemon";
import type {Mods} from "~/game/battle";
import type {StageId, StageStats, Type, VF} from "~/game/utils";
import type {MoveId} from "~/game/moves";
import type {Generation} from "~/game/gen";
import type {AbilityId} from "~/game/species";

export type ClientVolatiles = {
  stages: Partial<Record<StageId, number>>;
  // Status isnt really a volatile, but multiple things can inflict/remove it, so let server handle it
  status?: Status;
  stats?: StageStats;
  charging?: MoveId;
  trapped?: MoveId;
  types?: Type[];
  flags?: VF;
  perishCount?: number;
  ability?: AbilityId;
  stockpile?: number;
};

type FormatInfo = {
  name: string;
  icon: string;
  needsTeam?: bool;
  desc: string;
  mods: Mods;
  chooseLead?: bool;
  generation: number;
  doubles?: bool;
};

export const battleFormats = [
  "g4_doubles",
  "g4_standard",
  "g4_randoms",
  "g4_randoms_doubles",

  "g3_randoms_doubles",
  "g3_doubles",
  "g3_standard",
  "g3_metronome",
  "g3_randoms",
  "g2_standard",
  "g2_randoms",
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
  g4_standard: {
    name: "[DPP] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all DPP and HGSS Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, endlessBattle: true},
    generation: 4,
  },
  g4_randoms: {
    name: "[DPP] Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    mods: {sleepClause: true, endlessBattle: true},
    generation: 4,
  },
  g4_randoms_doubles: {
    name: "[DPP] Random Doubles",
    icon: "mdi:dice-3-outline",
    desc: "A random double battle.",
    mods: {endlessBattle: true},
    generation: 4,
    doubles: true,
  },
  g4_doubles: {
    name: "[DPP] Doubles",
    icon: "akar-icons:sword",
    desc: "A standard double battle allowing all DPP and HGSS Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {endlessBattle: true},
    generation: 4,
    doubles: true,
  },
  g3_standard: {
    name: "[ADV] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all RSE and FRLG Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, endlessBattle: true},
    generation: 3,
  },
  g3_randoms: {
    name: "[ADV] Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    mods: {sleepClause: true, endlessBattle: true},
    generation: 3,
  },
  g3_randoms_doubles: {
    name: "[ADV] Random Doubles",
    icon: "mdi:dice-3-outline",
    desc: "A random double battle.",
    mods: {endlessBattle: true},
    generation: 3,
    doubles: true,
  },
  g3_doubles: {
    name: "[ADV] Doubles",
    icon: "akar-icons:sword",
    desc: "A standard double battle allowing all FRLG and RSE Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {endlessBattle: true},
    generation: 3,
    doubles: true,
  },
  g3_metronome: {
    name: "[ADV] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    mods: {},
    generation: 3,
  },
  g2_standard: {
    name: "[GSC] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 2,
  },
  g2_randoms: {
    name: "[GSC] Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 2,
  },
  g2_metronome: {
    name: "[GSC] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    mods: {},
    generation: 2,
  },
  g1_standard: {
    name: "[RBY] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_nfe: {
    name: "[RBY] Standard Battle (NFE)",
    icon: "mingcute:mickeymouse-line",
    desc: "A standard battle allowing only Pokémon that have not fully evoled.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_randoms: {
    name: "[RBY] Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_metronome: {
    name: "[RBY] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    mods: {},
    generation: 1,
  },
  g1_truly_randoms: {
    name: "[RBY] Truly Random Battle",
    icon: "mdi:dice-5-outline",
    desc: "A random battle with no limits on the generated move sets.",
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_randoms_nfe: {
    name: "[RBY] Random Battle (NFE)",
    icon: "mdi:dice-1-outline",
    desc: "A random battle where only Pokémon that are not fully evolved are included.",
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
