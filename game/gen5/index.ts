import speciesPatches from "./species.json";
import items from "./items.json";
import {GENERATION1, type Generation} from "../gen1";
import type {Species, SpeciesId} from "../species";
import {merge, type GenPatches} from "../gen2";
import {moveFunctionPatches, movePatches} from "./moves";
import {createItemMergeList} from "../gen3";
import {GENERATION4} from "../gen4";

const createGeneration = (): Generation => {
  const patches: Partial<GenPatches> = {
    id: 5,
    speciesList: speciesPatches as Partial<
      Record<SpeciesId, Partial<Species>>
    > as typeof GENERATION1.speciesList,
    moveList: movePatches as typeof GENERATION1.moveList,
    lastMoveIdx: GENERATION1.moveList.zenheadbutt.idx!,
    lastPokemon: 649,
    moveFunctions: moveFunctionPatches as typeof GENERATION1.moveFunctions,
    items: createItemMergeList(items),
  };

  return merge(patches as any, GENERATION4);
};

export const GENERATION5 = createGeneration();
