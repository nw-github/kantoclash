import { moveList } from "~/game/moves";
import { speciesList, type Species } from "~/game/species";

export const speciesListEntries = Object.entries(speciesList) as [string, Species][];
export const moveListEntries = Object.entries(moveList);

export const battleFormats = [
  "g1_standard",
  "g1_nfe",
  "g1_randoms",
  "g1_randoms_nfe",
  "g1_truly_randoms",
  "g1_metronome",
] as const;

export type FormatId = (typeof battleFormats)[number];
