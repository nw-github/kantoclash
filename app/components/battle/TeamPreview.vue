<template>
  <div>
    <div
      v-for="({speciesId, hasItem, gender, form}, i) in preview"
      :key="i"
      class="flex items-center"
      :class="reverse && 'flex-row-reverse'"
    >
      <TouchPopover>
        <BoxSprite :species-id :form :scale="lessThanSm ? 1 : 1.5" />

        <template #content>
          <PreviewPopoverContent :gen :format :species-id :has-item />
        </template>
      </TouchPopover>

      <div class="flex items-center gap-1">
        <span class="text-xs sm:text-sm truncate">{{ gen.speciesList[speciesId].name }}</span>
        <GenderIcon :gender />
      </div>
      <TouchTooltip v-if="hasItem" text="Holding an Item" class="px-1">
        <div>
          <img :srcset="`/sprites/item.png ${lessThanSm ? '1' : '0.75'}x`" />
        </div>
      </TouchTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {Generation} from "~~/game/gen";
import type {TeamPreview} from "~~/server/gameServer";
import {breakpointsTailwind} from "@vueuse/core";

defineProps<{preview: TeamPreview; gen: Generation; format: FormatId; reverse?: boolean}>();

const breakpoint = useBreakpoints(breakpointsTailwind);
const lessThanSm = breakpoint.smaller("sm");
</script>

<style scoped>
img {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  image-rendering: crisp-edges;
}
</style>
