import type {MoveId} from "./moves";
import type {Gender, Status} from "./pokemon";
import type {AbilityId, SpeciesId} from "./species";
import type {StageId, Type, VF, Weather, ScreenId, HazardId} from "./utils";
import type {ItemId} from "./item";
import type {VolatileDiff} from "./active";

type AnyEvent =
  | NextTurnEvent
  | SwitchEvent
  | DamageEvent
  | RecoverEvent
  | UseMoveEvent
  | EndBattleEvent
  | HitSubstituteEvent
  | StatusEvent
  | StagesEvent
  | InfoEvent
  | SrcTargetEvent
  | DisableEvent
  | ChargeEvent
  | MimicEvent
  | CantUseEvent
  | GrudgeEvent
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
  | ItemEvent
  | RestorePPEvent
  | ThiefEvent
  | TrickEvent
  | ForfeitEvent
  | SpikesEvent
  | ProcAbilityEvent
  | AbilityEvent
  | StockPileEvent
  | TransformEvent
  | BounceEvent
  | FutureSightEvent
  | MoldBreakerEvent;

export type ChangedVolatiles = {id: PokeId; v: VolatileDiff}[];

export type BattleEvent = AnyEvent & {volatiles?: ChangedVolatiles};

export type PlayerId = string;
export type PokeId = `${PlayerId}:${number}`;

type NextTurnEvent = {type: "next_turn"; turn: number};

export type SwitchEvent = {
  type: "switch";
  src: PokeId;
  speciesId: SpeciesId;
  level: number;
  hpPercent: number;
  hp: number;
  name: string;
  indexInTeam: number;
  gender: Gender;
  shiny: bool;
  why?: "phaze" | "batonpass" | "uturn";
};

