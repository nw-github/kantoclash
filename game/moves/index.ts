import type {ActivePokemon, Battle} from "../battle";
import type {FailReason, RecoveryReason} from "../events";
import type {Pokemon, Status} from "../pokemon";
import type {Stages, Type, VF, Weather, Screen} from "../utils";

export * from "../gen1/damaging";
export * from "./functions";
export * from "./moveList";

export interface BaseMove {
  readonly idx?: number;
  readonly name: string;
  readonly pp: number;
  readonly type: Type;
  readonly acc?: number;
  readonly priority?: number;
  readonly power?: number;
  readonly sleepOnly?: boolean;
  /** 50% accurate in sun, -- in rain */
  readonly rainAcc?: boolean;
  /** Hits users in the semi-invuln state of these moves */
  readonly ignore?: string[] /* MoveId[] */;
  /** Not callable by metronome */
  readonly noMetronome?: boolean;
  /** Not encoreable */
  readonly noEncore?: boolean;
  /** Unselectable for sleep talk */
  readonly noSleepTalk?: boolean;
  /** Undefined: Inherit from kind, true: affected, false: unaffected */
  readonly protect?: boolean;
  readonly whileAsleep?: boolean;
  readonly selfThaw?: boolean;
  readonly kingsRock?: boolean;
}

export interface CustomMove extends BaseMove {
  readonly kind?: never;

  use?(battle: Battle, user: ActivePokemon, target: ActivePokemon, moveIndex?: number): void;
  exec(battle: Battle, user: ActivePokemon, target: ActivePokemon, moveIndex?: number): void;
}

export interface VolatileFlagMove extends BaseMove {
  readonly kind: "volatile";
  readonly flag: VF;
}

export interface ConfuseMove extends BaseMove {
  readonly kind: "confuse";
}

export interface RecoveryMove extends BaseMove {
  readonly kind: "recover";
  readonly why: RecoveryReason;
  readonly weather?: boolean;
}

export interface StageMove extends BaseMove {
  readonly kind: "stage";
  readonly stages: [Stages, number][];
}

export interface StatusMove extends BaseMove {
  readonly kind: "status";
  readonly status: Status;
  readonly checkType?: boolean;
}

export interface SwitchMove extends BaseMove {
  readonly kind: "switch";
  readonly poke: Pokemon;
  readonly priority: number;
  readonly batonPass: boolean;
}

export interface FailMove extends BaseMove {
  readonly kind: "fail";
  readonly why: FailReason;
}

export interface WeatherMove extends BaseMove {
  readonly kind: "weather";
  readonly weather: Weather;
}

export interface ScreenMove extends BaseMove {
  readonly kind: "screen";
  readonly screen: Screen;
}

export interface PhazingMove extends BaseMove {
  readonly kind: "phaze";
}

export interface ProtectMove extends BaseMove {
  readonly kind: "protect";
  readonly endure?: boolean;
}

export interface PreventEscapeMove extends BaseMove {
  readonly kind: "noSwitch";
}

export interface LockOnMove extends BaseMove {
  readonly kind: "lockOn";
}

export interface DamagingMove extends BaseMove {
  readonly kind: "damage";
  readonly power: number;
  readonly flag?: Flag;
  readonly effect?: [number, Effect] | [number, Effect, true];
  /** Recoil: max(1 / recoil, 1) */
  readonly recoil?: number;
  readonly punish?: boolean;
  readonly charge?: boolean | "sun" | "invuln" | [Stages, number][];
  getPower?(user: Pokemon): number;
  getType?(user: Pokemon): Type;
  /** If a number, the amount of damage the move should do. If a function, returns the amount of
   * damage done by the move, or false if the move failed.
   */
  readonly getDamage?:
    | number
    | ((battle: Battle, user: ActivePokemon, target: ActivePokemon) => number | false);
}

export type Move =
  | CustomMove
  | VolatileFlagMove
  | ConfuseMove
  | DamagingMove
  | RecoveryMove
  | StageMove
  | StatusMove
  | SwitchMove
  | FailMove
  | WeatherMove
  | ScreenMove
  | PhazingMove
  | ProtectMove
  | PreventEscapeMove
  | LockOnMove;

type Effect = Status | [Stages, number][] | "confusion" | "flinch" | "thief" | "tri_attack";

type Flag =
  | "high_crit"
  | "drain"
  | "explosion"
  | "recharge"
  | "crash"
  | "double"
  | "triple"
  | "multi"
  | "dream_eater"
  | "bide"
  | "payday"
  | "multi_turn"
  | "rage"
  | "trap"
  | "ohko"
  | "flail"
  | "magnitude"
  | "false_swipe"
  | "rapid_spin"
  | "fury_cutter"
  | "rollout"
  | "minimize"
  | "present"
  | "beatup";
