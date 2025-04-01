import type {MoveId, Move, DamagingMove} from "~/game/moves";
import {abilityList, type Species, type SpeciesId} from "~/game/species";
import {HP_TYPES, statKeys, type Stats, type Type} from "~/game/utils";
import {battleFormats, formatInfo, type FormatId} from "./shared";
import {Nature, Pokemon, type PokemonDesc} from "~/game/pokemon";
import {GENERATIONS, type Generation} from "~/game/gen";

type WithRequired<T, K extends keyof T> = T & {[P in K]-?: T[P]};

export type TeamPokemonDesc = WithRequired<PokemonDesc, "evs" | "ivs">;

export type Team = {name: string; pokemon: TeamPokemonDesc[]; format: FormatId};

export const teamToString = ({name, pokemon, format}: Team) => {
  return `=== [${format}] ${name} ===\n\n` + pokemon.map(p => descToString(format, p)).join("\n");
};

export const descToString = (format: FormatId, poke: PokemonDesc) => {
  const stats = (stats: Partial<Stats>, def: number, name: string) => {
    const result = [];
    for (const k in stats) {
      if (stats[k as keyof Stats] !== undefined && stats[k as keyof Stats] !== def) {
        result.push(`${stats[k as keyof Stats]!} ${k}`);
      }
    }

    return result.length ? `${name}: ${result.join(" / ")}\n` : "";
  };

  const gen = GENERATIONS[formatInfo[format].generation]!;
  const species =
    poke.species in gen.speciesList ? gen.speciesList[poke.species as SpeciesId] : undefined;

  const item = poke.item ? ` @ ${poke.item}` : "";
  const g = species && gen.id >= 3 && gen.getGender(poke.gender, species, poke.ivs?.atk ?? 15);
  const gender = g && g !== "N" ? ` (${g[0].toUpperCase()})` : "";

  let result = "";
  if (poke.name !== species?.name && poke.name) {
    result += `${poke.name} (${species?.name})${gender}${item}\n`;
  } else {
    result += `${species?.name ?? poke.name}${gender}${item}\n`;
  }

  if (poke.level !== 100 && poke.level !== undefined) {
    result += `Level: ${poke.level}\n`;
  }

  if (poke.friendship !== 255 && poke.friendship !== undefined) {
    result += `Happiness: ${poke.friendship}\n`;
  }

  if (gen.id >= 3 && poke.ability) {
    const ability = normalizeName(poke.ability);
    result += `Ability: ${(abilityList as any)[ability]?.name ?? poke.ability}\n`;
  }

  if (poke.shiny && gen.id >= 3) {
    result += `Shiny: Yes\n`;
  }

  result += poke.evs ? stats(poke.evs, gen.id <= 2 ? 255 : 0, "EVs") : "";
  result += poke.ivs ? stats(poke.ivs, 31, "IVs") : "";

  if (poke.nature !== undefined) {
    result += `${toTitleCase(Nature[poke.nature])} Nature\n`;
  }

  for (const move of poke.moves) {
    const id = normalizeName(move);
    if (id === "hiddenpower") {
      const type = (gen.moveList.hiddenpower as DamagingMove).getType!(
        new Pokemon(gen, {species: "abra", ivs: poke.ivs ?? {}, moves: []}),
      );
      result += ` - Hidden Power [${toTitleCase(type)}]\n`;
    } else if ((gen.moveList as Record<string, Move>)[id]) {
      result += ` - ${gen.moveList[id as MoveId].name}\n`;
    } else if (move.trim()) {
      result += ` - ${move}\n`;
    }
  }

  return result;
};

const nameRegex = /^(.+?)(?:\s*\(([^()]+)\))?(?:\s*\(([^()]+)\))?(?:\s*@\s*([^()]+))?$/;
const levelRegex = /^Level:\s*(\d+)/i;
const happinessRegex = /^Happiness:\s*(\d+)/i;
const abilityRegex = /^Ability:\s*(.+)/i;
const evsRegex = /^EVs:\s*(\d+\s+\w+\s*\/?\s*)+/i;
const ivsRegex = /^IVs:\s*(\d+\s+\w+\s*\/?\s*)+/i;
const moveRegex = /^-\s*(.+)/;
const natureRegex = /^(\w+)\s+Nature/i;
const shinyRegex = /^Shiny:\s*(Yes|No)/i;

