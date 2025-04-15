import type {Move, MoveFunctions, MoveId} from "../moves";

/**
 * Flags: bugbite, assurance
 *
 *
 */

export const moveFunctionPatches: Partial<MoveFunctions> = {};

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {};
