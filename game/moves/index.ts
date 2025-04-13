import type {ActivePokemon, Battle} from "../battle";
import type {FailReason, InfoReason, RecoveryReason} from "../events";
import type {Pokemon, Status} from "../pokemon";
import type {StageId, Type, VF, Weather, ScreenId} from "../utils";
import type {Range} from "./moveList";

export * from "./functions";
export * from "./moveList";
export * from "./damaging";

export interface BaseMove {
  readonly idx?: number;
  readonly name: string;
  readonly pp: number;
  readonly type: Type;
  readonly range: Range;
  readonly acc?: number;
  readonly priority?: number;
  readonly power?: number;
  readonly sleepOnly?: bool;
  /** 50% accurate in sun, -- in rain */
  readonly rainAcc?: bool;
  /** Hits users in the semi-invuln state of these moves */
  readonly ignore?: string[] /* MoveId[] */;
  /** Not encoreable */
  readonly noEncore?: bool;
  /** Not callable by metronome */
  readonly noMetronome?: bool;
  /** Not callable by assist */
  readonly noAssist?: bool;
  /** Not callable by sleep talk */
  readonly noSleepTalk?: bool;
  /** Undefined: Inherit from kind, true: affected, false: unaffected */
  readonly protect?: bool;
  readonly whileAsleep?: bool;
  readonly selfThaw?: bool;
  readonly kingsRock?: bool;
  readonly sound?: bool;
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
  readonly weather?: bool;
  readonly range: Range.Self;
}

export interface StageMove extends BaseMove {
  readonly kind: "stage";
  readonly stages: [StageId, number][];
  readonly ignoreSub?: bool;
}

export interface StatusMove extends BaseMove {
  readonly kind: "status";
  readonly status: Status;
  readonly checkType?: bool;
  readonly range: Range.Adjacent | Range.Any;
}

export interface SwitchMove extends BaseMove {
  readonly kind: "switch";
  readonly poke: Pokemon;
  readonly priority: number;
  readonly batonPass: bool;
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
  readonly screen: ScreenId;
}

export interface PhazingMove extends BaseMove {
  readonly kind: "phaze";
}

export interface ProtectMove extends BaseMove {
  readonly kind: "protect";
  readonly endure?: bool;
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
  // user and all allies
  readonly range: Range.Self;
  readonly why: InfoReason;
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
  readonly stages: [StageId, number][];
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
  readonly punish?: bool;
  readonly contact?: bool;
  /** Affected by damp */
  readonly damp?: bool;
  readonly charge?: bool | "sun" | "invuln" | [StageId, number][];
  getPower?(user: Pokemon, target?: Pokemon): number;
  getType?(user: Pokemon, weather?: Weather): Type;
  checkSuccess?(battle: Battle, user: ActivePokemon, targets: ActivePokemon[]): bool;
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

type Effect =
  | Status
  | [StageId, number][]
  | "confusion"
  | "flinch"
  | "thief"
  | "tri_attack"
  | "knockoff";

type Flag =
  | "none"
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
  | "norand"
  | "magnitude"
  | "false_swipe"
  | "rapid_spin"
  | "fury_cutter"
  | "rollout"
  | "minimize"
  | "present"
  | "beatup"
  | "facade"
  | "remove_screens"
  | "smellingsalt"
  | "spitup"
  | "uproar"
  | "revenge";
