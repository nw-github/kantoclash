import type {Move, MoveFunctions, MoveId} from "../moves";

export const moveFunctionPatches: Partial<MoveFunctions> = {};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {};
