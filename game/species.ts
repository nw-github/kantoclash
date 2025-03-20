import type {MoveId} from "./moves";
import type {Stats, Type} from "./utils";
import __speciesList from "./species.json";

export type Species = {
  readonly dexId: number;
  readonly types: readonly [Type, ...Type[]];
  readonly moves: readonly MoveId[];
  readonly stats: Stats;
  readonly name: string;
  readonly evolvesFrom?: SpeciesId;
  readonly evolvesTo?: SpeciesId;
  /** Male part of Ratio | Ex: 87.5 means 87.5% male, 12.5% female */
  readonly genderRatio?: number;
};

export type SpeciesId = keyof typeof __speciesList;

export const speciesList = __speciesList as any as Record<SpeciesId, Species>;
