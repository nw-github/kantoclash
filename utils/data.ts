import { moveList } from "~/game/moveList";
import { speciesList } from "~/game/species";

export const speciesListEntries = Object.entries(speciesList);
export const moveListEntries = Object.entries(moveList);

export const battleFormats = [
  "standard",
  "nfe",
  "randoms",
  "randoms_nfe",
  "truly_randoms",
  "metronome",
] as const;

export type FormatId = (typeof battleFormats)[number];
