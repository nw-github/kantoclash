import type { BattleEvent, DamageEvent, InfoReason, RecoverEvent } from "~/game/events";
import type { MoveId } from "~/game/moveList";
import type { Status } from "~/game/pokemon";

export type RawUIBattleEvent =
  | BattleEvent
  | RetractEvent
  | SubBroke
  | FaintEvent
  | GetSubstitute
  | UIDamageEvent
  | UIRecoverEvent;
export type UIBattleEvent = RawUIBattleEvent & { time: number } & { [id: string]: string };

export type RetractEvent = {
  type: "retract";
  src: string;
  name: string;
};

export type SubBroke = {
  type: "sub_break";
  target: string;
};

export type FaintEvent = {
  type: "faint";
  src: string;
};

export type GetSubstitute = {
  type: "get_sub";
  src: string;
};

export type UIDamageEvent = DamageEvent & { maxHp?: number };
export type UIRecoverEvent = RecoverEvent & { maxHp?: number };

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
  forfeit: "{} forfeit the match.",
  forfeit_timer: "{} ran out of time.",
};
