import { moveList, type MoveId } from "~/game/moveList";
import type { Move } from "~/game/moves";
import { speciesList, type SpeciesId } from "~/game/species";
import { statKeys, type Stats } from "~/game/utils";

export type Gen1PokemonDesc = {
  dvs: Partial<Stats>;
  statexp: Partial<Stats>;
  level: number;
  name?: string;
  species: SpeciesId;
  moves: MoveId[];
};

export type PokemonDesc = {
  evs: Partial<Stats>;
  ivs: Partial<Stats>;
  level: number;
  name?: string;
  species: string;
  moves: string[];
};

export type Team = {
  name: string;
  pokemon: PokemonDesc[];
  format: FormatId;
};

export const serializeTeam = (team: Team) => team.pokemon.map(descToString).join("\n");

export const descToString = (poke: PokemonDesc) => {
  const stats = (stats: Partial<Stats>, def: number, name: string) => {
    const result = [];
    for (const k in stats) {
      if (stats[k as keyof Stats] !== def) {
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

  if (poke.level !== 100) {
    result += `Level: ${poke.level}\n`;
  }

  result += stats(poke.evs, 255, "EVs");
  result += stats(poke.ivs, 31, "IVs");
  for (const move of poke.moves) {
    const id = move.trim().toLowerCase().replaceAll(ignoreChars, "");
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

export const parsePokemon = (src: string): PokemonDesc => {
  const moves: string[] = [];
  const ivs: Partial<Stats> = {};
  const evs: Partial<Stats> = {};
  let level = 100;
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
        if (!(statKeys as readonly string[]).includes(stat)) {
          continue;
        }

        if (isEvs) {
          evs[stat as keyof Stats] = value;
        } else {
          ivs[stat as keyof Stats] = value;
        }
      }
    } else if ((match = line.match(moveRegex))) {
      moves.push(match[1]);
    }
  }

  for (const key of statKeys) {
    evs[key] ??= 255;
    ivs[key] ??= 31;
  }
  return { species: speciesName, evs, ivs, level, moves, name };
};

export const convertDesc = (desc: PokemonDesc): Gen1PokemonDesc => {
  const species = desc.species.trim().toLowerCase().replaceAll(ignoreChars, "") as SpeciesId;
  const moves: MoveId[] = [];
  for (const move of desc.moves) {
    if (move.trim()) {
      moves.push(move.trim().toLowerCase().replaceAll(ignoreChars, "") as MoveId);
    }
  }

  const statexp: Partial<Stats> = {};
  for (const ev in desc.evs) {
    statexp[ev as keyof Stats] = Math.floor(desc.evs[ev as keyof Stats]! * 257);
  }

  const dvs: Partial<Stats> = {};
  for (const iv in desc.ivs) {
    dvs[iv as keyof Stats] = Math.floor(desc.ivs[iv as keyof Stats]! / 2);
  }

  return { statexp, dvs, moves, level: desc.level, name: desc.name, species };
};
