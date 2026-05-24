import type {
  BattleEvent,
  BugType,
  DamageEvent,
  DamageReason,
  InfoReason,
  PokeId,
  RecoverEvent,
  RecoveryReason,
  ScreenEvent,
  WeatherEvent,
} from "~~/game/events";
import type {ItemId} from "~~/game/item";
import type {MoveId} from "~~/game/moves";
import type {Status} from "~~/game/pokemon";
import type {AbilityId} from "~~/game/species";
import type {ScreenId, HazardId} from "~~/game/utils";

export type RawUIBattleEvent =
  | BattleEvent
  | {type: "retract"; src: PokeId; name: string}
  | {type: "sub_break"; target: PokeId}
  | {type: "eff"; target: PokeId; eff?: number}
  | {
      type: "dmg_reason";
      src: PokeId;
      target: PokeId;
      move?: MoveId;
      why: DamageReason | RecoveryReason;
    }
  | {type: "get_sub"; src: PokeId}
  | {type: "obtain_item"; src: PokeId; item: ItemId}
  | {type: "hit_count"; hitCount: number}
  | {type: "crit"; target: PokeId}
  | {type: "start"}
  | UIDamageEvent
  | UIRecoverEvent;
export type UIBattleEvent = RawUIBattleEvent & {names: Record<string, string>};

export type UIDamageEvent = DamageEvent & {maxHp?: number};
export type UIRecoverEvent = RecoverEvent & {maxHp?: number};

export const statusTable: Record<Status, string> = {
  psn: "was poisoned",
  par: "was paralyzed! It may be unable to move",
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
  skullbash: "{Src} lowered its head!",
  razorwind: "{Src} made a whirlwind!",
  skyattack: "{Src} is glowing!",
  solarbeam: "{Src} took in sunlight!",
  dig: "{Src} dug a hole!",
  fly: "{Src} flew up high!",
  dive: "{Src} hid underwater!",
  bounce: "{Src} sprang up!",
  shadowforce: "{Src} vanished instantly!",
  freezeshock: "{Src} became cloaked in a freezing light!",
  iceburn: "{Src} became cloaked in freezing air!",
};

