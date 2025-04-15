import speciesPatches from "./species.json";
import items from "./items.json";
import {GENERATION1, type Generation} from "../gen1";
import type {Species, SpeciesId} from "../species";
import {merge, type GenPatches} from "../gen2";
import {moveFunctionPatches, movePatches} from "./moves";
import {GENERATION3} from "../gen3";
import {MC} from "../utils";

const createGeneration = (): Generation => {
  const patches: Partial<GenPatches> = {
    id: 4,
    speciesList: speciesPatches as Partial<
      Record<SpeciesId, Partial<Species>>
    > as typeof GENERATION1.speciesList,
    moveList: movePatches as typeof GENERATION1.moveList,
    lastMoveIdx: GENERATION1.moveList.zenheadbutt.idx!,
    moveFunctions: moveFunctionPatches as typeof GENERATION1.moveFunctions,
    validSpecies: species => species.dexId <= 493 && !species.unselectable,
    getCategory: move => ("category" in move ? move.category : MC.status),
    isSpecial: move => "category" in move && move.category === MC.special,
  };

  const r = merge(patches as any, GENERATION3);
  // r.items = items;
  return r;
};

export const GENERATION4 = createGeneration();