const statRegex = /\s*(\d+)\s+(\w+)\s*/g;
const ignoreChars = /[\s-.'`]+/g;
const teamRegex = /^===\s*(?:\[(.+)\])?\s*(.+?)\s*===$/;

export const HP_IVS: Partial<Record<Type, Partial<Stats>>> = {
  bug: {atk: 30, def: 30, spd: 30},
  dark: {},
  dragon: {atk: 30},
  electric: {spa: 30},
  fight: {def: 30, spa: 30, spd: 30, spe: 30},
  fire: {atk: 30, spa: 30, spe: 30},
  flying: {hp: 30, atk: 30, def: 30, spa: 30, spd: 30},
  ghost: {def: 30, spd: 30},
  grass: {atk: 30, spa: 30},
  ground: {spa: 30, spd: 30},
  ice: {atk: 30, def: 30},
  poison: {def: 30, spa: 30, spd: 30},
  psychic: {atk: 30, spe: 30},
  rock: {def: 30, spd: 30, spe: 30},
  steel: {spd: 30},
  water: {atk: 30, def: 30, spa: 30},
};

export const parsePokemon = (format: FormatId, src: string): TeamPokemonDesc => {
  const gen = GENERATIONS[formatInfo[format].generation]!;

  const getHpIvs = (name: string) => {
    // eslint-disable-next-line no-useless-escape
    name = normalizeName(name).replaceAll(/[\[\(\)\]]/g, "");
    if (!name.startsWith("hiddenpower")) {
      return;
    }

    const type = name.slice(11).replace("fighting", "fight");
    const pos = HP_TYPES.indexOf(type as Type);
    if (pos === -1) {
      return;
    }

    if (gen.id <= 2) {
      return {atk: dvToIv(0b1100 | (pos >> 2)), def: dvToIv(0b1100 | (pos & 3))};
    } else {
      return HP_IVS[type as Type];
    }
  };

  const desc: TeamPokemonDesc = {species: "", evs: {}, ivs: {}, moves: [], name: ""};

  // prettier-ignore
  const lines = src.split("\n").map(line => line.trim()).filter(line => line);
  if (!lines.length) {
    return desc;
  }

  let match = lines[0].match(nameRegex);
  if (match) {
    const [, nameOrSpecies, speciesOrGender, gender, item] = match;
    if (speciesOrGender && gender) {
      // FIXME: This is broken: Name (with parens) (Misdreavus)

      // Custom Name (Misdreavus) (F)
      desc.name = nameOrSpecies;
      desc.species = speciesOrGender;
      desc.gender = gender.toLowerCase() === "f" ? "F" : "M";
    } else if (speciesOrGender) {
      if (speciesOrGender.toLowerCase() === "f" || speciesOrGender.toLowerCase() === "m") {
        // Misdreavus (F)
        desc.species = nameOrSpecies;
        desc.gender = speciesOrGender.toLowerCase() === "f" ? "F" : "M";
      } else {
        // Custom Name (Misdreavus)
        desc.name = nameOrSpecies;
        desc.species = speciesOrGender;
      }
    } else {
      // Misdreavus
      desc.species = nameOrSpecies;
    }

    if (item && normalizeName(item) !== "noitem") {
      desc.item = item;
    }
  }

  desc.species = normalizeName(desc.species);

  let gotIvs = false;
  for (const line of lines.slice(1)) {
    if ((match = line.match(levelRegex))) {
      desc.level = +match[1];
    } else if ((match = line.match(happinessRegex))) {
      desc.friendship = +match[1];
    } else if ((match = line.match(moveRegex))) {
      desc.moves.push(match[1]);
      const ivs = getHpIvs(match[1]);
      if (ivs) {
        desc.moves[desc.moves.length - 1] = "Hidden Power";
        if (!gotIvs) {
          desc.ivs = ivs;
        }
      }
    } else if ((match = line.match(natureRegex))) {
      desc.nature = Nature[match[1].toLowerCase() as any] as unknown as Nature | undefined;
    } else if ((match = line.match(shinyRegex))) {
      desc.shiny = match[1].toLowerCase() === "yes";
    } else if ((match = line.match(abilityRegex))) {
      desc.ability = match[1].trim();
    } else if ((match = line.match(evsRegex)) || (match = line.match(ivsRegex))) {
      const isEvs = match[0].toLowerCase().startsWith("evs");
      if (!isEvs) {
        gotIvs = true;
      }
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

  if (!desc.ability && gen.id >= 3) {
    const species = (gen.speciesList as Record<string, Species>)[desc.species];
    if (species && species.abilities.length === 1) {
      desc.ability = abilityList[species.abilities[0]].name;
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

      pokemon.push(parsePokemon(format, res[i]));
    }
    teams.push({name, pokemon, format});
  }
  return teams;
};

export const convertDesc = (gen: Generation, desc: PokemonDesc): PokemonDesc => {
  const species = normalizeName(desc.species);
  const moves = desc.moves.map(move => normalizeName(move)).filter(m => !!m);

  let item = desc.item && normalizeName(desc.item);
  if (!item || gen.id === 1) {
    item = undefined;
  }

  let ability = desc.ability && normalizeName(desc.ability);
  if (!ability || gen.id <= 2) {
    ability = undefined;
  }

  const evs: Partial<Stats> = {};
  const ivs: Partial<Stats> = {};
  for (const stat of statKeys) {
    if (desc.evs) {
      evs[stat] = gen.id <= 2 ? evToStatexp(desc.evs[stat]) : desc.evs[stat];
    }
    if (desc.ivs) {
      ivs[stat] = gen.id <= 2 ? ivToDv(desc.ivs[stat]) : desc.ivs[stat];
    }
  }
  return {...desc, evs, ivs, moves, species, item, ability};
};

export const convertTeam = (team: Team) => {
  const gen = GENERATIONS[formatInfo[team.format].generation];
  return gen ? team.pokemon.map(poke => convertDesc(gen, poke)) : [];
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
