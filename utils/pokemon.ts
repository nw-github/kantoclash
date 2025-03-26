import {moveList, type MoveId, type Move} from "~/game/moves";
import {speciesList, type SpeciesId} from "~/game/species";
import {statKeys, type Stats} from "~/game/utils";
import {battleFormats} from "./shared";
import type {PokemonDesc} from "~/game/pokemon";
import type {Generation} from "~/game/gen";

type WithRequired<T, K extends keyof T> = T & {[P in K]-?: T[P]};

export type TeamPokemonDesc = WithRequired<PokemonDesc, "evs" | "ivs">;

export type Team = {name: string; pokemon: TeamPokemonDesc[]; format: FormatId};

export const teamToString = ({name, pokemon, format}: Team) => {
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

  const item = poke.item ? ` @ ${poke.item}` : "";

  let result = "";
  if (poke.name !== species?.name && poke.name) {
    result += `${poke.name} (${species?.name})${item}\n`;
  } else {
    result += `${species?.name ?? poke.name}${item}\n`;
  }

  if (poke.level !== 100 && poke.level !== undefined) {
    result += `Level: ${poke.level}\n`;
  }

  if (poke.friendship !== 255 && poke.friendship !== undefined) {
    result += `Happiness: ${poke.friendship}\n`;
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

const nameRegex = /^(.+?)(?:\s*\(([^()]+)\))?(?:\s*\(([^()]+)\))?(?:\s*@\s*([^()]+))?$/;
const levelRegex = /^Level:\s*(\d+)/i;
const happinessRegex = /^Happiness:\s*(\d+)/i;
const evsRegex = /^EVs:\s*(\d+\s+\w+\s*\/?\s*)+/i;
const ivsRegex = /^IVs:\s*(\d+\s+\w+\s*\/?\s*)+/i;
const moveRegex = /^-\s*(.+)/;

const statRegex = /\s*(\d+)\s+(\w+)\s*/g;
const ignoreChars = /[\s-.'`]+/g;
const teamRegex = /^===\s*(?:\[(.+)\])?\s*(.+?)\s*===$/;

export const parsePokemon = (src: string): TeamPokemonDesc => {
  const getHpDvs = (name: string) => {
    name = normalizeName(name);
    if (!name.startsWith("hiddenpower")) {
      return;
    }
    const type = name.slice(11).replace("fighting", "fight");
    // prettier-ignore
    const hpTypes = [
      "fight", "flying", "poison", "ground", "rock", "bug", "ghost", "steel", "fire", "water",
      "grass", "electric", "psychic", "ice", "dragon", "dark",
    ];

    const pos = hpTypes.indexOf(type);
    if (pos === -1) {
      return;
    }

    return [0b1100 | (pos >> 2), 0b1100 | (pos & 3)];
  };

  const desc: TeamPokemonDesc = {species: "", evs: {}, ivs: {}, moves: [], name: ""};

  // prettier-ignore
  const lines = src.split("\n").map(line => line.trim()).filter(line => line);
  if (!lines.length) {
    return desc;
  }

  // TODO: shiny, nature, gender in gen 3

  let match = lines[0].match(nameRegex);
  if (match) {
    const [, nameOrSpecies, speciesOrGender, gender, item] = match;
    if (speciesOrGender && gender) {
      // FIXME: This is broken: Name (with parens) (Misdreavus)

      // Custom Name (Misdreavus) (F)
      desc.name = nameOrSpecies;
      desc.species = speciesOrGender;
      // desc.gender = gender;
    } else if (speciesOrGender) {
      if (speciesOrGender.toLowerCase() === "f" || speciesOrGender.toLowerCase() === "m") {
        // Misdreavus (F)
        desc.species = nameOrSpecies;
        // desc.gender = gender;
      } else {
        // Custom Name (Misdreavus)
        desc.name = nameOrSpecies;
        desc.species = speciesOrGender;
      }
    } else {
      // Misdreavus
      desc.species = nameOrSpecies;
    }

    desc.item = item;
  }

  desc.species = normalizeName(desc.species);

  for (const line of lines.slice(1)) {
    if ((match = line.match(levelRegex))) {
      desc.level = +match[1];
    } else if ((match = line.match(happinessRegex))) {
      desc.friendship = +match[1];
    } else if ((match = line.match(moveRegex))) {
      desc.moves.push(match[1]);
      const dvs = getHpDvs(match[1]);
      if (dvs) {
        desc.moves[desc.moves.length - 1] = "Hidden Power";
        desc.ivs.atk = dvToIv(dvs[0]);
        desc.ivs.def = dvToIv(dvs[1]);
      }
    } else if ((match = line.match(evsRegex)) || (match = line.match(ivsRegex))) {
      const isEvs = match[0].toLowerCase().startsWith("evs");
      for (const [, v, s] of match[0].matchAll(statRegex)) {
        const value = +v;
        const stat = s.toLowerCase();
        if (!statKeys.includes(stat)) {
          continue;
        }

        if (isEvs) {
          desc.evs[stat] = value;
        } else {
          desc.ivs[stat] = value;
        }
      }
    }
  }
  return desc;
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
    teams.push({name, pokemon, format});
  }
  return teams;
};

export const convertDesc = (desc: PokemonDesc): PokemonDesc => {
  const species = normalizeName(desc.species);
  const moves: string[] = [];
  for (const move of desc.moves) {
    if (move.trim()) {
      moves.push(normalizeName(move));
    }
  }

  let item = desc.item && normalizeName(desc.item);
  if (!item) {
    item = undefined;
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
  return {evs, ivs, moves, level: desc.level ?? 100, name: desc.name, species, item};
};

export const normalizeName = (v: string) => v.trim().toLowerCase().replaceAll(ignoreChars, "");

export const ivToDv = (v?: number) => Math.floor((v ?? 31) / 2);
export const dvToIv = (v?: number) => (v ?? 15) * 2;
// FIXME: showdown parity
export const evToStatexp = (v?: number) => (v ?? 255) * 257;
export const statexpToEv = (v?: number) => Math.floor((v ?? 65535) / 257);

export const ivsToDvs = (gen: Generation, ivs: Partial<Stats>) => {
  const dvs: Partial<Stats> = {};
  for (const stat in getStatKeys(gen)) {
    dvs[stat as keyof Stats] = ivToDv(ivs[stat as keyof Stats]);
  }
  return dvs;
};
