import type {Screen} from "~/game/battle";
import type {
  BattleEvent,
  BugType,
  DamageEvent,
  InfoReason,
  RecoverEvent,
  ScreenEvent,
  WeatherEvent,
} from "~/game/events";
import type {MoveId} from "~/game/moves";
import type {Status} from "~/game/pokemon";
import type {Weather} from "~/game/utils";

export type RawUIBattleEvent =
  | BattleEvent
  | RetractEvent
  | SubBroke
  | GetSubstitute
  | UIDamageEvent
  | UIRecoverEvent;
export type UIBattleEvent = RawUIBattleEvent & {time: number} & {[id: string]: string};

export type RetractEvent = {type: "retract"; src: string; name: string};

export type SubBroke = {type: "sub_break"; target: string};

export type GetSubstitute = {type: "get_sub"; src: string};

export type UIDamageEvent = DamageEvent & {maxHp?: number};
export type UIRecoverEvent = RecoverEvent & {maxHp?: number};

export const statusTable: Record<Status, string> = {
  psn: "was poisoned",
  par: "was paralyzed",
  slp: "fell asleep",
  frz: "was frozen solid",
  tox: "was badly poisoned",
  brn: "was burned",
};

export const chargeMessage: Partial<Record<MoveId, string>> = {
  skullbash: "{} lowered its head!",
  razorwind: "{} made a whirlwind!",
  skyattack: "{} is glowing!",
  solarbeam: "{} took in sunlight!",
  dig: "{} dug a hole!",
  fly: "{} flew up high!",
};

export const infoMessage: Record<InfoReason, string> = {
  immune: "It doesn't affect {l}...",
  miss: "{} missed!",
  cant_substitute: "{} doesn't have enough HP to create a substitute!",
  has_substitute: "{} already has a substitute!",
  fail_generic: "But it failed!",
  fail_sleep_clause: "But it failed!",
  whirlwind: "But it failed!",
  flinch: "{} flinched!",
  splash: "No effect!",
  seeded: "{} was seeded!",
  mist_protect: "{} is protected by the mist!",
  safeguard_protect: "{} is protected by Safeguard!",
  mist: "{}'s shrouded in mist!",
  light_screen: "{}'s protected against special attacks!",
  reflect: "{} is gained armor!",
  focus: "{} is getting pumped!",
  payday: "Coins scattered everywhere!",
  became_confused: "{} became confused!",
  confused: "{} is confused!",
  confused_end: "{}'s confused no more!",
  recharge: "{} must recharge!",
  frozen: "{} is frozen solid!",
  sleep: "{} is fast asleep!",
  wake: "{} woke up!",
  haze: "All status changes were removed!",
  thaw: "{} thawed out!",
  paralyze: "{}'s fully paralyzed!",
  rage: "{}'s rage is building!",
  disable_end: "{}'s disabled no more!",
  bide: "{} unleashed energy!",
  trapped: "{} can't move!",
  ff: "{} forfeit the match.",
  ff_timer: "{} ran out of time.",
  faint: "{} fainted!",
  attract: "{} fell in love!",
  immobilized: "{} is immobilized by love!",
  destinyBond: "{} is trying to take its foe with it!",
  protect: "{} protected itself!",
  endure: "{} braced itself!",
  endure_hit: "{} endured the hit!",
  encore: "{} received an encore!",
  encore_end: "{}'s encore ended!",
  meanLook: "{} can no longer escape!",

  substitute: "",
  curse: "",
  none: "",
  disabled: "",
};

export const weatherMessage: Record<Weather, Record<WeatherEvent["kind"], string>> = {
  rain: {
    start: "A downpour started!",
    continue: "Rain continues to fall.",
    end: "The rain stopped.",
  },
  sun: {
    start: "The sunlight got bright!",
    continue: "The sunlight is strong.",
    end: "The sunlight faded.",
  },
  sand: {
    start: "A sandstorm brewed!",
    continue: "The sandstorm rages.",
    end: "The sandstorm subsided.",
  },
};

export const screenMessage: Record<Screen, Record<ScreenEvent["kind"], string>> = {
  safeguard: {
    start: "{} became cloaked in a mystical veil!",
    end: "{}'s Safeguard wore off...",
  },
  light_screen: {
    start: "Light Screen raised {l}'s Special Defense!",
    end: "{}'s Light Screen wore off...",
  },
  reflect: {
    start: "Reflect raised {l}'s Defense!",
    end: "{}'s Reflect wore off...",
  },
};

export const bugMessage: Record<BugType, string> = {
  bug_gen2_bellydrum: "In Gen 2, Belly Drum still raises Atk by 2 on failure due to a bug.",
};
