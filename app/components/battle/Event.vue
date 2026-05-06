<template>
  <div
    v-if="textLines && textLines.length === 1"
    class="text-sm sm:text-base"
    :class="textLines[0].clazz"
  >
    <template v-for="(text, j) in textLines[0].text" :key="j">
      <UTooltip v-if="text.tooltip" :text="text.tooltip">
        <span :class="text.clazz">{{ text.text }}</span>
      </UTooltip>
      <span v-else :class="text.clazz">{{ text.text }}</span>
    </template>
  </div>
  <div v-else-if="textLines" class="text-sm sm:text-base">
    <component
      :is="line.p ? 'p' : 'div'"
      v-for="(line, i) in textLines"
      :key="i"
      :class="line.clazz"
    >
      <template v-for="(text, j) in line.text" :key="j">
        <UTooltip v-if="text.tooltip" :text="text.tooltip">
          <span :class="text.clazz">{{ text.text }}</span>
        </UTooltip>
        <span v-else :class="text.clazz">{{ text.text }}</span>
      </template>
    </component>
  </div>
  <div v-else class="text-sm sm:text-base">
    Unknown event: <code>{{ e }}</code>
  </div>
</template>

<style scoped>
@reference "@/assets/main.css";

.muted {
  @apply text-xs sm:text-[0.8rem];
}
</style>

<script setup lang="ts">
import {hpPercentExact, playerId} from "~~/game/utils";
import type {Generation} from "~~/game/gen";
import type {InfoReason, PlayerId, PokeId} from "~~/game/events";
import {abilityList} from "~~/game/species";

const {perspective, players, myId, e, gen} = defineProps<{
  e: UIBattleEvent;
  players: Players;
  perspective: string;
  myId: string;
  gen: Generation;
}>();

const isDoubles = computed(() =>
  Object.values(players.items).some(pl => (pl?.bp?.active.length ?? 0) > 1),
);

type TextLine = {
  text: string;
  clazz?: string;
  tooltip?: string;
};

type FormattedText = {text: TextLine[]; clazz?: string; p?: bool}[];

const textLines = computed(() => {
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

  const lines = createTemplate(e);
  if (!lines) {
    return;
  }

  const re =
    /{(?:Src|src|SrcTeam|srcTeam|Target|target|TargetTeam|targetTeam|owner|name|name\d|user|move|ability|victor|wish|item)}/g;
  for (const line of lines) {
    for (const text of line.text) {
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
        }
        return substr;
      });
    }
  }
  return lines;
});

const createTemplate = (e: UIBattleEvent): FormattedText | undefined => {
  const text = (text: string, clazz?: string, p?: bool): FormattedText => {
    const lines: TextLine[] = [];
    let next;
    while ((next = text.indexOf("<b>")) !== -1) {
      let end = text.indexOf("</b>", next + 3);
      if (end === -1) {
        end = text.length;
      }

      const before = text.slice(0, next);
      if (before) {
        lines.push({text: before});
      }
      lines.push({text: text.slice(next + 3, end), clazz: "font-bold"});
      text = text.slice(end + 4);
    }

    if (text) {
      lines.push({text});
    }
    return [{text: lines, clazz, p}];
  };

  const p = (text: string, clazz?: string): FormattedText[number] => ({
    text: [{text}],
    clazz,
    p: true,
  });

  const eff = (v?: number) => {
    const se = (v ?? 1) > 1;
    if (isDoubles.value) {
      return p(
        `It's ${se ? `super effective on {target}!` : `not very effective on {target}...`}`,
        "italic",
      );
    } else {
      return p(`It's ${se ? "super effective!" : "not very effective..."}`, "italic");
    }
  };

  const dmgRecoverMessage = (e: UIDamageEvent | UIRecoverEvent): FormattedText[number] => {
    const lines: TextLine[] = [];
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
  case "recover": {
    const messages = [];
    const reason = recoveryReason[e.why];
    if (reason) {
      messages.push(p(reason));
    } else if (e.why.startsWith("wish:")) {
      messages.push(p(`{wish}'s wish came true!`));
    }

    messages.push(dmgRecoverMessage(e));
    return messages;
  }
  case "damage": {
    const messages = [];
    const info = damageMessage[e.why];
    if (info) {
      messages.push(p(info));
    } else if (e.why === "attacked" && e.isCrit) {
      if (isDoubles.value) {
        messages.push(p("A critical hit on {target}!"));
      } else {
        messages.push(p("A critical hit!"));
      }
    } else if (e.why === "trap_eot") {
      messages.push(p("{Src} is hurt by {move}!"));
    }

    if (e.hitCount === undefined && (e.eff ?? 1) !== 1) {
      messages.push(eff(e.eff));
    }

    messages.push(dmgRecoverMessage(e));
    if (e.hitCount) {
      if ((e.eff ?? 1) !== 1) {
        messages.push(eff(e.eff));
      }
      messages.push(p(`Hit ${e.hitCount} time(s)!`));
    }
    return messages;
  }
  case "hit_sub": {
    const messages = [];
    if (e.confusion) {
      messages.push(p("It hurt itself in its confusion!"));
    }
    if ((e.eff ?? 1 ) !== 1) {
      messages.push(eff(e.eff));
    }
    messages.push(p("{Target}'s substitute took the hit!"));
    return messages;
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
    if (isDoubles.value) {
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
      return text("{Src} ate its {item}!", "muted move");
    } else { // berserk gene, mental herb
      return text("{Src} used its {item}!", "muted move");
    }
  }
  case "info": {
    const messages = text(infoMessage[e.why], infoClass[e.why], true);
    if (e.why === "fail_sleep_clause") {
      messages.push(p("(Sleep Clause Mod: Only one Pokémon may be put to sleep at a time)"));
    }
    return messages;
  }
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
  case "proc_ability": return text("[{Src}'s <b>{ability}</b>]", "move ability");
  case "get_sub": return text("{Src} put in a substitute!");
  case "disable": return text("{Src}'s <b>{move}</b> was disabled!");
  case "mimic": return text("{Src} learned <b>{move}</b>!");
  case "in_love": return text("{Src} is in love with {target}!", "move");
  case "spite": return text(`It reduced the PP of {src}'s <b>{move}</b> by ${e.amount}`);
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
  case "thief": return text("{Src} stole {target}'s {item}!");
  case "trick": return text("{Src} switched items with its target!");
  case "knockoff": return text("{Src} knocked off {target}'s {item}!");
  case "recycle": return text("{Src} found one {item}!");
  case "copy_ability": return text("{Src} copied {target}'s {ability}!");
  case "trace": return text("{Src} traced {target}'s {ability}!");
  case "skill_swap": return text("{Src} swapped abilities with {target}!");
  case "stockpile": return text(`{Src} stockpiled ${e.count}!`);
  case "obtain_item": return text("{Src} obtained one {item}!");
  }
};

const infoClass: Partial<Record<InfoReason, string>> = {
  confused: "confused",
  sleep: "move",
  disable_end: "move",
  wake: "move",
  withdraw: "muted",
};
</script>
