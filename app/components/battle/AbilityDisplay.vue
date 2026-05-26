<template>
  <div
    ref="sprite"
    class="sprite p-1 px-3 bg-muted/90 flex gap-1 items-center ring ring-inset ring-accented opacity-0"
    :class="invert ? 'rounded-tl-xl rounded-bl-xl flex-row-reverse' : 'rounded-tr-xl rounded-br-xl'"
  >
    <BoxSprite :species-id :form />
    <div class="text-center text-nowrap">
      <span class="truncate text-xs sm:text-sm">{{ pokeName }}'s</span>
      <div class="font-bold text-sm sm:text-default">{{ abilityName }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {FormId} from "~~/game/pokemon";
import type {SpeciesId} from "~~/game/species";

const {playerId, invert} = defineProps<{playerId: string; invert?: boolean}>();

const speciesId = ref<SpeciesId>();
const form = ref<FormId>();
const abilityName = ref();
const pokeName = ref();

const [, animate] = useAnimate();
const sprite = useTemplateRef("sprite");

const getId = () => playerId;

const playSlideIn = (
  pokeName_: string,
  speciesId_: SpeciesId,
  form_: FormId | undefined,
  abilityName_: string,
) => {
  speciesId.value = speciesId_;
  form.value = form_;
  abilityName.value = abilityName_;
  pokeName.value = pokeName_;

  return animate(
    [
      [sprite.value!, {x: [!invert ? -rem(20) : rem(20), 0], opacity: [0, 1]}, {duration: ms(250)}],
      [sprite.value, {x: [0, 0]}, {duration: ms(500)}],
    ],
    {repeat: 1, repeatType: "reverse"},
  );
};

defineExpose({getId, playSlideIn});
</script>
