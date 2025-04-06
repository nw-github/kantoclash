<!-- prettier-ignore -->
<template>
  <div v-if="e.type === 'retract'" class="move">
    <template v-if="playerId(e.src) === perspective">Come back! {{ e.name }}!</template>
    <template v-else>{{ players.byPokeId(e.src).name }} withdrew {{ e.name }}!</template>
  </div>
  <div v-else-if="e.type === 'switch'" class="move">
    <template v-if="e.why === 'phaze'"><b>{{ e.name }}</b> was dragged out!</template>
    <template v-else-if="playerId(e.src) === perspective">Go! <b>{{ e.name }}</b>!</template>
    <template v-else>{{ players.byPokeId(e.src).name }} sent in <b>{{ e.name }}</b>!</template>
  </div>
  <div v-else-if="e.type === 'damage'">
    <p v-if="e.why === 'attacked' && e.isCrit">
      <template v-if="players.byPokeId(e.target).active.length > 1">
        A critical hit on {{ pn(e.target, false) }}!
      </template>
      <template v-else>
        A critical hit!
      </template>
    </p>
    <p v-else-if="e.why === 'trap_eot'">
      {{ pn(e.src) }} is hurt by {{ (gen.moveList as any)[e.move!].name }}!
    </p>
    <p v-else-if="damageMessage[e.why]">
      {{ damageMessage[e.why]!
          .replace("{}", pn(e.src))
          .replace("{l}", pn(e.src, false))
          .replace("{t}", pn(e.target))
          .replace("{tl}", pn(e.target, false))
      }}
    </p>

    <p v-if="e.why === 'attacked' && e.hitCount === undefined && (e.eff ?? 1) !== 1" class="italic">
      {{ eff(e.target, e.eff) }}
    </p>

    <p v-if="e.why !== 'explosion'" class="text-xs sm:text-[0.8rem] text-[var(--stat-down)]">
      {{ pn(e.target) }} lost
      <UTooltip :text="tooltip(e)">
        <b class="text-xs sm:text-[0.8rem] text-[var(--stat-down)]" :class="[tooltip(e) && 'underline decoration-dotted']">{{ percent(e) }}%</b>
      </UTooltip> of its health.
    </p>

    <template v-if="e.hitCount">
      <p v-if="(e.eff ?? 1) !== 1" class="italic">{{ eff(e.target, e.eff) }}</p>
      <p>Hit {{ e.hitCount }} time(s)!</p>
    </template>
  </div>
  <div v-else-if="e.type === 'get_sub'">{{ pn(e.src) }} put in a substitute!</div>
  <div v-else-if="e.type === 'recover'">
    <p v-if="e.why === 'drain'">{{ pn(e.src) }} has its energy drained!</p>
    <p v-else-if="e.why === 'recover'">{{ pn(e.src) }} regained health!</p>
    <p v-else-if="e.why === 'rest'">{{ pn(e.src) }} started sleeping!</p>
    <p v-else-if="e.why === 'leftovers'">{{ pn(e.src) }} restored a little HP using its Leftovers!</p>
    <p v-else-if="e.why === 'ingrain'">{{ pn(e.src) }} absorbed nutrients with its roots!</p>
    <p v-else-if="e.why === 'shellbell'">{{ pn(e.src) }} restored a little HP using its Shell Bell!</p>
    <p v-else-if="e.why.startsWith('wish:')">{{ e.why.slice(5) }}'s wish came true!</p>

    <p class="text-xs sm:text-[0.8rem] text-[var(--stat-up)]">
      {{ pn(e.target) }} gained
      <UTooltip :text="tooltip(e)">
        <b class="text-xs sm:text-[0.8rem] text-[var(--stat-up)]" :class="[tooltip(e) && 'underline decoration-dotted']">{{ percent(e) }}%</b>
      </UTooltip> of its health.
    </p>
  </div>
  <div v-else-if="e.type === 'move'" class="move">
    <template v-if="e.thrashing && e.move !== 'rage'">{{ pn(e.src) }}'s thrashing about!</template>
    <template v-else-if="e.disabled">{{ pn(e.src) }}'s {{ gen.moveList[e.move].name }} is disabled!</template>
    <template v-else>{{ pn(e.src) }} used <b>{{ gen.moveList[e.move].name }}</b>!</template>
  </div>
  <div v-else-if="e.type === 'end'">
    <template v-if="e.victor === myId">You win!</template>
    <template v-else-if="e.victor"><b>{{ players.get(e.victor).name }}</b> wins!</template>
    <template v-else-if="e.why === 'too_long'">It's a draw! (Turn limit reached!)</template>
    <template v-else-if="e.why === 'endless'">It's a draw! (Endless battle detected!)</template>
    <template v-else>It's a draw!</template>
  </div>
  <div v-else-if="e.type === 'hit_sub'">
    <p v-if="e.confusion">It hurt itself in its confusion!</p>
    <p v-if="(e.eff ?? 1) !== 1" class="italic">{{ eff(e.target, e.eff) }}</p>
    <p>{{ pn(e.target) }}'s substitute took the hit!</p>
  </div>
  <div v-else-if="e.type === 'sub_break'">{{ pn(e.target) }}'s substitute broke!</div>
  <div v-else-if="e.type === 'status'">{{ pn(e.src) }} {{ statusTable[e.status] }}!</div>
  <div v-else-if="e.type === 'stages'">
    {{ pn(e.src) }}'s {{ getStageTable(gen)[e.stat] }} {{ e.count > 0 ? "rose" : "fell" }}{{ Math.abs(e.count) > 1 ? " sharply" : "" }}!
  </div>
  <div v-else-if="e.type === 'info'" :class="{ confused: e.why === 'confused', move: e.why === 'sleep' || e.why === 'disable_end' || e.why === 'wake' }">
    <p :class="[e.why === 'withdraw' && 'muted']">
      {{ infoMessage[e.why].replace("{}", pn(e.src)).replace("{l}", pn(e.src, false)).replace("{tl}", tn(e.src, false)) }}
    </p>

    <p v-if="e.why === 'fail_sleep_clause'">
      (Sleep Clause Mod: Only one Pokémon may be put to sleep at a time)
    </p>
  </div>
  <div v-else-if="e.type === 'miss'">
    <template v-if="players.byPokeId(e.target).active.length > 1">{{ pn(e.target) }} avoided the attack!</template>
    <template v-else>{{ pn(e.src) }} missed!</template>
  </div>
  <div v-else-if="e.type === 'transform'">{{ pn(e.src) }} transformed into {{ pn(e.target, false) }}!</div>
  <div v-else-if="e.type === 'disable'">{{ pn(e.src) }}'s {{ gen.moveList[e.move].name }} was disabled!</div>
  <div v-else-if="e.type === 'charge'" class="charge">{{ chargeMessage[e.move]?.replace("{}", pn(e.src)) }}</div>
  <div v-else-if="e.type === 'mimic'">{{ pn(e.src) }} learned {{ gen.moveList[e.move].name }}!</div>
  <div v-else-if="e.type === 'conversion'">
    <template v-if="e.target">
      Converted type to match {{ pn(e.target, false) }}!
    </template>
    <template v-else>
      {{ pn(e.src) }} converted into the <b>{{ toTitleCase(e.types[0]) }}</b> type!
    </template>
  </div>
  <div v-else-if="e.type === 'magnitude'">Magnitude {{ e.magnitude }}!</div>
  <div v-else-if="e.type === 'weather'">{{ weatherMessage[e.weather][e.kind] }}</div>
  <div v-else-if="e.type === 'screen'">
    {{ screenMessage[e.screen][e.kind].replace("{}", tn(e.user, true)).replace("{l}", tn(e.user, false)) }}
  </div>
  <div v-else-if="e.type === 'in_love'" class="move">{{ pn(e.src) }} is in love with {{ pn(e.target, false) }}!</div>
  <div v-else-if="e.type === 'bug'">
    <p class="muted">({{ bugMessage[e.bug] }})</p>
  </div>
  <div v-else-if="e.type === 'spite'">
    It reduced the PP of {{ pn(e.src, false) }}'s {{ gen.moveList[e.move].name }} by {{ e.amount }}!
  </div>
  <div v-else-if="e.type === 'sketch'">{{ pn(e.src) }} sketched {{ gen.moveList[e.move].name }}!</div>
  <div v-else-if="e.type === 'cantuse'" class="move">{{ pn(e.src) }} can't use <b>{{ gen.moveList[e.move].name }}</b>!</div>
  <div v-else-if="e.type === 'cantusetaunt'" class="move">{{ pn(e.src) }} can't use <b>{{ gen.moveList[e.move].name }}</b> after the taunt!</div>
  <div v-else-if="e.type === 'grudge'">{{ pn(e.src) }}'s {{ gen.moveList[e.move].name }} lost all its PP due to the grudge!</div>
  <div v-else-if="e.type === 'perish'">{{ pn(e.src) }}'s perish count fell to {{ e.turns }}!</div>
  <div v-else-if="e.type === 'psych_up'">
    {{ pn(e.src) }} copied {{ pn(e.target, false) }}'s stat changes!
  </div>
  <div v-else-if="e.type === 'foresight'">{{ pn(e.src) }} identified {{ pn(e.target, false) }}!</div>
  <div v-else-if="e.type === 'lock_on'">{{ pn(e.src) }} took aim at {{ pn(e.target, false) }}!</div>
  <div v-else-if="e.type === 'helping_hand'">{{ pn(e.src) }} is ready to help {{ pn(e.target, false) }}!</div>
  <div v-else-if="e.type === 'trap'">
    <template v-if="e.kind === 'start'">
      {{ trapStart[e.move]!.replace("{s}", pn(e.src, false)).replace("{t}", pn(e.target)) }}
    </template>
    <template v-else>
      {{ pn(e.src) }} was freed from {{ gen.moveList[e.move].name }}!
    </template>
  </div>
  <div v-else-if="e.type === 'beatup'">{{ e.name }}'s attack!</div>
  <div v-else-if="e.type === 'item'">
    <p v-if="e.item.includes('berry')" class="muted move">({{ pn(e.src) }} ate its {{ itemList[e.item].name }}!)</p>
    <p v-else-if="e.item === 'berserkgene' || e.item === 'mentalherb'" class="muted move">{{ pn(e.src) }} used its {{ itemList[e.item].name }}!</p>
    <p v-else-if="e.item === 'whiteherb'">{{ pn(e.src) }} restored its stats using its {{ itemList[e.item].name }}!</p>
    <p v-else>Unknown event: <code>{{ e }}</code></p>
  </div>
  <div v-else-if="e.type === 'pp'">{{ pn(e.src) }}'s <b>{{ gen.moveList[e.move].name }}</b> was restored!</div>
  <div v-else-if="e.type === 'thief'">{{ pn(e.src) }} stole {{ pn(e.target, false) }}'s {{ itemList[e.item].name }}!</div>
  <div v-else-if="e.type === 'trick'">
    <p>{{ pn(e.src) }} switched items with its target!</p>
    <p v-if="e.srcItem">{{ pn(e.src) }} obtained one {{ itemList[e.srcItem].name }}!</p>
    <p v-if="e.targetItem">{{ pn(e.target) }} obtained one {{ itemList[e.targetItem].name }}!</p>
  </div>
  <div v-else-if="e.type === 'knockoff'">{{ pn(e.src) }} knocked off {{ pn(e.target, false) }}'s {{ itemList[e.item].name }}!</div>
  <div v-else-if="e.type === 'forfeit'">
    <template v-if="e.timer">{{ players.get(e.user).name }} ran out of time.</template>
    <template v-else><b>{{ players.get(e.user).name }}</b> forfeit the match.</template>
  </div>
  <div v-else-if="e.type === 'cure'">
    <template v-if="e.status === 'slp'">{{ pn(e.src) }} woke up!</template>
    <template v-else-if="e.status === 'frz'">{{ pn(e.src) }} thawed out!</template>
    <template v-else>{{ pn(e.src) }} was cured of its {{ statusNameTable[e.status] }}!</template>
  </div>
  <div v-else-if="e.type === 'spikes'">
    <template v-if="e.spin">Rapid Spin blew away the Spikes around {{ tn(e.player, false) }}'s feet!</template>
    <template v-else>Spikes were scattered all around the feet of {{ tn(e.player, false) }}!</template>
  </div>
  <div v-else-if="e.type === 'proc_ability'" class="move ability">[{{ pn(e.src) }}'s {{ abilityList[e.ability].name }}]</div>
  <div v-else-if="e.type === 'copy_ability'">{{ pn(e.src) }} copied {{ pn(e.target, false) }}'s {{ abilityList[e.ability].name }}!</div>
  <div v-else-if="e.type === 'trace'">{{ pn(e.src) }} traced {{ pn(e.target, false) }}'s {{ abilityList[e.ability].name }}!</div>
  <div v-else-if="e.type === 'skill_swap'">{{ pn(e.src) }} swapped abilities with {{ pn(e.target, false) }}!</div>
  <div v-else-if="e.type === 'stockpile'">{{ pn(e.src) }} stockpiled {{ e.count }}!</div>
  <div v-else>Unknown event: <code>{{ e }}</code></div>
</template>

<style scoped>
@import "@/assets/colors.css";

div {
  @apply text-sm sm:text-base;
}

.muted {
  @apply text-xs sm:text-[0.8rem];
}
</style>

<script setup lang="ts">
import {hpPercentExact, playerId} from "~/game/utils";
import type {Generation} from "~/game/gen";
import {damageMessage} from "~/utils/uievent";
// Use itemList since gen.items doesn't include every item.
import {itemList} from "~/game/item";
import type {PlayerId, PokeId} from "~/game/events";
import {abilityList} from "~/game/species";

const {perspective, players, myId, e} = defineProps<{
  e: UIBattleEvent;
  players: Players;
  perspective: string;
  myId: string;
  gen: Generation;
}>();

const pn = (id: PokeId, title = true) => {
  if (playerId(id) === perspective) {
    return e[id];
  } else {
    return title ? `The opposing ${e[id]}` : `the opposing ${e[id]}`;
  }
};

const tn = (id: PokeId | PlayerId, title = true) => {
  if (playerId(id as PokeId) === perspective) {
    return title ? "Your team" : "your team";
  } else {
    return title ? "The opposing team" : "the opposing team";
  }
};

const eff = (id: PokeId, v?: number) => {
  if (players.byPokeId(id).active.length > 1) {
    return `It's ${
      (v ?? 1) > 1
        ? `super effective on ${pn(id, false)}!`
        : `not very effective on ${pn(id, false)}...`
    }`;
  } else {
    return `It's ${(v ?? 1) > 1 ? "super effective!" : "not very effective..."}`;
  }
};

const percent = (e: UIDamageEvent | UIRecoverEvent) => {
  let pv = Math.abs(e.hpPercentBefore - e.hpPercentAfter);
  if (e.hpBefore !== undefined && e.hpAfter !== undefined && e.maxHp !== undefined) {
    pv = roundTo(Math.abs(hpPercentExact(e.hpBefore! - e.hpAfter!, e.maxHp)), 1);
  }
  return pv === 0 ? "<1" : `${pv}`;
};

const tooltip = (e: UIDamageEvent | UIRecoverEvent) => {
  if (e.hpBefore !== undefined && e.hpAfter !== undefined) {
    return `${roundTo(Math.abs(e.hpBefore! - e.hpAfter!), 1)} HP`;
  }
  return "";
};
</script>
