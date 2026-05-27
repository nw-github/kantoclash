import type {
  BattleEvent,
  BugType,
  DamageEvent,
  DamageReason,
  InfoReason,
  PokeId,
  PlayerId,
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
import type {Generation} from "~~/game/gen";
import {abilityList} from "~~/game/species";
import {hpPercentExact, playerId} from "~~/game/utils";

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
      item?: ItemId;
      why: DamageReason | RecoveryReason;
    }
  | {type: "obtain_item"; src: PokeId; item: ItemId}
  | {type: "hit_count"; hitCount: number}
  | {type: "crit"; target: PokeId}
  | {type: "start"}
  | UIDamageEvent
  | UIRecoverEvent;
export type UIBattleEvent = RawUIBattleEvent & {names: Record<string, string>};

export type UIDamageEvent = DamageEvent & {maxHp?: number};
export type UIRecoverEvent = RecoverEvent & {maxHp?: number};

const statusTable: Record<Status, string> = {
  psn: "was poisoned",
  par: "was paralyzed! It may be unable to move",
  slp: "fell asleep",
  frz: "was frozen solid",
  tox: "was badly poisoned",
  brn: "was burned",
};

const statusNameTable: Record<Status, string> = {
  psn: "poison",
  par: "paralysis",
  slp: "sleep",
  frz: "freeze",
  tox: "poison",
  brn: "burn",
};

