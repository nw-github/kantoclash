<!-- prettier-ignore -->
<template>
  <div v-if="e.type === 'retract'" class="switch">
    <template v-if="e.src === perspective">Come back! {{ e.name }}!</template>
    <template v-else>{{ players[e.src].name }} withdrew {{ e.name }}!</template>
  </div>
  <div v-else-if="e.type === 'switch'" class="switch">
    <template v-if="e.src === perspective">Go! <b>{{ e.name }}</b>!</template>
    <template v-else>{{ players[e.src].name }} sent in <b>{{ e.name }}</b>!</template>
  </div>
  <div v-else-if="e.type === 'damage'">
    <p v-if="e.why === 'recoil'">{{ pn(e.src) }} was hurt by recoil!</p>
    <p v-else-if="e.why === 'crash'">{{ pn(e.src) }} kept going and crashed!</p>
    <p v-else-if="e.why === 'seeded'">{{ pn(e.src) }}'s health was sapped by Leech Seed!</p>
    <p v-else-if="e.why === 'psn'">{{ pn(e.src) }} is hurt by poison!</p>
    <p v-else-if="e.why === 'brn'">{{ pn(e.src) }} is hurt by burn!</p>
    <p v-else-if="e.why === 'attacked' && e.isCrit">A critical hit!</p>
    <p v-else-if="e.why === 'confusion'">It hurt itself in its confusion!</p>
    <p v-else-if="e.why === 'ohko'">It's a one-hit KO!</p>
    <p v-else-if="e.why === 'trap'">{{ pn(e.src) }}'s attack continues!</p>

    <p v-if="e.why === 'attacked' && e.hitCount === undefined && (e.eff ?? 1) !== 1" class="italic">
      {{ eff(e.eff) }}
    </p>

    <p v-if="e.why !== 'explosion'" class="text-xs sm:text-[0.8rem] text-[var(--stat-down)]">
      {{ pn(e.target) }} lost <b>{{ percent(e) }}%</b> of its health.
    </p>

    <template v-if="e.hitCount">
      <p v-if="(e.eff ?? 1) !== 1" class="italic">{{ eff(e.eff) }}</p>
      <p>Hit {{ e.hitCount }} time(s)!</p>
    </template>
  </div>
  <div v-else-if="e.type === 'get_sub'">{{ pn(e.src) }} put in a substitute!</div>
  <div v-else-if="e.type === 'faint'">{{ pn(e.src) }} fainted!</div>
  <div v-else-if="e.type === 'recover'">
    <p v-if="e.why === 'drain'">{{ pn(e.src) }} has its energy drained!</p>
    <p v-else-if="e.why === 'recover'">{{ pn(e.src) }} regained health!</p>
    <p v-else-if="e.why === 'rest'">{{ pn(e.src) }} started sleeping!</p>

    <p class="text-xs sm:text-[0.8rem] text-[var(--stat-up)]">
      {{ pn(e.target) }} gained <b>{{ percent(e) }}%</b> of its health.
    </p>
  </div>
  <div v-else-if="e.type === 'move'" class="move">
    <template v-if="e.thrashing && e.move !== 'rage'">{{ pn(e.src) }}'s thrashing about!</template>
    <template v-else-if="e.disabled">{{ pn(e.src) }}'s {{ moveList[e.move].name }} is disabled!</template>
    <template v-else>{{ pn(e.src) }} used <b>{{ moveList[e.move].name }}</b>!</template>
  </div>
  <div v-else-if="e.type === 'end'">
    <template v-if="e.victor === myId">You win!</template>
    <template v-else-if="e.victor"><b>{{ players[e.victor].name }}</b> wins!</template>
    <template v-else-if="e.why === 'too_long'">It's a draw! (Turn limit reached!)</template>
    <template v-else-if="e.why === 'endless'">It's a draw! (Endless battle detected!)</template>
    <template v-else>It's a draw!</template>
  </div>
  <div v-else-if="e.type === 'hit_sub'">
    <p v-if="e.confusion">It hurt itself in its confusion!</p>
    <p v-if="(e.eff ?? 1) !== 1" class="italic">{{ eff(e.eff) }}</p>
    <p>{{ pn(e.target) }}'s substitute took the hit!</p>
  </div>
  <div v-else-if="e.type === 'sub_break'">{{ pn(e.target) }}'s substitute broke!</div>
  <div v-else-if="e.type === 'status'">{{ pn(e.src) }} {{ statusTable[e.status] }}!</div>
  <div v-else-if="e.type === 'stages'">
    <p v-for="[stage, amount] of e.stages" :key="stage">
      {{ pn(e.src) }}'s {{ stageTable[stage] }} {{ amount > 0 ? "rose" : "fell" }}{{ Math.abs(amount) > 1 ? " sharply" : "" }}!
    </p>
  </div>
  <div v-else-if="e.type === 'info'" :class="{ confused: e.why === 'confused', move: e.why === 'sleep' || e.why === 'disable_end' || e.why === 'wake' }">
    <p v-if="e.why === 'ff' || e.why === 'ff_timer'">
      {{ infoMessage[e.why].replace("{}", players[e.src].name) }}
    </p>
    <p v-else>
      {{ infoMessage[e.why].replace("{}", pn(e.src)).replace("{l}", pn(e.src, false)) }}
    </p>

    <p v-if="e.why === 'fail_sleep_clause'">
      (Sleep Clause Mod: Only one Pokémon may be put to sleep at a time)
    </p>
  </div>
  <div v-else-if="e.type === 'transform'">{{ pn(e.src) }} transformed into {{ pn(e.target, false) }}!</div>
  <div v-else-if="e.type === 'disable'">{{ pn(e.src) }}'s {{ moveList[e.move].name }} was disabled!</div>
  <div v-else-if="e.type === 'charge'">{{ chargeMessage[e.move]?.replace("{}", pn(e.src)) }}</div>
  <div v-else-if="e.type === 'mimic'">{{ pn(e.src) }} learned {{ moveList[e.move].name }}!</div>
  <div v-else-if="e.type === 'conversion'">Converted type to match {{ pn(e.target, false) }}!</div>
  <div v-else>Unknown event: <code>{{ e }}</code></div>
</template>

<style scoped>
@import "@/assets/colors.css";

div {
  @apply text-sm sm:text-base;
}
</style>

<script setup lang="ts">
import { moveList } from "~/game/moveList";
import { hpPercentExact } from "~/game/utils";

const { perspective, players, myId, e } = defineProps<{
  e: UIBattleEvent;
  players: Record<string, ClientPlayer>;
  perspective: string;
  myId: string;
}>();

const pn = (id: string, title = true) => {
  if (id === perspective) {
    return e[id];
  } else if (title) {
    return `The opposing ${e[id]}`;
  } else {
    return `the opposing ${e[id]}`;
  }
};

const eff = (v?: number) => `It's ${(v ?? 1) > 1 ? "super effective!" : "not very effective..."}`;

const percent = (e: UIDamageEvent | UIRecoverEvent) => {
  let pv = Math.abs(e.hpPercentBefore - e.hpPercentAfter);
  if (e.target === myId && e.maxHp !== undefined) {
    pv = roundTo(Math.abs(hpPercentExact(e.hpBefore! - e.hpAfter!, e.maxHp)), 1);
  }
  return pv === 0 ? "<1" : `${pv}`;
};
</script>
