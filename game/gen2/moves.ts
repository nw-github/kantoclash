import type { Move, MoveId } from "../moves";

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  thunder: {
    ignore: ["fly"],
    effect: [30, "par"],
  },
};
