import type {ActivePokemon, Battle} from "../battle";
import type {FailReason, InfoReason, RecoveryReason} from "../events";
import type {Pokemon, Status} from "../pokemon";
import type {Stages, Type, VF, Weather, Screen} from "../utils";
import type {Range} from "./moveList";

export * from "../gen1/damaging";
export * from "./functions";
export * from "./moveList";

export interface BaseMove {
  readonly idx?: number;
  readonly name: string;
  readonly pp: number;
  readonly type: Type;
  readonly range: Range;
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
  readonly sound?: boolean;
}

export interface CustomMove extends BaseMove {
  readonly kind?: never;
  exec(battle: Battle, user: ActivePokemon, targets: ActivePokemon[], moveIndex?: number): void;
}

export interface VolatileFlagMove extends BaseMove {
  readonly kind: "volatile";
  readonly flag: VF;
  readonly range: Range.Self;
}

export interface ConfuseMove extends BaseMove {
  readonly kind: "confuse";
  readonly range: Range.Adjacent | Range.AllAdjacent;
}

export interface RecoveryMove extends BaseMove {
  readonly kind: "recover";
  readonly why: RecoveryReason;
  readonly weather?: boolean;
  readonly range: Range.Self;
}

export interface StageMove extends BaseMove {
  readonly kind: "stage";
  readonly stages: [Stages, number][];
  readonly ignoreSub?: bool;
}

export interface StatusMove extends BaseMove {
  readonly kind: "status";
  readonly status: Status;
  readonly checkType?: boolean;
  readonly range: Range.Adjacent | Range.Any;
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
  readonly range: Range.Adjacent;
}

export interface LockOnMove extends BaseMove {
  readonly kind: "lockOn";
  readonly range: Range.Adjacent;
}

export interface HealBellMove extends BaseMove {
  readonly kind: "healbell";
  readonly range: Range.AllAllies;
}

export interface FutureSightMove extends BaseMove {
  readonly kind: "futuresight";
  readonly range: Range.Adjacent;
  readonly power: number;
  readonly msg: InfoReason;
  readonly release: InfoReason;
}

export interface SwaggerMove extends BaseMove {
  readonly kind: "swagger";
  readonly range: Range.Adjacent;
  readonly stages: [Stages, number][];
}

export interface ForesightMove extends BaseMove {
  readonly kind: "foresight";
  readonly range: Range.Adjacent;
  readonly protect: true;
}

export interface DamagingMove extends BaseMove {
  readonly kind: "damage";
  readonly power: number;
  readonly flag?: Flag;
  readonly effect?: [number, Effect] | [number, Effect, true];
  /** Recoil: max(1 / recoil, 1) */
  readonly recoil?: number;
  readonly punish?: boolean;
  readonly contact?: boolean;
  readonly charge?: boolean | "sun" | "invuln" | [Stages, number][];
  getPower?(user: Pokemon): number;
  getType?(user: Pokemon, weather?: Weather): Type;
  /** If a number, the amount of damage the move should do. If a function, returns the amount of
   * damage done by the move, or 0 if the move failed.
   */
  readonly getDamage?:
    | number
    | ((battle: Battle, user: ActivePokemon, target: ActivePokemon) => number);
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
  | LockOnMove
  | HealBellMove
  | FutureSightMove
  | SwaggerMove
  | ForesightMove;

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
