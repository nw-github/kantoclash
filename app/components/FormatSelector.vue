<template>
  <div class="flex gap-1 w-full">
    <USelectMenu
      v-model="generation"
      :items="Object.keys(formats[category])"
      :disabled="Object.keys(formats[category]).length <= 1"
      :search-input="false"
    />
    <USelectMenu
      v-model="category"
      class="grow overflow-hidden"
      :items="Object.keys(formats)"
      :ui="{content: 'min-w-fit'}"
    />

    <slot name="trailing"></slot>
  </div>
</template>

<script setup lang="ts">
const model = defineModel<FormatId>();

const showBetaFormats = computed(() => useUserSession().user.value?.admin);

const formats = computed(() => {
  const gens = ["RBY", "GSC", "ADV", "DPP", "BW2"];
  const names: Record<string, string> = {
    standard: "Standard Battle",
    doubles: "Double Battle",
    randoms: "Random Battle",
    randoms_doubles: "Random Double Battle",
    metronome: "Random Metronome Battle",
    randoms_nfe: "Random NFE",
    nfe: "NFE",
  };

  const result: Record<string, Record<string, FormatId>> = {};
  for (const k in names) {
    result[names[k]] = {};
  }

  for (const format of battleFormats.toSorted().toReversed()) {
    if (formatInfo[format].beta && !showBetaFormats.value) {
      continue;
    }

    const gen = format.slice(0, format.indexOf("_"));
    const name = format.slice(format.indexOf("_") + 1);
    result[names[name] ?? name][gens[+gen[1] - 1]] = format;
  }

  return result;
});

const category = useLocalStorage("lastCategory", "Random Battle");
const generation = useLocalStorage("lastGeneration", "ADV");

watchImmediate([category, generation, formats], () => {
  if (!(category.value in formats.value)) {
    category.value = Object.keys(formats.value)[0];
  }

  if (!(generation.value in formats.value[category.value])) {
    generation.value = Object.keys(formats.value[category.value])[0];
  }

  model.value = formats.value[category.value]?.[generation.value] ?? "g1_randoms";
});
</script>
