import type {Battle, Battlemon} from "./battle";
import type {DamagingMove} from "./moves";
import type {Type} from "./utils";

export type BoostedAttackParams = BoostedDefenseParams & {type: Type};

export type BoostedDefenseParams = {
  battle: Battle;
  user: Battlemon;
  target: Battlemon;
  move: DamagingMove;
  isCrit?: bool;
};

export type BoostedPowerParams = BoostedDefenseParams & {type: Type; power: number};

export interface Calc {
  getBoostedAttack({battle, user, target, isCrit, move, type}: BoostedAttackParams): {
    atk: number;
    spa: number;
  };
  getBoostedDefense({battle, user, target, isCrit, move}: BoostedDefenseParams): {
    def: number;
    spd: number;
  };
  getBoostedPower({move, battle, user, target, type, power}: BoostedPowerParams): number;
}
