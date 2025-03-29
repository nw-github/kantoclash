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
  | BatonPass
  | SpikesEvent;

export type ChangedVolatiles = {id: PokeId; v: NullOrOptional<ClientVolatiles>}[];

export type BattleEvent = AnyEvent & {volatiles?: ChangedVolatiles};

export type PlayerId = string;
export type PokeId = `${PlayerId}:${number}`;

type NextTurnEvent = {type: "next_turn"; turn: number};

type SwitchEvent = {
  type: "switch";
  src: PokeId;
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
  src: PokeId;
  target: PokeId;
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
  src: PokeId;
  target: PokeId;
  hpPercentBefore: number;
  hpPercentAfter: number;
  hpBefore?: number;
  hpAfter?: number;
  why: RecoveryReason;
};

export type HitSubstituteEvent = {
  type: "hit_sub";
  src: PokeId;
  target: PokeId;
  broken: boolean;
  confusion: boolean;
  hitCount?: number;
  eff?: number;
};

type UseMoveEvent = {type: "move"; src: PokeId; move: MoveId; disabled?: true; thrashing?: true};

export type VictoryEvent = {
  type: "end";
  /// If victor is undefined, the battle is a draw
  victor?: PlayerId;
  why?: "endless" | "too_long" | "timer";
};

type StatusEvent = {type: "status" | "cure"; src: PokeId; status: Status};

type StagesEvent = {type: "stages"; src: PokeId; stat: Stages; count: number};

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
  | "fail_present";

type InfoEvent = {type: "info"; src: PokeId; why: InfoReason};

type BugEvent = {type: "bug"; bug: BugType};

type SrcTargetEvent = {
  type: "transform" | "in_love" | "psych_up" | "foresight" | "lock_on";
  src: PokeId;
  target: PokeId;
};

type SpikesEvent = {
  type: "spikes";
  src: PokeId;
  player: PlayerId;
  spin: bool;
};

// For some reason making these 1 thing causes MoveId to become a recursive type
// type SrcMoveEvent = {
//   type: "disable" | "charge" | "sketch" | "mimic";
//   src: PokeId;
//   move: MoveId;
// };

type DisableEvent = {type: "disable"; src: PokeId; move: MoveId};
type ChargeEvent = {type: "charge"; src: PokeId; move: MoveId};
type SketchEvent = {type: "sketch"; src: PokeId; move: MoveId};
type MimicEvent = {type: "mimic"; src: PokeId; move: MoveId};

type TrapEvent = {
  type: "trap";
  kind: "start" | "end";
  src: PokeId;
  target: PokeId;
  move: MoveId;
};

type ConversionEvent = {type: "conversion"; src: PokeId; target?: PokeId; types: Type[]};

type MagnitudeEvent = {type: "magnitude"; magnitude: number};

export type ScreenEvent = {type: "screen"; kind: "start" | "end"; screen: Screen; user: PlayerId};

type SetVolatilesEvent = {type: "sv"};

type SpiteEvent = {type: "spite"; src: PokeId; move: MoveId; amount: number};

type BeatUpEvent = {type: "beatup"; name: string};

export type WeatherEvent = {type: "weather"; kind: "start" | "end" | "continue"; weather: Weather};

type PerishSongEvent = {type: "perish"; src: PokeId; turns: number};

type UseItemEvent = {
  type: "item";
  src: PokeId;
  item: ItemId;
};

type RestorePPEvent = {
  type: "pp";
  src: PokeId;
  move: MoveId;
};

type ThiefEvent = {
  type: "thief";
  src: PokeId;
  target: PokeId;
  item: ItemId;
};

type ForfeitEvent = {
  type: "forfeit";
  user: PlayerId;
  timer: boolean;
};

type BatonPass = {type: "baton_pass"; src: PokeId};
