import type {MoveId} from "./moves";
import type {Stats, Type, Weather} from "./utils";
import __speciesList from "./species.json";
import __abilityList from "./ability.json";
import type {Status} from "./pokemon";

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
  /** Weight in kilograms */
  readonly weight: number;
};

export type SpeciesId = keyof typeof __speciesList;
export type AbilityId = keyof typeof __abilityList;

export type Ability = {
  name: string;
  desc: string;
  negatesWeather?: bool;
  preventsCrit?: bool;
  preventsStatus?: Status;
  pinchBoostType?: Type;
  weatherSpeedBoost?: Weather;
  weatherEva?: Weather;
  startsWeather?: Weather;
};

export const speciesList = __speciesList as Record<SpeciesId, Species>;
export const abilityList = __abilityList as Record<AbilityId, Ability>;
