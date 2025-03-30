import type {Status} from "~/game/pokemon";
import type {Mods, VolatileStats} from "../game/battle";
import type {Stages, Type, VF} from "../game/utils";
import {Range, type Move, type MoveId} from "~/game/moves";
import type {Generation} from "~/game/gen1";
import type {PlayerId, PokeId} from "~/game/events";

export type ClientVolatiles = {
  stages: Partial<Record<Stages, number>>;
  // Status isnt really a volatile, but multiple things can inflict/remove it, so let server handle it
  status?: Status;
  stats?: VolatileStats;
  charging?: MoveId;
  trapped?: MoveId;
  types?: Type[];
  flags?: VF;
  perishCount?: number;
};

type FormatInfo = {
  name: string;
  icon: string;
  needsTeam?: boolean;
  desc: string;
  mods: Mods;
  chooseLead?: boolean;
  generation: number;
  doubles?: boolean;
};

export const battleFormats = [
  "g3_randoms_doubles",
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
  g3_randoms_doubles: {
    name: "[ADV] Random Doubles",
    icon: "mdi:dice-3-outline",
    desc: "A random double battle.",
    chooseLead: true,
    mods: {sleepClause: true, endlessBattle: true},
    generation: 2,
    doubles: true,
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
    needsTeam: false,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 2,
  },
  g2_metronome: {
    name: "[GSC] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    needsTeam: false,
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
    needsTeam: false,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_metronome: {
    name: "[RBY] Random Metronome Battle",
    icon: "mdi:metronome",
    desc: "A random battle where all Pokémon only know the move Metronome.",
    needsTeam: false,
    mods: {},
    generation: 1,
  },
  g1_truly_randoms: {
    name: "[RBY] Truly Random Battle",
    icon: "mdi:dice-5-outline",
    desc: "A random battle with no limits on the generated move sets.",
    needsTeam: false,
    mods: {sleepClause: true, freezeClause: true, endlessBattle: true},
    generation: 1,
  },
  g1_randoms_nfe: {
    name: "[RBY] Random Battle (NFE)",
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

export const getTargets = (
  players: Players,
  userIndex: number,
  move: Move,
  myId: PlayerId,
  opponent: PlayerId,
) => {
  type GetTarget = {allyOnly?: bool; oppOnly?: bool; adjacent?: bool; self?: boolean};

  const getTarget = ({allyOnly, oppOnly, adjacent, self}: GetTarget) => {
    const targets: PokeId[] = [];
    const opp = players.get(opponent);
    const me = players.get(myId);
    if (adjacent) {
      for (let i = userIndex - 1; i <= userIndex + 1; i++) {
        if (!allyOnly && opp.active[i]) {
          targets.push(`${opponent}:${i}`);
        }
        if (!oppOnly && me.active[i]) {
          targets.push(`${myId}:${i}`);
        }
      }
    } else {
      targets.push(...me.active.filter(v => !!v).map((_, i) => `${myId}:${i}` as const));
      targets.push(...opp.active.filter(v => !!v).map((_, i) => `${myId}:${i}` as const));
    }

    const idx = targets.indexOf(`${myId}:${userIndex}`);
    if (!self && idx !== -1) {
      targets.splice(idx, 1);
    }
    return targets;
  };

  // prettier-ignore
  switch (move.range) {
  case Range.Field:
  case Range.Random:
  case Range.Self:
  case Range.AllAdjacent:
  case Range.AllAdjacentFoe:
  case Range.All:
  case Range.AllAllies:
    return [];
  case Range.Adjacent:
    return getTarget({ adjacent: true });
  case Range.AdjacentFoe:
    return getTarget({ oppOnly: true, adjacent: true });
  case Range.AdjacentAlly:
    return getTarget({ allyOnly: true, adjacent: true });
  case Range.SelfOrAdjacentAlly:
    return getTarget({ allyOnly: true, adjacent: true, self: true });
  case Range.Any:
    return getTarget({ });
  }
};
