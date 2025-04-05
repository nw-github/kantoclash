<template>
  <div class="flex gap-1 w-full">
    <USelectMenu
      v-model="generation"
      :options="Object.keys(formats[category])"
      :disabled="Object.keys(formats[category]).length <= 1"
    />
    <USelectMenu v-model="category" class="w-full" :options="Object.keys(formats)" searchable />
  </div>
</template>

<script setup lang="ts">
const model = defineModel<FormatId>();

// const categories = [
//   "standard",
//   "double",
//   "random",
//   "randomdouble",
//   "randommetronome",
//   "randomnfe",
//   "nfe",
// ] as const;
//
// type Category = (typeof categories)[number];

const formats: Record<string, Record<string, FormatId>> = {
  "Standard Battle": {
    ADV: "g3_standard",
    GSC: "g2_standard",
    RBY: "g1_standard",
  },
  "Double Battle": {
    ADV: "g3_doubles",
  },
  "Random Battle": {
    ADV: "g3_randoms",
    GSC: "g2_randoms",
    RBY: "g1_randoms",
  },
  "Random Double Battle": {
    ADV: "g3_randoms_doubles",
  },
  "Random Metronome Battle": {
    GSC: "g2_metronome",
    RBY: "g1_metronome",
  },
  "Random NFE": {
    RBY: "g1_randoms_nfe",
  },
  NFE: {
    RBY: "g1_nfe",
  },
};

const category = useLocalStorage("lastCategory", "Random Battle");
watchImmediate(category, () => {
  if (!(category.value in formats)) {
    category.value = "Random Battle";
  }
});

const generation = useLocalStorage("lastGeneration", "ADV");
watchImmediate(category, category => {
  if (!(generation.value in formats[category])) {
    generation.value = Object.keys(formats[category])[0];
  }
});

watchImmediate([category, generation], ([category, generation]) => {
  model.value = formats[category as keyof typeof formats]?.[generation] ?? "g1_randoms";
});
</script>