type TransformEvent = {
  type: "transform";
  src: PokeId;
  target?: PokeId;
  speciesId: SpeciesId;
  shiny: bool;
  gender: Gender;
  ability?: AbilityId;
  permanent?: bool;
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
  | "sand"
  | "hail"
  | "belly_drum"
  | "set_curse"
  | "curse"
  | "nightmare"
  | "destiny_bond"
  | "pain_split"
  | "perish_song"
  | "future_sight"
  | "spikes"
  | "rocks"
  | "trap_eot"
  | "roughskin"
  | "baddreams"
  | "lifeorb";

export type RecoveryReason =
  | "drain"
  | "recover"
  | "rest"
  | "seeder"
  | "pain_split"
  | "present"
  | "leftovers"
  | "shellbell"
  | "item"
  | "ingrain"
  | "aquaRing"
  | "none"
  | `wish:${string}`;

export type DamageEvent = {
  type: "damage";
  src: PokeId;
  target: PokeId;
  hpPercentBefore: number;
  hpPercentAfter: number;
  hpBefore: number;
  hpAfter: number;
  isCrit?: bool;
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
  hpBefore: number;
  hpAfter: number;
  why: RecoveryReason;
};

export type HitSubstituteEvent = {
  type: "hit_sub";
  src: PokeId;
  target: PokeId;
  broken: bool;
  confusion: bool;
  hitCount?: number;
  eff?: number;
};

type UseMoveEvent = {
  type: "move";
  src: PokeId;
  move: MoveId;
  disabled?: true;
  thrashing?: true;
  called?: bool;
};

export type EndBattleEvent = {
  type: "end";
  /// If victor is undefined, the battle is a draw
  victor?: PlayerId;
  why?: "endless" | "too_long" | "timer" | "error";
};

type StatusEvent = {type: "status" | "cure"; src: PokeId; status: Status};

type StagesEvent = {
  type: "stages";
  src: PokeId;
  stat: StageId;
  /**
   * -6 and +6 are sentinel values meaning stat too low and stat too high respectively
   * 0 means the stat couldn't be lowered due to an ability
   */
  count: number;
};

export type FailReason =
  | "immune"
  | "fail_generic"
  | "fail_notarget"
  | "fail_sleep_clause"
  | "fail_present"
  | "fail_focus"
  | "has_substitute"
  | "cant_substitute"
  | "flinch"
  | "mist_protect"
  | "safeguard_protect"
  | "splash"
  | "whirlwind"
  | "fail_unimplemented";

export type BugType = "bug_gen2_bellydrum" | "bug_gen2_spikes";

type VFReason = Exclude<
  keyof typeof VF,
  | "curse"
  | "none"
  | "disabled"
  | "identified"
  | "lockon"
  | "helpingHand"
  | "flashFire"
  | "roost"
  | "minimize"
  | "defenseCurl"
>;

export type InfoReason =
  | FailReason
  | VFReason
  | "payday"
  | "become_confused"
  | "fatigue_confuse"
  | "fatigue_confuse_max"
  | "seeded"
  | "encore"
  | "taunt"
  | "drowsy"
  | "meanlook"
  | "attract"
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
  | "taunt_end"
  | "bide"
  | "bide_store"
  | "trapped"
  | "faint"
  | "immobilized"
  | "uproar"
  | "uproar_continue"
  | "uproar_end"
  | "batonpass"
  | "uturn"
  | "endure_hit"
  | "endure_band"
  | "encore_end"
  | "heal_bell"
  | "aromatherapy"
  | "pain_split"
  | "perish_song"
  | "withdraw"
  | "wont_flinch"
  | "miss"
  | "begin_focuspunch"
  | "not_confused"
  | "wish"
  | "cure_attract"
  | "pressure"
  | "atk_maximize"
  | "quickclaw"
  | "heartswap"
  | "powerswap"
  | "guardswap"
  | "healingwish"
  | "lunardance"
  | "magnet_rise"
  | "magnet_rise_end"
  | "worryseed"
  | "gravity_grounded"
  | "embargo"
  | "embargo_end";

type InfoEvent = {type: "info"; src: PokeId; why: InfoReason};

type BugEvent = {type: "bug"; bug: BugType};

type MoldBreakerEvent = {type: "moldbreaker"; src: PokeId; ability: AbilityId};

type SrcTargetEvent = {
  type:
    | "in_love"
    | "psych_up"
    | "foresight"
    | "lock_on"
    | "miss"
    | "helping_hand"
    | "skill_swap"
    | "snatch";
  src: PokeId;
  target: PokeId;
};

type SpikesEvent = {
  type: "hazard";
  src: PokeId;
  player: PlayerId;
  hazard: HazardId;
  spin: bool;
};

// For some reason making these 1 thing causes MoveId to become a recursive type
// type SrcMoveEvent = {
//   type: "disable" | "charge" | "sketch" | "mimic";
//   src: PokeId;
//   move: MoveId;
// };

type DisableEvent = {type: "disable"; src: PokeId; move: MoveId};
type ChargeEvent = {type: "charge"; src: PokeId; move: MoveId; called?: bool};
type SketchEvent = {type: "sketch"; src: PokeId; move: MoveId; moveIndex: number};
type MimicEvent = {type: "mimic"; src: PokeId; move: MoveId};
type CantUseEvent = {
  type: "cantuse";
  src: PokeId;
  move: MoveId;
  why: "gravity" | "taunt" | "generic";
};
type GrudgeEvent = {type: "grudge"; src: PokeId; move: MoveId};
type RestorePPEvent = {type: "pp"; src: PokeId; move: MoveId};
type BounceEvent = {type: "bounce"; src: PokeId; move: MoveId};
type FutureSightEvent = {type: "futuresight"; src: PokeId; move: MoveId; release: bool};

type TrapEvent = {
  type: "trap";
  kind: "start" | "end";
  src: PokeId;
  target: PokeId;
  move: MoveId;
};

type ConversionEvent = {type: "conversion"; src: PokeId; target?: PokeId; types: Type[]};

type MagnitudeEvent = {type: "magnitude"; magnitude: number};

export type ScreenEvent = {
  type: "screen";
  kind: "start" | "end" | "shattered";
  screen: ScreenId;
  user: PlayerId;
};

type SetVolatilesEvent = {type: "sv"};

type SpiteEvent = {type: "spite"; src: PokeId; move: MoveId; amount: number};

type BeatUpEvent = {type: "beatup"; name: string};

type FieldCondition = Weather | "gravity" | "trickRoom";

export type WeatherEvent = {
  type: "weather";
  kind: "start" | "end" | "continue";
  weather: FieldCondition;
  src?: PokeId;
};

type PerishSongEvent = {type: "perish"; src: PokeId; turns: number};

type ItemEvent = {
  type: "item" | "recycle";
  src: PokeId;
  item: ItemId;
};

type ThiefEvent = {
  type: "thief" | "knockoff";
  src: PokeId;
  target: PokeId;
  item: ItemId;
};

type TrickEvent = {
  type: "trick";
  src: PokeId;
  target: PokeId;
  srcItem?: ItemId;
  targetItem?: ItemId;
};

type ForfeitEvent = {
  type: "forfeit";
  user: PlayerId;
  timer: bool;
};

type ProcAbilityEvent = {
  type: "proc_ability";
  src: PokeId;
  ability: AbilityId;
};

type AbilityEvent = {
  type: "trace" | "copy_ability";
  src: PokeId;
  target: PokeId;
  ability: AbilityId;
};

type StockPileEvent = {
  type: "stockpile";
  src: PokeId;
  count: number;
};