export const infoMessage: Record<InfoReason, string> = {
  immune: "It doesn't affect {src}...",
  miss: "{Src}'s attack missed!",
  cant_substitute: "{Src} doesn't have enough HP to create a substitute!",
  has_substitute: "{Src} already has a substitute!",
  fail_generic: "But it failed!",
  fail_unimplemented: "But the devs were too lazy to implement it!",
  fail_notarget: "But there was no target...",
  fail_sleep_clause:
    "But it failed! (Sleep Clause Mod: Only one Pokémon may be put to sleep at a time)",
  whirlwind: "But it failed!",
  fail_focus: "{Src} lost its focus and couldn't move!",
  flinch: "{Src} flinched!",
  splash: "But nothing happened!",
  seeded: "{Src} was seeded!",
  mist_protect: "{Src} is protected by the mist!",
  safeguard_protect: "{Src} is protected by Safeguard!",
  mist: "{Src}'s shrouded in mist!",
  lightScreen: "{Src}'s protected against special attacks!",
  reflect: "{Src} is gained armor!",
  focusEnergy: "{Src} is getting pumped!",
  payday: "Coins scattered everywhere!",
  become_confused: "{Src} became confused!",
  fatigue_confuse: "{Src} became confused due to fatigue!",
  fatigue_confuse_max: "{Src} became confused due to fatigue!",
  confused: "{Src} is confused!",
  confused_end: "{Src} is no longer confused!",
  recharge: "{Src} must recharge!",
  frozen: "{Src} is frozen solid!",
  sleep: "{Src} is fast asleep!",
  wake: "{Src} woke up!",
  haze: "All status changes were removed!",
  thaw: "{Src} thawed out!",
  paralyze: "{Src}'s paralyzed! It can't move!",
  rage: "{Src}'s rage is building!",
  disable_end: "{Src}'s disabled no more!",
  bide: "{Src} unleashed energy!",
  bide_store: "{Src} is storing energy!",
  trapped: "{Src} can't move!",
  faint: "{Src} fainted!",
  attract: "{Src} fell in love!",
  cure_attract: "{Src} is no longer in love!",
  immobilized: "{Src} is immobilized by love!",
  destinyBond: "{Src} is trying to take its foe with it!",
  grudge: "{Src} wants the opponent to bear a grudge!",
  protect: "{Src} protected itself!",
  endure: "{Src} braced itself!",
  endure_hit: "{Src} endured the hit!",
  encore: "{Src} received an encore!",
  encore_end: "{Src}'s encore ended!",
  meanlook: "{Src} can no longer escape!",
  nightmare: "{Src} fell into a nightmare!",
  heal_bell: "A bell chimed!",
  aromatherapy: "A soothing aroma wafted through the area!",
  pain_split: "The battlers shared their pain!",
  perish_song: "All affected pokemon will faint in three turns!",
  withdraw: "({Src} is trying to switch out...)",
  fail_present: "{Src} couldn't receive the gift!",
  endure_band: "{Src} held on using its <b>Focus Band</b>!",
  wont_flinch: "{Src} wont flinch!",
  ingrain: "{Src} planted its roots!",
  taunt: "{Src} fell for the taunt!",
  taunt_end: "{Src} shook off the taunt...",
  begin_focuspunch: "{Src} is tightening its focus!",
  wish: "{Src} made a wish!",
  drowsy: "{Src} grew drowsy!",
  charge: "{Src} began charging power!",
  mudSport: "Electricity's power was weakened!",
  waterSport: "Fire's power was weakened!",
  followMe: "{Src} became the center of attention!",
  not_confused: "{Src} was not confused!",
  loafing: "{Src} is loafing around!",
  imprisoning: "{Src} sealed the opponent's move(s)!",
  uproar: "{Src} caused an uproar!",
  uproar_continue: "{Src} is making an uproar!",
  uproar_end: "{Src} is no longer making an uproar!",
  torment: "{Src} was subjected to torment!",
  snatch: "{Src} waits for a target to make a move!",
  magicCoat: "{Src} shrouded itself in Magic Coat!",
  batonpass: "",
  uturn: "{Src} went back to {owner}!",
  pressure: "{Src} is exerting its Pressure!",
  gastroAcid: "{Src}'s ability was suppressed!",
  atk_maximize: "{Src} maxed its Attack!",
  quickclaw: "{Src} can move faster thanks to its <b>Quick Claw</b>!",
  heartswap: "{Src} switched stat stages with the target!",
  guardswap: "{Src} switched all changes to its Defense and Sp. Def with the target!",
  powerswap: "{Src} switched all changes to its Attack and Sp. Atk with the target!",
  lunardance: "{Src} became cloaked in a mystical moonlight!",
  healingwish: "The healing wish came true for {src}!",
  powerTrick: "{Src} switched its Attack and Defense!",
  aquaRing: "{Src} surrounded itself with a veil of water!",
  magnet_rise: "{Src} levitated with electromagnetism!",
  magnet_rise_end: "{Src}'s electromagnetism wore off!",
  worryseed: "{Src} acquired Insomnia!",
  gravity_grounded: "{Src} couldn't stay airborne because of Gravity!",
  embargo: "{Src} can't use items anymore!",
  embargo_end: "{Src}'s Embargo was lifted!",
};

export const weatherMessage: Record<
  WeatherEvent["weather"],
  Record<WeatherEvent["kind"], string>
> = {
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
  gravity: {
    start: "Gravity intensified!",
    continue: "",
    end: "Gravity returned to normal!",
  },
  trickRoom: {
    start: "{Src} twisted the dimensions!",
    continue: "",
    end: "The twisted dimensions returned to normal!",
  },
};

export const screenMessage: Record<ScreenId, Record<ScreenEvent["kind"], string>> = {
  safeguard: {
    start: "{SrcTeam} became cloaked in a mystical veil!",
    end: "{SrcTeam}'s Safeguard wore off...",
    shattered: "{SrcTeam}'s Safeguard wore off...",
  },
  light_screen: {
    start: "Light Screen raised {srcTeam}'s Special Defense!",
    end: "{SrcTeam}'s Light Screen wore off...",
    shattered: "{SrcTeam}'s Light Screen shattered!",
  },
  reflect: {
    start: "Reflect raised {srcTeam}'s Defense!",
    end: "{SrcTeam}'s Reflect wore off...",
    shattered: "{SrcTeam}'s Reflect shattered!",
  },
  mist: {
    start: "{SrcTeam} became shrouded in Mist!",
    end: "{SrcTeam}'s Mist wore off...",
    shattered: "{SrcTeam}'s Mist wore off...",
  },
  tailwind: {
    start: "The tailwind blew from behind {srcTeam}!",
    end: "{SrcTeam}'s tailwind petered out!",
    shattered: "{SrcTeam}'s tailwind petered out!",
  },
  luckychant: {
    start: "The Lucky Chant shielded {srcTeam} from critical hits!",
    end: "{SrcTeam}'s Lucky Chant wore off!", // todo
    shattered: "{SrcTeam}'s Lucky Chant wore off!", // todo
  },
};

