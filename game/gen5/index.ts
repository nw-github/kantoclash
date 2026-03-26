import speciesPatches from "./species.json";
import items from "./items.json";
import type {Species, SpeciesId} from "../species";
import {merge} from "../gen2";
import {movePatches, moveScripts, moveOverrides} from "./moves";
import {createItemMergeList} from "../gen3";
import {Generation4} from "../gen4";
import type {ActivePokemon, Battle} from "../battle";
import {randChoiceWeighted} from "../utils";

// prettier-ignore
class Rng extends Generation4.Rng {
  override disableTurns(_: Battle) { return 4 + 1; }
  override multiHitCount(battle: Battle) { return randChoiceWeighted(battle.rng, [2, 3, 4, 5], [35, 35, 15, 15]); }
  override bindingMoveTurns(battle: Battle, user: ActivePokemon) {
    if (user.base.itemId === "gripclaw") {
      return 7 + 1;
    }
    return super.bindingMoveTurns(battle, user);
  }
}

export class Generation5 extends Generation4 {
  static override Rng = Rng;

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
