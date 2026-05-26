import type {InfoReason, PlayerId, PokeId} from "~~/game/events";
import type {Generation} from "~~/game/gen";
import {abilityList} from "~~/game/species";
import {hpPercentExact, playerId} from "~~/game/utils";

export type TextSpan = {
  text: string;
  clazz?: string;
  tooltip?: string;
};

export type FormattedText = {text: TextSpan[]; clazz?: string; p?: bool};

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

const infoClass: Partial<Record<InfoReason, string>> = {
  confused: "confused",
  sleep: "move",
  disable_end: "move",
  wake: "move",
  withdraw: "muted",
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
  for (const text of lines.text) {
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
  const text = (text: string, clazz?: string, p?: bool): FormattedText => {
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
    return {text: spans, clazz, p};
  };

  const p = (text: string, clazz?: string): FormattedText => ({
    text: [{text}],
    clazz,
    p: true,
  });

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
      return {text: lines, clazz: "text-xs sm:text-[0.8rem] text-(--stat-up)", p: true};
    } else {
      return {text: lines, clazz: "text-xs sm:text-[0.8rem] text-(--stat-down)", p: true};
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
  case "hit_sub": return p("{Target}'s substitute took the hit!");
  case "hit_count": return p(`Hit ${e.hitCount} time(s)!`);
  case "crit": {
    if (isDoubles) {
      return p("A critical hit on {target}!");
    } else {
      return p("A critical hit!");
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
  case "stages":
    switch (e.count) {
    case 6: return text(`{Src}'s ${getStageTable(gen)[e.stat]} won't go any higher!`);
    case -6: return text(`{Src}'s ${getStageTable(gen)[e.stat]} won't go any lower!`);
    case 0: return text(`{Src}'s ${getStageTable(gen)[e.stat]} was not lowered!`);
    default: {
      const statMod = (e.count < 0)
        ? {[2]: "fell sharply", [3]: "severely fell"}[e.count] ?? "fell"
        : {[2]: "rose sharply", [3]: "rose drastically"}[e.count] ?? "rose";
      return text(`{Src}'s ${getStageTable(gen)[e.stat]} ${statMod}!`)
    };
    }
  case "miss":
    if (isDoubles) {
      return text("{Target} avoided the attack!");
    } else {
      return text("{Src}'s attack missed!");
    }
  case "transform": return text(e.target ? "{Src} transformed into {target}!" : "{Src} transformed!");
  case "conversion": return text(e.target ? "Converted type to match {target}!" : `{Src} converted into the <b>${toTitleCase(e.types[0])}</b>!`);
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
      return p(
        `It's ${se ? `super effective on {target}!` : `not very effective on {target}...`}`,
        "italic",
      );
    } else {
      return p(`It's ${se ? "super effective!" : "not very effective..."}`, "italic");
    }
  }
  case "info": return text(infoMessage[e.why], infoClass[e.why], true);
  case "magnitude": return text(`Magnitude ${e.magnitude}!`);
  case "beatup": return text("{name}'s attack!");
  case "status": return text("{Src} " + statusTable[e.status] + "!");
  case "cantuse": return text(cantUseTable[e.why] ?? "{Src} can't use <b>{move}</b>!");
  case "weather": return text(weatherMessage[e.weather][e.kind]);
  case "screen": return text(screenMessage[e.screen][e.kind]);
  case "bug": return text(bugMessage[e.bug], undefined, true);
  case "charge": return text(chargeMessage[e.move] ?? "{Src} is charging a <b>{move}</b>", "move");
  case "moldbreaker": return text(moldBreakerMessage[e.ability]!);
  case "hazard": return text(hazardMessage[e.hazard][e.spin ? 'spin' : 'set']);
  case "futuresight": return text(futureSightMessage[e.move]![e.release ? 'release' : 'set']);
  case "dmg_reason": {
    if (e.why.startsWith("wish:")) {
      return p(`{wish}'s wish came true!`);
    } else {
      return text(damageMessage[e.why]!, undefined, true);
    }
  }
  case "proc_ability": return text("[{Src}'s <b>{ability}</b>]", "move ability");
  case "get_sub": return text("{Src} put in a substitute!");
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