const chargeMessage: Partial<Record<MoveId, string>> = {
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

const infoMessage: Record<InfoReason, string> = {
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

const infoClass: Partial<Record<InfoReason, string>> = {
  confused: "confused",
  sleep: "move",
  disable_end: "move",
  wake: "move",
  withdraw: "muted",
};

const weatherMessage: Record<WeatherEvent["weather"], Record<WeatherEvent["kind"], string>> = {
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

const screenMessage: Record<ScreenId, Record<ScreenEvent["kind"], string>> = {
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

const hazardMessage: Record<HazardId, {set: string; spin: string}> = {
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

const trapStart: Partial<Record<MoveId, string>> = {
  wrap: "{Target} was wrapped by {src}!",
  whirlpool: "{Target} was trapped in the vortex!",
  bind: "{Target} was squeezed by {src}!",
  clamp: "{Target} was clamped by {src}!",
  firespin: "{Target} was trapped in the vortex!",
  sandtomb: "{Target} was trapped by Sand Tomb!",
  magmastorm: "{Target} became trapped by swirling magma!",
};

const futureSightMessage: Partial<Record<MoveId, {set: string; release: string}>> = {
  futuresight: {
    set: "{Src} foresaw an attack!",
    release: "{Src} took the Future Sight attack!",
  },
  doomdesire: {
    set: "{Src} chose Doom Desire as its destiny!",
    release: "{Src} took the Doom Desire attack!",
  },
};

const moldBreakerMessage: Partial<Record<AbilityId, string>> = {
  moldbreaker: "{Src} breaks the mold!",
  teravolt: "{Src} is radiating a bursting aura!",
  turboblaze: "{Src} is radiating a blazing aura!",
};

const bugMessage: Record<BugType, string> = {
  bug_gen2_bellydrum: "In Gen 2, Belly Drum still raises Atk by 2 on failure due to a bug.",
  bug_gen2_spikes:
    "In Gen 2, Pokémon take damage but do not faint after a previous Pokémon fainted to certain end-of-turn effects.",
};

const cantUseTable: Partial<Record<(BattleEvent & {type: "cantuse"})["why"], string>> = {
  taunt: "{Src} can't use <b>{move}</b> after the taunt!",
  gravity: "{Src} can't use <b>{move}</b> because of Gravity!",
};

const consumeItemTable: Partial<Record<ItemId, string>> = {
  whiteherb: "{Src} restored its stats using its <b>{item}</b>!",
  focussash: "{Src} held on using its <b>{item}</b>!",
};

export type TextSpan = {text: string; clazz?: string; tooltip?: string};
export type FormattedText = {spans: TextSpan[]; clazz?: string};

type TemplateParams = {
  e: UIBattleEvent;
  gen: Generation;
  isDoubles: bool;
  perspective: string;
  myId: string;
};

type SubstituteParams = {
  e: UIBattleEvent;
  gen: Generation;
  perspective: string;
  players: Players;
};

const statMod: Record<number, string> = {
  [6]: "won't go any higher",
  [3]: "rose drastically",
  [2]: "rose sharply",
  [1]: "rose",
  [-6]: "won't go any lower",
  [-3]: "severely fell",
  [-2]: "fell sharply",
  [-1]: "fell",
  [0]: "was not lowered",
};

export const eventText = (data: SubstituteParams & TemplateParams) => {
  const templ = createTemplate(data);
  return templ && fillTemplate(templ, data);
};

const fillTemplate = (lines: FormattedText, {e, gen, perspective, players}: SubstituteParams) => {
  const pn = (id: PokeId, title = true) => {
    if (playerId(id) === perspective) {
      return e.names[id];
    } else {
      return title ? `The opposing ${e.names[id]}` : `the opposing ${e.names[id]}`;
    }
  };

  const tn = (id: PokeId | PlayerId, title = true) => {
    if (playerId(id as PokeId) === perspective) {
      return title ? "Your team" : "your team";
    } else {
      return title ? "The opposing team" : "the opposing team";
    }
  };

  const re =
    /{(?:Src|src|SrcTeam|srcTeam|Target|target|TargetTeam|targetTeam|owner|name|name\d|user|move|ability|victor|wish|item|opp)}/g;
  for (const text of lines.spans) {
    text.text = text.text.replaceAll(re, substr => {
      // prettier-ignore
      if ("src" in e && e.src) {
          switch (substr) {
          case "{Src}": return pn(e.src, true);
          case "{src}": return pn(e.src, false);
          case "{SrcTeam}": return tn(e.src, true);
          case "{srcTeam}": return tn(e.src, false);
          case "{owner}": return players.clientOwnerOf(e.src).name;
          }
        }
      // prettier-ignore
      if ("target" in e && e.target) {
          switch (substr) {
          case "{Target}": return pn(e.target, true);
          case "{target}": return pn(e.target, false);
          case "{TargetTeam}": return tn(e.target, true);
          case "{targetTeam}": return tn(e.target, false);
          case "{owner}": return players.clientOwnerOf(e.target).name;
          }
        }
      // prettier-ignore
      if ("user" in e) {
          switch (substr) {
          case "{user}": return players.get(e.user).name;
          case "{SrcTeam}": return tn(e.user, true);
          case "{srcTeam}": return tn(e.user, false);
          }
        }

      if (substr === "{name}" && "name" in e) {
        return e.name;
      } else if (substr === "{victor}" && "victor" in e && e.victor) {
        return players.get(e.victor).name;
      } else if (substr === "{move}" && "move" in e && e.move) {
        return gen.moveList[e.move].name;
      } else if (substr === "{ability}" && "ability" in e && e.ability) {
        return abilityList[e.ability].name;
      } else if (substr === "{item}" && "item" in e && e.item) {
        return gen.items[e.item].name;
      } else if (substr === "{wish}" && "why" in e && e.why && e.why.startsWith("wish:")) {
        return e.why.slice(5);
      } else if ("pokes" in e) {
        if (substr.startsWith("{name")) {
          const index = substr.slice("{name".length, substr.length - 1);
          return e.pokes[+index]?.name ?? "???";
        } else if (substr === "{owner}") {
          return players.clientOwnerOf(e.pokes[0].src).name;
        }
      } else if (substr === "{opp}") {
        const opp = Object.entries(players.items).find(
          ([id, player]) => !player.isSpectator && id !== perspective,
        );
        return opp?.[1].name ?? substr;
      }
      return substr;
    });
  }
  return lines;
};

const createTemplate = ({
  e,
  gen,
  isDoubles,
  perspective,
  myId,
}: TemplateParams): FormattedText | undefined => {
  const text = (text: string, clazz?: string): FormattedText => {
    const spans: TextSpan[] = [];
    let next;
    while ((next = text.indexOf("<b>")) !== -1) {
      let end = text.indexOf("</b>", next + 3);
      if (end === -1) {
        end = text.length;
      }

      const before = text.slice(0, next);
      if (before) {
        spans.push({text: before});
      }
      spans.push({text: text.slice(next + 3, end), clazz: "font-bold"});
      text = text.slice(end + 4);
    }

    if (text) {
      spans.push({text});
    }
    return {spans, clazz};
  };

  const nofmt = (text: string, clazz?: string): FormattedText => ({spans: [{text}], clazz});

  const dmgRecoverMessage = (e: UIDamageEvent | UIRecoverEvent): FormattedText => {
    const lines: TextSpan[] = [];
    if (e.type === "recover") {
      lines.push({text: "{Target} gained "});
    } else {
      lines.push({text: "{Target} lost "});
    }

    let pv = Math.abs(e.hpPercentBefore - e.hpPercentAfter);
    if (e.maxHp !== undefined) {
      pv = roundTo(Math.abs(hpPercentExact(e.hpBefore - e.hpAfter, e.maxHp)), 1);
    }
    const text = pv === 0 ? "<1%" : `${pv}%`;

    if (e.maxHp !== undefined) {
      const tooltip = `${roundTo(Math.abs(e.hpBefore - e.hpAfter), 1)} HP`;
      lines.push({text, clazz: "font-bold underline decoration-dotted", tooltip});
    } else {
      lines.push({text, clazz: "font-bold"});
    }
    lines.push({text: " of its health!"});
    if (e.type === "recover") {
      return {spans: lines, clazz: "text-xs sm:text-[0.8rem] text-(--stat-up)"};
    } else {
      return {spans: lines, clazz: "text-xs sm:text-[0.8rem] text-(--stat-down)"};
    }
  };

  // prettier-ignore
  switch (e.type) {
  case "start": return text("{opp} wants to fight!");
  case "init": {
    const nameText = e.pokes.map((_, i) => `<b>{name${i}}</b>`).join(" and ");
    return text(playerId(e.pokes[0].src) === perspective ? `Go! ${nameText}!` : `{owner} sent in ${nameText}!`, "move");
  }
  case "retract": return text(playerId(e.src) === perspective ? "Come back! <b>{name}</b>!" : "{owner} withdrew <b>{name}</b>!", "move");
  case "switch":
    if (e.why === "phaze") {
      return text("{name} was dragged out!", "move");
    } else {
      return text(playerId(e.src) === perspective ? "Go! <b>{name}</b>!" : "{owner} sent in <b>{name}</b>!", "move");
    }
  case "damage":
  case "recover": return dmgRecoverMessage(e);
  case "hit_sub": return nofmt("{Target}'s substitute took the hit!");
  case "hit_count": return nofmt(`Hit ${e.hitCount} time(s)!`);
  case "crit": {
    if (isDoubles) {
      return nofmt("A critical hit on {target}!");
    } else {
      return nofmt("A critical hit!");
    }
  }
  case "move":
    if (e.thrashing && e.move !== 'rage') {
      return text("{Src}'s thrashing about!", "move");
    } else if (e.disabled) {
      return text("{Src}'s <b>{move}</b> is disabled!", "move");
    } else {
      return text("{Src} used <b>{move}</b>!", "move");
    }
  case "end":
    if (e.victor === myId) {
      return text("You win!");
    } else if (e.victor) {
      return text("<b>{victor}</b> wins!");
    } else if (e.why) {
      return text({
        too_long: "It's a draw! (Turn limit reached!)",
        endless: "It's a draw! (Endless battle detected!)",
        error: "It's a draw! (Internal error occurred)",
        timer: "It's a draw!",
      }[e.why]);
    } else {
      return text("It's a draw!");
    }
  case "sub_break": return text("{Target}'s substitute broke!");
  case "stages": return text(`{Src}'s ${getStageTable(gen)[e.stat]} ${statMod[e.count]}!`);
  case "miss":
    if (isDoubles) {
      return text("{Target} avoided the attack!");
    } else {
      return text("{Src}'s attack missed!");
    }
  case "transform": return text(e.target ? "{Src} transformed into {target}!" : "{Src} transformed!");
  case "conversion": return text(e.target ? "Converted type to match {target}!" : `{Src} converted into the <b>${toTitleCase(e.types[0])}</b> type!`);
  case "cure":
    if (e.status === "slp") {
      return text("{Src} woke up!");
    } else if (e.status === "frz") {
      return text("{Src} thawed out!");
    } else {
      return text(`{Src} was cured of its ${statusNameTable[e.status]}!`);
    }
  case "forfeit": return text(e.timer ? "<b>{user}</b> ran out of time.": "<b>{user}</b> forfeit the match.");
  case "trap": return text(e.kind === "start" ? trapStart[e.move]! : "{Src} was freed from {move}!");
  case "item": {
    const item = consumeItemTable[e.item!];
    if (item) {
      return text(item);
    } else if (e.item?.includes('berry')) {
      return text("{Src} ate its <b>{item}</b>!", "muted move");
    } else { // berserk gene, mental herb
      return text("{Src} used its <b>{item}</b>!", "muted move");
    }
  }
  case "eff": {
    const se = (e.eff ?? 1) > 1;
    if (isDoubles) {
      return nofmt(
        `It's ${se ? `super effective on {target}!` : `not very effective on {target}...`}`,
        "italic",
      );
    } else {
      return nofmt(`It's ${se ? "super effective!" : "not very effective..."}`, "italic");
    }
  }
  case "info": return text(infoMessage[e.why], infoClass[e.why]);
  case "magnitude": return text(`Magnitude ${e.magnitude}!`);
  case "beatup": return text("{name}'s attack!");
  case "status": return text("{Src} " + statusTable[e.status] + "!");
  case "cantuse": return text(cantUseTable[e.why] ?? "{Src} can't use <b>{move}</b>!");
  case "weather": return text(weatherMessage[e.weather][e.kind]);
  case "screen": return text(screenMessage[e.screen][e.kind]);
  case "bug": return text(bugMessage[e.bug], undefined);
  case "charge": return text(chargeMessage[e.move] ?? "{Src} is charging a <b>{move}</b>", "move");
  case "moldbreaker": return text(moldBreakerMessage[e.ability]!);
  case "hazard": return text(hazardMessage[e.hazard][e.spin ? 'spin' : 'set']);
  case "futuresight": return text(futureSightMessage[e.move]![e.release ? 'release' : 'set']);
  case "dmg_reason": {
    if (e.why.startsWith("wish:")) {
      return nofmt(`{wish}'s wish came true!`);
    } else {
      return text(damageMessage[e.why]!, undefined);
    }
  }
  case "proc_ability": return text("[{Src}'s <b>{ability}</b>]", "move ability");
  case "disable": return text("{Src}'s <b>{move}</b> was disabled!");
  case "mimic": return text("{Src} learned <b>{move}</b>!");
  case "in_love": return text("{Src} is in love with {target}!", "move");
  case "spite": return text(`It reduced the PP of {src}'s <b>{move}</b> by ${e.amount}!`);
  case "sketch": return text("{Src} sketched <b>{move}</b>!");
  case "bounce": return text("{Src} bounced the <b>{move}</b> back!");
  case "grudge": return text("{Src}'s <b>{move}</b> lost all its PP due to the grudge!");
  case "perish": return text(`{Src}'s perish count fell to ${e.turns}!`);
  case "psych_up": return text("{Src} copied {target}'s stat changes!");
  case "foresight": return text("{Src} identified {target}!");
  case "lock_on": return text("{Src} took aim at {target}!");
  case "snatch": return text("{Src} snatched {target}'s move!");
  case "helping_hand": return text("{Src} is ready to help {target}!");
  case "pp": return text("{Src}'s <b>{move}</b> was restored!");
  case "thief": return text("{Src} stole {target}'s <b>{item}</b>!");
  case "pluck": return text("{Src} stole and ate {target}'s <b>{item}</b>!");
  case "trick": return text("{Src} switched items with its target!");
  case "knockoff": return text("{Src} knocked off {target}'s <b>{item}</b>!");
  case "recycle": return text("{Src} found one <b>{item}</b>!");
  case "copy_ability": return text("{Src} copied {target}'s <b>{ability}</b>!");
  case "trace": return text("{Src} traced {target}'s <b>{ability}</b>!");
  case "skill_swap": return text("{Src} swapped abilities with {target}!");
  case "stockpile": return text(`{Src} stockpiled ${e.count}!`);
  case "obtain_item": return text("{Src} obtained one <b>{item}</b>!");
  }
};
