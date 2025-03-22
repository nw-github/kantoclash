import type {ActivePokemon, Battle, Screen} from "../battle";
import type {FailReason, RecoveryReason} from "../events";
import type {Pokemon, Status} from "../pokemon";
import type {Stages, Type, VolatileFlag, Weather} from "../utils";
import type {DamagingMove} from "./damaging";

export * from "./damaging";
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
  /** Undefined: Inherit from kind, true: affected, false: unaffected */
  readonly protect?: boolean;
  readonly whileAsleep?: boolean;
  readonly selfThaw?: boolean;
}

export interface CustomMove extends BaseMove {
  readonly kind?: never;

  use?(battle: Battle, user: ActivePokemon, target: ActivePokemon, moveIndex?: number): void;
  exec(battle: Battle, user: ActivePokemon, target: ActivePokemon, moveIndex?: number): void;
}

export interface VolatileFlagMove extends BaseMove {
  readonly kind: "volatile";
  readonly flag: VolatileFlag;
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
}

export interface SwitchMove extends BaseMove {
  readonly kind: "switch";
  readonly poke: Pokemon;
  readonly priority: 2;
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
  | ProtectMove;
