import speciesPatches from "./species.json";
import items from "./items.json";
import type {Species, SpeciesId} from "../species";
import {merge} from "../gen2";
import {movePatches, moveScripts, moveOverrides} from "./moves";
import {createItemMergeList} from "../gen3";
import {Generation4} from "../gen4";

export class Generation5 extends Generation4 {
  // prettier-ignore
  static override Rng = class extends super.Rng {
  }

  override id = 5;
  override lastMoveIdx = this.moveList.workup.idx!;
  override lastPokemon = 649;
  override rng = new Generation5.Rng();

  constructor() {
    super();
    this.speciesList = merge(
      this.speciesList,
      speciesPatches as Partial<Record<SpeciesId, Partial<Species>>>,
    );
    this.moveList = merge(this.moveList, movePatches);
    this.items = merge(this.items, createItemMergeList(items));
    this.move = merge(this.move, {scripts: moveScripts, overrides: moveOverrides});
  }
}
