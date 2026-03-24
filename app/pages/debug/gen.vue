<template>
  <div class="space-y-2">
    <USelectMenu v-model="move" :items="moves" virtualize class="w-60" />

    <UFormField label="Generation">
      <UInputNumber v-model="genNumber" :min="0" :max="5" />
    </UFormField>

    <UButton label="Copy" @click="copy" />

    <div class="w-120 p-2 ring-2 ring-default">
      {{ describeMove(gen, move) }}
    </div>

    <pre>
      {{ {...gen.moveList[move], range: Range[gen.moveList[move].range]} }}
    </pre>
  </div>
</template>

<script setup lang="ts">
import {GENERATIONS} from "~~/game/gen";
import {Range} from "~~/game/utils";
import type {MoveId} from "~~/game/moves";

const move = ref<MoveId>("absorb");
const genNumber = ref(5);
const gen = computed(() => GENERATIONS[genNumber.value]!);
const moves = computed(() => Object.keys(gen.value.moveList));

const copy = async () => {
  await navigator.clipboard.writeText(
    moves.value
      .filter(move => gen.value.moveList[move as MoveId].idx! <= gen.value.lastMoveIdx)
      .map(move => gen.value.moveList[move as MoveId].name)
      .map(name => "https://bulbapedia.bulbagarden.net/wiki/" + name.replace(" ", "_") + "_(move)")
      .join("\n"),
  );
};
</script>