export const hazardMessage: Record<HazardId, {set: string; spin: string}> = {
  spikes: {
    set: "Spikes were scattered all around the feet of {srcTeam}!",
    spin: "{Src} blew away the Spikes around {srcTeam}'s feet!",
  },
  rocks: {
    set: "Pointed stones float in the air around {srcTeam}!",
    spin: "The pointed stones disappeared from the ground around {srcTeam}'s feet!",
  },
  tspikes: {
    set: "Poison spikes were scattered all around {srcTeam}'s feet!",
    spin: "The poison spikes disappeared from the ground around {srcTeam}'s feet!",
  },
};

export const damageMessage: Partial<Record<DamageReason | RecoveryReason, string>> = {
  recoil: "{Src} is hit with recoil!",
  psn: "{Src} is hurt by poison!",
  brn: "{Src} is hurt by its burn!",
  spikes: "{Src} is hurt by the spikes!",
  rocks: "Pointed stones dug into {src}!",
  confusion: "It hurt itself in its confusion!",
  crash: "{Src} kept going and crashed!",
  trap: "{Src}'s attack continues!",
  ohko: "It's a one-hit KO!",
  nightmare: "{Src} is locked in a Nightmare!",
  sand: "{Src} is buffeted by the sandstorm!",
  hail: "{Src} is buffeted by the hail!",
  seeded: "{Src}'s health was sapped by Leech Seed!",
  belly_drum: "{Src} cut its own HP and maximized its Attack!",
  set_curse: "{Target} cut its own HP and laid a curse on {src}!",
  curse: "{Src} is afflicted by the Curse!",
  destiny_bond: "{Src} took {target} with it!",
  roughskin: "{Target} was hurt!",
  baddreams: "{Target} is tormented!",
  lifeorb: "{Src} is hurt by its Life Orb!",
  trap_eot: "{Src} is hurt by {move}!",
  // Recovery
  drain: "{Src} had its energy drained!",
  recover: "{Src} regained health!",
  rest: "{Src} started sleeping!",
  leftovers: "{Src} restored a little HP using its <b>Leftovers!</b>",
  ingrain: "{Src} absorbed nutrients with its roots!",
  aquaRing: "A veil of water restored {src}'s HP!",
  shellbell: "{Src} restored a little HP using its <b>Shell Bell!</b>",
};

export const trapStart: Partial<Record<MoveId, string>> = {
  wrap: "{Target} was wrapped by {src}!",
  whirlpool: "{Target} was trapped in the vortex!",
  bind: "{Target} was squeezed by {src}!",
  clamp: "{Target} was clamped by {src}!",
  firespin: "{Target} was trapped in the vortex!",
  sandtomb: "{Target} was trapped by Sand Tomb!",
  magmastorm: "{Target} became trapped by swirling magma!",
};

export const futureSightMessage: Partial<Record<MoveId, {set: string; release: string}>> = {
  futuresight: {
    set: "{Src} foresaw an attack!",
    release: "{Src} took the Future Sight attack!",
  },
  doomdesire: {
    set: "{Src} chose Doom Desire as its destiny!",
    release: "{Src} took the Doom Desire attack!",
  },
};

export const moldBreakerMessage: Partial<Record<AbilityId, string>> = {
  moldbreaker: "{Src} breaks the mold!",
  teravolt: "{Src} is radiating a bursting aura!",
  turboblaze: "{Src} is radiating a blazing aura!",
};

export const bugMessage: Record<BugType, string> = {
  bug_gen2_bellydrum: "In Gen 2, Belly Drum still raises Atk by 2 on failure due to a bug.",
  bug_gen2_spikes:
    "In Gen 2, Pokémon take damage but do not faint after a previous Pokémon fainted to certain end-of-turn effects.",
};

export const cantUseTable: Partial<Record<(BattleEvent & {type: "cantuse"})["why"], string>> = {
  taunt: "{Src} can't use <b>{move}</b> after the taunt!",
  gravity: "{Src} can't use <b>{move}</b> because of Gravity!",
};

export const consumeItemTable: Partial<Record<ItemId, string>> = {
  whiteherb: "{Src} restored its stats using its <b>{item}</b>!",
  focussash: "{Src} held on using its <b>{item}</b>!",
};
