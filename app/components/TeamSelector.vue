<template>
  <div ref="selectTeamMenu">
    <USelectMenu
      v-model="model"
      class="w-full"
      :placeholder="
        formatInfo[format].needsTeam ? 'Select team...' : 'No team required for this mode...'
      "
      :items="validTeams"
      :disabled="!formatInfo[format].needsTeam || disabled"
      option-attribute="name"
      clear-search-on-close
    >
      <template #item="{item: team}">
        <div>
          <span class="truncate text-xs sm:text-base">{{ team.name }}</span>

          <div class="flex justify-center">
            <BoxSprite
              v-for="({speciesId, form}, i) in team.pokemon"
              :key="i"
              :species-id
              :form
              :scale="lessThanSm ? 1 : 1.2"
            />
          </div>
        </div>
      </template>

      <template #empty>
        <span>
          You don't have any teams for this format.
          <ULink
            :to="`/builder?new_team=${format}`"
            active-class="text-primary"
            inactive-class="text-highlighted hover:text-dimmed"
          >
            Make one</ULink
          >!
        </span>
      </template>
    </USelectMenu>
  </div>
</template>

<script setup lang="ts">
import {breakpointsTailwind} from "@vueuse/core";

const selectTeamMenu = ref<HTMLDivElement>();
const model = defineModel<Team | undefined>();
const {format} = defineProps<{format: FormatId; disabled?: boolean}>();

const myTeams = useMyTeams();
const validTeams = computed(() => myTeams.value.filter(team => team.format === format));

const breakpoint = useBreakpoints(breakpointsTailwind);
const lessThanSm = breakpoint.smaller("sm");

watch(validTeams, () => (model.value = undefined));

const raise = () => {
  if (selectTeamMenu.value) {
    selectTeamMenu.value.querySelector("button")?.click();
  }
};

defineExpose({raise});
</script>
