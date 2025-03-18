import { moveList as baseMoveList } from "../moves";
import { speciesList as baseSpeciesList, type Species, type SpeciesId } from "../species";
import { mergeObjects, typeChart as baseTypeChart } from "../utils";
import { movePatches } from "./moves";
import __speciesPatches from "./species.json";

const speciesPatches = __speciesPatches as Partial<Record<SpeciesId, Partial<Species>>>;

const typeChartPatch: Partial<typeof baseTypeChart> = {
  ghost: { psychic: 2 },
  poison: { bug: 1 },
  bug: { poison: 0.5 },
};

export const createGeneration = () => {
  const speciesList = mergeObjects(baseSpeciesList, speciesPatches, true);
  const moveList = mergeObjects(baseMoveList, movePatches, true);
  const typeChart = mergeObjects(baseTypeChart, typeChartPatch, true);

  return { speciesList, moveList, typeChart };
};
