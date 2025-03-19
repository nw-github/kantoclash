import { moveList, type MoveId, type Move } from "~/game/moves";
import { speciesList, type SpeciesId } from "~/game/species";
import { statKeys, type Stats } from "~/game/utils";
import { battleFormats } from "./shared";
import type { PokemonDesc } from "~/game/pokemon";

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type TeamPokemonDesc = WithRequired<PokemonDesc, "evs" | "ivs">;

export type Team = {
  name: string;
  pokemon: TeamPokemonDesc[];
  format: FormatId;
};

export const teamToString = ({ name, pokemon, format }: Team) => {
  return `=== [${format}] ${name} ===\n\n` + pokemon.map(descToString).join("\n");
};

export const descToString = (poke: PokemonDesc) => {
  const stats = (stats: Partial<Stats>, def: number, name: string) => {
    const result = [];
    for (const k in stats) {
      if (stats[k as keyof Stats] !== undefined && stats[k as keyof Stats] !== def) {
        result.push(`${stats[k as keyof Stats]!} ${k}`);
      }
    }

    return result.length ? `${name}: ${result.join(" / ")}\n` : "";
  };

  const species = poke.species in speciesList ? speciesList[poke.species as SpeciesId] : undefined;

  let result = "";
  if (poke.name !== species?.name && poke.name) {
    result += `${poke.name} (${species?.name})\n`;
  } else {
    result += `${species?.name ?? poke.name}\n`;
  }

  if (poke.level !== 100 && poke.level !== undefined) {
    result += `Level: ${poke.level}\n`;
  }

  result += poke.evs ? stats(poke.evs, 255, "EVs") : "";
  result += poke.ivs ? stats(poke.ivs, 31, "IVs") : "";
  for (const move of poke.moves) {
    const id = normalizeName(move);
    if ((moveList as Record<string, Move>)[id]) {
      result += ` - ${moveList[id as MoveId].name}\n`;
    } else if (move.trim()) {
      result += ` - ${move}\n`;
    }
  }
  return result;
};

const nameWithSpeciesRegex = /^\s*(.*?)\s*\((\w+)\)/;
const levelRegex = /^\s*Level:\s*(\d+)/i;
const evsRegex = /^EVs:\s*(\d+\s+\w+\s*\/?\s*)+/i;
const ivsRegex = /^IVs:\s*(\d+\s+\w+\s*\/?\s*)+/i;
const moveRegex = /^\s*-\s*(.+)\s*/;
const statRegex = /\s*(\d+)\s+(\w+)\s*/g;
const ignoreChars = /(\s|-)+/g;
const teamRegex = /^===\s*(?:\[(.+)\])?\s*(.+?)\s*===$/;

export const parsePokemon = (src: string): TeamPokemonDesc => {
  const moves: string[] = [];
  const ivs: Partial<Stats> = {};
  const evs: Partial<Stats> = {};
  let level = undefined;
  let name = "";
  let speciesName = "";

  const lines = src.split("\n");

  let match;
  if ((match = lines[0].match(nameWithSpeciesRegex))) {
    speciesName = match[2].toLowerCase();
    name = match[1];
  } else {
    speciesName = lines[0].toLowerCase();
  }

  for (const line of lines.slice(1)) {
    if ((match = line.match(levelRegex))) {
      level = +match[1];
    } else if ((match = line.match(evsRegex)) || (match = line.match(ivsRegex))) {
      // EVs and IVs for smogon compatibility
      const isEvs = match[0].toLowerCase().includes("evs");
      for (const [, v, s] of match[1].matchAll(statRegex)) {
        const value = +v;
        const stat = s.toLowerCase();
        if (!statKeys.includes(stat)) {
          continue;
        }

        if (isEvs) {
          evs[stat] = value;
        } else {
          ivs[stat] = value;
        }
      }
    } else if ((match = line.match(moveRegex))) {
      moves.push(match[1]);
    }
  }
  return { species: speciesName, evs, ivs, level, moves, name };
};

export const parseTeams = (src: string) => {
  const res = src
    .split("\n\n")
    .map(t => t.trim())
    .filter(t => t.length);
  const teams: Team[] = [];
  for (let i = 0; i < res.length; i++) {
    let name = "New Team";
    let format: FormatId = "g1_standard";

    const match = res[i].match(teamRegex);
    if (match) {
      name = match[2];

      const fmt = match[1]?.trim();
      if (fmt && battleFormats.includes(fmt)) {
        format = fmt;
      } else if (fmt === "gen1ou") {
        format = "g1_standard";
      }
      ++i;
    }

    const pokemon = [];
    for (; i < res.length; i++) {
      if (res[i].match(teamRegex) || pokemon.length >= 6) {
        --i;
        break;
      }

      pokemon.push(parsePokemon(res[i]));
    }
    teams.push({ name, pokemon, format });
  }
  return teams;
};

export const convertDesc = (desc: PokemonDesc): PokemonDesc => {
  const normalizeName2 = (v: string) => v.trim().toLowerCase().replaceAll(/\s+/g, "");

  const species = normalizeName2(desc.species);
  const moves: string[] = [];
  for (const move of desc.moves) {
    if (move.trim()) {
      moves.push(normalizeName(move));
    }
  }

  const evs: Partial<Stats> = {};
  const ivs: Partial<Stats> = {};
  for (const stat of statKeys) {
    if (desc.evs) {
      evs[stat] = evToStatexp(desc.evs[stat]);
    }
    if (desc.ivs) {
      ivs[stat] = ivToDv(desc.ivs[stat]);
    }
  }
  return { evs, ivs, moves, level: desc.level ?? 100, name: desc.name, species };
};

export const normalizeName = (v: string) => v.trim().toLowerCase().replaceAll(ignoreChars, "");

export const ivToDv = (v?: number) => Math.floor((v ?? 31) / 2);
export const dvToIv = (v?: number) => (v ?? 15) * 2;
// FIXME: showdown parity
export const evToStatexp = (v?: number) => (v ?? 255) * 257;
export const statexpToEv = (v?: number) => Math.floor((v ?? 65535) / 257);
