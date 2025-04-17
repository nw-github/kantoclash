<template>
  <div class="flex items-center justify-center">
    <span class="pokesprite item" :class="item && getItemClass(item)" />
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
import type {Generation} from "~/game/gen";
import type {ItemId} from "~/game/item";

const {gen} = defineProps<{gen: Generation; item?: ItemId; scale?: number}>();

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
  blkapricorn: "blackapricorn",
  bluapricorn: "blueapricorn",
  grnapricorn: "greenapricorn",
  pnkapricorn: "pinkapricorn",
  redapricorn: "redapricorn",
  whtapricorn: "whiteapricorn",
  ylwapricorn: "yellowapricorn",
  itemfinder: "dowsingmachine",
  dowsingmchn: "dowsingmachine",
};

const getItemClass = (item: ItemId) => {
  if (itemMapping[item]) {
    return itemMapping[item];
  } else if (gen.items[item].tm) {
    const name = gen.items[item].tm! === "fight" ? "fighting" : gen.items[item].tm!;
    return name + (item.includes("tm") ? "tm" : "hm");
  } else if (item.includes("datacard")) {
    return "datacard";
  } else if (item.includes("secretkey")) {
    return "secretkeykanto";
  }

  return item;
};
</script>
