import type {Mods} from "~~/game/battle";
import type {MoveId} from "~~/game/moves";
import type {Generation} from "~~/game/gen";

type FormatInfo = {
  name: string;
  icon: string;
  needsTeam?: bool;
  desc: string;
  mods: Mods;
  chooseLead?: bool;
  generation: number;
  maxLevel: number;
  doubles?: bool;
  beta?: bool;
};

export const battleFormats = [
  "g5_standard",
  "g4_doubles",
  "g4_standard",
  "g4_randoms",
  "g4_randoms_doubles",
  "g4_metronome",
  "g4_nfe",
  "g4_randoms_nfe",
  "g3_randoms_doubles",
  "g3_doubles",
  "g3_standard",
  "g3_metronome",
  "g3_randoms",
  "g3_nfe",
  "g3_randoms_nfe",
  "g2_standard",
  "g2_randoms",
  "g2_metronome",
  "g1_standard",
  "g1_nfe",
  "g1_randoms",
  "g1_randoms_nfe",
  "g1_metronome",
] as const;

export type FormatId = (typeof battleFormats)[number];

export const formatInfo: Record<FormatId, FormatInfo> = {
  g5_standard: {
    name: "[BW2] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all BW and B2W2 Pokémon and moves.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, endlessBattle: true},
    generation: 5,
    beta: true,
    maxLevel: 100,
  },
  g4_standard: {
    name: "[DPP] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all DPP and HGSS Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, endlessBattle: true},
    generation: 4,
    beta: true,
    maxLevel: 100,
  },
  g4_randoms: {
    name: "[DPP] Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    mods: {sleepClause: true, endlessBattle: true},
    generation: 4,
    beta: true,
    maxLevel: 100,
  },
  g4_randoms_doubles: {
    name: "[DPP] Random Doubles",
    icon: "mdi:dice-3-outline",
    desc: "A random double battle.",
    mods: {endlessBattle: true},
    generation: 4,
    doubles: true,
    beta: true,
    maxLevel: 50,
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
    beta: true,
    maxLevel: 50,
  },
  g4_metronome: {
    name: "[DPP] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    mods: {},
    generation: 4,
    maxLevel: 100,
    beta: true,
  },
  g4_nfe: {
    name: "[DPP] Standard Battle (NFE)",
    icon: "mingcute:mickeymouse-line",
    desc: "A standard battle allowing only Pokémon that have not fully evoled.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, endlessBattle: true},
    generation: 4,
    maxLevel: 5,
    beta: true,
  },
  g4_randoms_nfe: {
    name: "[DPP] Random Battle (NFE)",
    icon: "mdi:dice-1-outline",
    desc: "A random battle where only Pokémon that are not fully evolved are included.",
    mods: {sleepClause: true, endlessBattle: true},
    generation: 4,
    maxLevel: 5,
    beta: true,
  },
  g3_standard: {
    name: "[ADV] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all RSE and FRLG Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, endlessBattle: true},
    generation: 3,
    maxLevel: 100,
  },
  g3_randoms: {
    name: "[ADV] Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    mods: {sleepClause: true, endlessBattle: true},
    generation: 3,
    maxLevel: 100,
  },
  g3_randoms_doubles: {
    name: "[ADV] Random Doubles",
    icon: "mdi:dice-3-outline",
    desc: "A random double battle.",
    mods: {endlessBattle: true},
    generation: 3,
    doubles: true,
    maxLevel: 50,
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
    maxLevel: 50,
  },
  g3_nfe: {
    name: "[ADV] Standard Battle (NFE)",
    icon: "mingcute:mickeymouse-line",
    desc: "A standard battle allowing only Pokémon that have not fully evoled.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, endlessBattle: true},
    generation: 3,
    maxLevel: 5,
  },
  g3_randoms_nfe: {
    name: "[ADV] Random Battle (NFE)",
    icon: "mdi:dice-1-outline",
    desc: "A random battle where only Pokémon that are not fully evolved are included.",
    mods: {sleepClause: true, endlessBattle: true},
    generation: 3,
    maxLevel: 5,
  },
  g3_metronome: {
    name: "[ADV] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    mods: {},
    generation: 3,
    maxLevel: 100,
  },
  g2_standard: {
    name: "[GSC] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 2,
    maxLevel: 100,
  },
  g2_randoms: {
    name: "[GSC] Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 2,
    maxLevel: 100,
  },
  g2_metronome: {
    name: "[GSC] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    mods: {},
    generation: 2,
    maxLevel: 100,
  },
  g1_standard: {
    name: "[RBY] Standard Battle",
    icon: "akar-icons:sword",
    desc: "A standard battle allowing all Pokémon.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
    maxLevel: 100,
  },
  g1_nfe: {
    name: "[RBY] Standard Battle (NFE)",
    icon: "mingcute:mickeymouse-line",
    desc: "A standard battle allowing only Pokémon that have not fully evoled.",
    needsTeam: true,
    chooseLead: true,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
    maxLevel: 5,
  },
  g1_randoms: {
    name: "[RBY] Random Battle",
    icon: "mdi:dice-3-outline",
    desc: "A standard Pokémon battle, but your team and sets are randomly generated.",
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
    maxLevel: 100,
  },
  g1_metronome: {
    name: "[RBY] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    mods: {},
    generation: 1,
    maxLevel: 100,
  },
  g1_randoms_nfe: {
    name: "[RBY] Random Battle (NFE)",
    icon: "mdi:dice-1-outline",
    desc: "A random battle where only Pokémon that are not fully evolved are included.",
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
    maxLevel: 5,
  },
};

export const isValidSketchMove = (gen: Generation, id: string) => {
  const move = gen.moveList[id as MoveId];
  if (!move) {
    return false;
  }
  return !gen.invalidSketchMoves.includes(id) && move.idx! <= gen.lastMoveIdx;
};

export const CHAT_MAX_MESSAGE = 500;
