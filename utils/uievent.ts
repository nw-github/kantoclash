import type {
  BattleEvent,
  BugType,
  DamageEvent,
  DamageReason,
  InfoReason,
  PokeId,
  RecoverEvent,
  ScreenEvent,
  WeatherEvent,
} from "~/game/events";
import type {MoveId} from "~/game/moves";
import type {Status} from "~/game/pokemon";
import type {Weather, Screen} from "~/game/utils";

export type RawUIBattleEvent =
  | BattleEvent
  | RetractEvent
  | SubBroke
  | GetSubstitute
  | UIDamageEvent
  | UIRecoverEvent;
export type UIBattleEvent = RawUIBattleEvent & {time: number} & {[id: string]: string};

export type RetractEvent = {type: "retract"; src: PokeId; name: string};

export type SubBroke = {type: "sub_break"; target: PokeId};

export type GetSubstitute = {type: "get_sub"; src: PokeId};

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

export const statusNameTable: Record<Status, string> = {
  psn: "poison",
  par: "paralysis",
  slp: "sleep",
  frz: "freeze",
  tox: "poison",
  brn: "burn",
};

export const chargeMessage: Partial<Record<MoveId, string>> = {
  skullbash: "{} lowered its head!",
  razorwind: "{} made a whirlwind!",
  skyattack: "{} is glowing!",
  solarbeam: "{} took in sunlight!",
  dig: "{} dug a hole!",
  fly: "{} flew up high!",
  dive: "{} hid underwater!",
};

export const infoMessage: Record<InfoReason, string> = {
  immune: "It doesn't affect {l}...",
  miss: "{} missed!",
  cant_substitute: "{} doesn't have enough HP to create a substitute!",
  has_substitute: "{} already has a substitute!",
  fail_generic: "But it failed!",
  fail_notarget: "But there was no target...",
  fail_sleep_clause: "But it failed!",
  whirlwind: "But it failed!",
  fail_focus: "{} lost its focus and couldn't move!",
  flinch: "{} flinched!",
  splash: "No effect!",
  cSeeded: "{} was seeded!",
  mist_protect: "{} is protected by the mist!",
  safeguard_protect: "{} is protected by Safeguard!",
  mist: "{}'s shrouded in mist!",
  lightScreen: "{}'s protected against special attacks!",
  reflect: "{} is gained armor!",
  focus: "{} is getting pumped!",
  payday: "Coins scattered everywhere!",
  cConfused: "{} became confused!",
  cConfusedFatigue: "{} became confused due to fatigue!",
  cConfusedFatigueMax: "{} became confused due to fatigue!",
  confused: "{} is confused!",
  confused_end: "{} is no longer confused!",
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
  bide_store: "{} is storing energy!",
  trapped: "{} can't move!",
  faint: "{} fainted!",
  cAttract: "{} fell in love!",
  immobilized: "{} is immobilized by love!",
  destinyBond: "{} is trying to take its foe with it!",
  grudge: "{} wants the opponent to bear a grudge!",
  protect: "{} protected itself!",
  endure: "{} braced itself!",
  endure_hit: "{} endured the hit!",
  cEncore: "{} received an encore!",
  encore_end: "{}'s encore ended!",
  cMeanLook: "{} can no longer escape!",
  nightmare: "{} fell into a nightmare!",
  heal_bell: "A bell chimed!",
  pain_split: "The battlers shared their pain!",
  perish_song: "All affected pokemon will faint in three turns!",
  future_sight: "{} foresaw an attack!",
  future_sight_release: "{} took the Future Sight attack!",
  doom_desire: "{} chose Doom Desire as its destiny!",
  doom_desire_release: "{} took the Doom Desire attack!",
  withdraw: "({} is trying to switch out...)",
  fail_present: "{} couldn't receive the gift!",
  endure_band: "{} held on using its Focus Band!",
  wont_flinch: "{} wont flinch!",
  ingrain: "{} planted its roots!",
  cTaunt: "{} fell for the taunt!",
  taunt_end: "{}'s taunt wore off...",
  begin_focuspunch: "{} is tightening its focus!",
  wish: "{} made a wish!",
  cDrowsy: "{} grew drowsy!",
  charge: "{} began charging power!",
  mudSport: "Electricity's power was weakened!",
  waterSport: "Fire's power was weakened!",
  followMe: "{} became the center of attention!",
  not_confused: "{} was not confused!",
  loafing: "{} is loafing around!",
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
  hail: {
    start: "It started to hail!",
    continue: "Hail continues to fall.",
    end: "The hail stopped.",
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
  mist: {
    start: "{} became shrouded in Mist!",
    end: "{}'s Mist wore off...",
  },
};

export const damageMessage: Partial<Record<DamageReason, string>> = {
  recoil: "{} was hurt by recoil!",
  psn: "{} is hurt by poison!",
  brn: "{} is hurt by its burn!",
  spikes: "{} is hurt by the spikes!",
  confusion: "It hurt itself in its confusion!",
  crash: "{} kept going and crashed!",
  trap: "{}'s attack continues!",
  ohko: "It's a one-hit KO!",
  nightmare: "{} is locked in a Nightmare!",
  sand: "{} is buffeted by the sandstorm!",
  hail: "{} is buffeted by the hail!",
  seeded: "{}'s health was sapped by Leech Seed!",
  belly_drum: "{} cut its own HP and maximized its Attack!",
  set_curse: "{t} cut its own HP and laid a curse on {l}!",
  curse: "{} is afflicted by the Curse!",
  destiny_bond: "{} took {tl} with it!",
  roughskin: "{t} was hurt!",
};

export const trapStart: Partial<Record<MoveId, string>> = {
  wrap: "{t} was wrapped by {s}!",
  whirlpool: "{t} was trapped in the vortex!",
  bind: "{t} was squeezed by {s}!",
  clamp: "{t} was clamped by {s}!",
  firespin: "{t} was trapped in the vortex!",
  sandtomb: "{t} was trapped by Sand Tomb!",
};

export const bugMessage: Record<BugType, string> = {
  bug_gen2_bellydrum: "In Gen 2, Belly Drum still raises Atk by 2 on failure due to a bug.",
  bug_gen2_spikes:
    "In Gen 2, Pokémon take damage but do not faint after a previous Pokémon fainted to certain end-of-turn effects.",
};
