import type {ClientVolatiles} from "~/utils/shared";
import type {Screen} from "./battle";
import type {MoveId} from "./moves";
import type {Gender, Status} from "./pokemon";
import type {SpeciesId} from "./species";
import type {Stages, Type, VolatileFlag, Weather} from "./utils";

type NullOrOptional<T> = {[P in keyof T]?: T[P] | null};

type AnyEvent =
  | SwitchEvent
  | DamageEvent
  | RecoverEvent
  | UseMoveEvent
  | VictoryEvent
  | HitSubstituteEvent
  | StatusEvent
  | StagesEvent
  | InfoEvent
  | SrcTargetEvent
  | DisableEvent
  | ChargeEvent
  | MimicEvent
  | ConversionEvent
  | MagnitudeEvent
  | WeatherEvent
  | ScreenEvent
  | SetVolatilesEvent
  | BugEvent
  | SpiteEvent
  | SketchEvent
  | PerishSongEvent;

export type ChangedVolatiles = {id: PlayerId; v: NullOrOptional<ClientVolatiles>}[];

export type BattleEvent = AnyEvent & {volatiles?: ChangedVolatiles};

export type PlayerId = string;

type SwitchEvent = {
  type: "switch";
  src: PlayerId;
  speciesId: SpeciesId;
  level: number;
  hpPercent: number;
  hp?: number;
  name: string;
  indexInTeam: number;
  gender?: Gender;
  shiny?: boolean;
  why?: "phaze" | "baton_pass";
};

export type DamageReason =
  | "attacked"
  | "substitute"
  | "recoil"
  | "explosion"
  | "crash"
  | "ohko"
  | "seeded"
  | "psn"
  | "brn"
  | "confusion"
  | "trap"
  | "sandstorm"
  | "belly_drum"
  | "set_curse"
  | "curse"
  | "nightmare"
  | "destiny_bond"
  | "pain_split"
  | "perish_song"
  | "future_sight"
  | "spikes";

export type RecoveryReason =
  | "drain"
  | "recover"
  | "rest"
  | "seeder"
  | "pain_split"
  | "pain_split_enemy";

export type DamageEvent = {
  type: "damage";
  src: PlayerId;
  target: PlayerId;
  hpPercentBefore: number;
  hpPercentAfter: number;
  hpBefore?: number;
  hpAfter?: number;
  isCrit: boolean;
  why: DamageReason;
  /**
   * undefined: this is the one and only hit of a normal attack
   * 0:         this is one, non-final hit of a multi-hit attack
   * *:         this is the count of hits on the final hit of a multi-hit attack
   */
  hitCount?: number;
  eff?: number;
};

export type RecoverEvent = {
  type: "recover";
  src: PlayerId;
  target: PlayerId;
  hpPercentBefore: number;
  hpPercentAfter: number;
  hpBefore?: number;
  hpAfter?: number;
  why: RecoveryReason;
};

export type HitSubstituteEvent = {
  type: "hit_sub";
  src: PlayerId;
  target: PlayerId;
  broken: boolean;
  confusion: boolean;
  hitCount?: number;
  eff?: number;
};

type UseMoveEvent = {type: "move"; src: PlayerId; move: MoveId; disabled?: true; thrashing?: true};

export type VictoryEvent = {
  type: "end";
  /// If victor is undefined, the battle is a draw
  victor?: PlayerId;
  why?: "endless" | "too_long" | "timer";
};

type StatusEvent = {type: "status"; src: PlayerId; status: Status};

type StagesEvent = {type: "stages"; src: PlayerId; stat: Stages; count: number};

export type FailReason =
  | "immune"
  | "miss"
  | "fail_generic"
  | "fail_sleep_clause"
  | "has_substitute"
  | "cant_substitute"
  | "flinch"
  | "mist_protect"
  | "safeguard_protect"
  | "splash"
  | "whirlwind";

export type BugType = "bug_gen2_bellydrum" | "bug_gen2_spikes";

type VF = Exclude<
  keyof typeof VolatileFlag,
  "substitute" | "curse" | "none" | "disabled" | "foresight" | "lockon"
>;

export type InfoReason =
  | FailReason
  | VF
  | "payday"
  | "became_confused"
  | "confused"
  | "confused_end"
  | "recharge"
  | "frozen"
  | "sleep"
  | "wake"
  | "haze"
  | "thaw"
  | "paralyze"
  | "rage"
  | "disable_end"
  | "bide"
  | "trapped"
  | "ff"
  | "ff_timer"
  | "faint"
  | "attract"
  | "immobilized"
  | "endure_hit"
  | "encore_end"
  | "heal_bell"
  | "pain_split"
  | "perish_song"
  | "future_sight"
  | "future_sight_release"
  | "withdraw"
  | "spikes"
  | "spin_spikes";

type InfoEvent = {type: "info"; src: PlayerId; why: InfoReason};

type BugEvent = {type: "bug"; bug: BugType};

type SrcTargetEvent = {
  type: "transform" | "in_love" | "psych_up" | "foresight" | "lock_on";
  src: PlayerId;
  target: PlayerId;
};

// For some reason making these 1 thing causes MoveId to become a recursive type
// type SrcMoveEvent = {
//   type: "disable" | "charge" | "sketch" | "mimic";
//   src: PlayerId;
//   move: MoveId;
// };

type DisableEvent = {type: "disable"; src: PlayerId; move: MoveId};
type ChargeEvent = {type: "charge"; src: PlayerId; move: MoveId};
type SketchEvent = {type: "sketch"; src: PlayerId; move: MoveId};
type MimicEvent = {type: "mimic"; src: PlayerId; move: MoveId};

type ConversionEvent = {type: "conversion"; src: PlayerId; target?: PlayerId; types: Type[]};

type MagnitudeEvent = {type: "magnitude"; magnitude: number};

export type ScreenEvent = {type: "screen"; kind: "start" | "end"; screen: Screen; src: PlayerId};

type SetVolatilesEvent = {type: "sv"};

type SpiteEvent = {type: "spite"; src: PlayerId; move: MoveId; amount: number};

export type WeatherEvent = {type: "weather"; kind: "start" | "end" | "continue"; weather: Weather};

type PerishSongEvent = {type: "perish"; src: PlayerId; turns: number};
