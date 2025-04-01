import type {MoveId} from "./moves";
import type {Stats, Type} from "./utils";
import __speciesList from "./species.json";
import abilityList from "./ability.json";

export type Species = {
  readonly dexId: number;
  readonly types: readonly Type[];
  readonly moves: readonly MoveId[];
  readonly abilities: readonly AbilityId[];
  readonly stats: Stats;
  readonly name: string;
  readonly evolvesFrom?: SpeciesId;
  readonly evolvesTo?: SpeciesId | SpeciesId[];
  /** Male part of Ratio | Ex: 87.5 means 87.5% male, 12.5% female. Undefined for Gender Unknown */
  readonly genderRatio?: number;
  readonly sprite?: string;
};

export type SpeciesId = keyof typeof __speciesList;
export type AbilityId = keyof typeof abilityList;

export const speciesList = __speciesList as Record<SpeciesId, Species>;
export {abilityList};
