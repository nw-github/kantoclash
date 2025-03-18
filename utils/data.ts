import { moveList, type Move, type MoveId } from "~/game/moves";
import { speciesList, type Species, type SpeciesId } from "~/game/species";

export const speciesListEntries = Object.entries(speciesList) as [SpeciesId, Species][];
export const moveListEntries = Object.entries(moveList) as [MoveId, Move][];

export const battleFormats = [
  "g1_standard",
  "g1_nfe",
  "g1_randoms",
  "g1_randoms_nfe",
  "g1_truly_randoms",
  "g1_metronome",
] as const;

export type FormatId = (typeof battleFormats)[number];
