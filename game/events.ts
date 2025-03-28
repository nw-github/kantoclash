import type {ClientVolatiles} from "~/utils/shared";
import type {MoveId} from "./moves";
import type {Gender, Status} from "./pokemon";
import type {SpeciesId} from "./species";
import type {Stages, Type, VF, Weather, Screen} from "./utils";
import type {ItemId} from "./item";

type NullOrOptional<T> = {[P in keyof T]?: T[P] | null};

type AnyEvent =
  | NextTurnEvent
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
  | PerishSongEvent
  | TrapEvent
  | BeatUpEvent
  | UseItemEvent
  | RestorePPEvent
  | ThiefEvent
  | ForfeitEvent
  | BatonPass;

export type ChangedVolatiles = {id: PlayerId; v: NullOrOptional<ClientVolatiles>}[];

export type BattleEvent = AnyEvent & {volatiles?: ChangedVolatiles};

export type PlayerId = string;

type NextTurnEvent = {type: "next_turn"; turn: number};

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
  | "spikes"
  | "trap_eot";

export type RecoveryReason =
  | "drain"
  | "recover"
  | "rest"
  | "seeder"
  | "pain_split"
  | "present"
  | "leftovers"
  | "item";

export type DamageEvent = {
  type: "damage";
  src: PlayerId;
  target: PlayerId;
  hpPercentBefore: number;
  hpPercentAfter: number;
  hpBefore?: number;
  hpAfter?: number;
  isCrit?: boolean;
  why: DamageReason;
  /* when why === "trap", this is a moveId */
  move?: string;
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

type StatusEvent = {type: "status" | "cure"; src: PlayerId; status: Status};

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

type VFReason = Exclude<
  keyof typeof VF,
  "cSubstitute" | "curse" | "none" | "cDisabled" | "foresight" | "lockon"
>;

export type InfoReason =
  | FailReason
  | VFReason
  | "payday"
  | "cConfusedFatigue"
  | "cConfusedFatigueMax"
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
  | "bide_store"
  | "trapped"
  | "faint"
  | "immobilized"
  | "endure_hit"
  | "endure_band"
  | "encore_end"
  | "heal_bell"
  | "pain_split"
  | "perish_song"
  | "future_sight"
  | "future_sight_release"
  | "withdraw"
  | "spikes"
  | "spin_spikes"
  | "fail_present";

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

type TrapEvent = {
  type: "trap";
  kind: "start" | "end";
  src: PlayerId;
  target: PlayerId;
  move: MoveId;
};

type ConversionEvent = {type: "conversion"; src: PlayerId; target?: PlayerId; types: Type[]};

type MagnitudeEvent = {type: "magnitude"; magnitude: number};

export type ScreenEvent = {type: "screen"; kind: "start" | "end"; screen: Screen; src: PlayerId};

type SetVolatilesEvent = {type: "sv"};

type SpiteEvent = {type: "spite"; src: PlayerId; move: MoveId; amount: number};

type BeatUpEvent = {type: "beatup"; name: string};

export type WeatherEvent = {type: "weather"; kind: "start" | "end" | "continue"; weather: Weather};

type PerishSongEvent = {type: "perish"; src: PlayerId; turns: number};

type UseItemEvent = {
  type: "item";
  src: PlayerId;
  item: ItemId;
};

type RestorePPEvent = {
  type: "pp";
  src: PlayerId;
  move: MoveId;
};

type ThiefEvent = {
  type: "thief";
  src: PlayerId;
  target: PlayerId;
  item: ItemId;
};

type ForfeitEvent = {
  type: "forfeit";
  user: PlayerId;
  timer: boolean;
};

type BatonPass = {type: "baton_pass"; src: PlayerId};
