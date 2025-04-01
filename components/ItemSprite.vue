<template>
  <div class="flex items-center justify-center">
    <span class="pokesprite item" :class="item && (itemMapping[item] ?? item)" />
  </div>
</template>

<style scoped>
@import url("/assets/item-sprites.css");

div {
  --scale: v-bind("scale ?? 1");

  width: calc(32px * var(--scale));
  height: calc(30px * var(--scale));
}

span {
  transform: scale(var(--scale)) translateY(v-bind("scale ? '25%' : '0%'"));
}
</style>

<script setup lang="ts">
import type {ItemId} from "~/game/item";

defineProps<{item?: ItemId; scale?: number}>();

const itemMapping: Partial<Record<ItemId, string>> = {
  polkadotbow: "silkscarf",
  pinkbow: "silkscarf",
  berry: "oranberry",
  psncureberry: "pechaberry",
  przcureberry: "cheriberry",
  burntberry: "aspearberry",
  iceberry: "rawstberry",
  bitterberry: "persimberry",
  mintberry: "chestoberry",
  miracleberry: "lumberry",
  mysteryberry: "leppaberry",
  berserkgene: "",
  goldberry: "sitrusberry",
  xdefend: "xdefense",
  parlyzheal: "paralyzeheal",
  xspecial: "xspatk",
};
</script>
