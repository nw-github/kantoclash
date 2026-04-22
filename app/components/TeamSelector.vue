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
    >
      <template v-if="modelValue" #default="{modelValue}">
        <span class="truncate text-xs sm:text-base">{{ teamName(modelValue.name) }}</span>

        <div class="ml-auto flex">
          <BoxSprite
            v-for="({speciesId, form}, i) in modelValue.pokemon"
            :key="i"
            :species-id
            :form
            :scale="lessThanSm ? 0.8 : 1"
          />
        </div>
      </template>

      <template #item="{item: team}">
        <div class="w-full">
          <div class="flex items-center justify-between">
            <span class="truncate text-xs sm:text-base">{{ teamName(team.name) }}</span>
            <span class="text-nowrap text-xs text-muted">{{ formatInfo[team.format].name }}</span>
          </div>

          <div class="flex">
            <BoxSprite
              v-for="({speciesId, form}, i) in team.pokemon"
              :key="i"
              :species-id
              :form
              :scale="lessThanSm ? 1 : 1.2"
            />

            <div class="flex items-center ml-auto">
              <UButton
                label="Edit"
                icon="material-symbols:edit-square-outline"
                size="sm"
                color="neutral"
                variant="ghost"
                @click.stop="teamBuilderModal.open({team, undeletable: true})"
              />
            </div>
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
import TeamBuilderModal from "~/components/dialog/TeamBuilderModal.vue";

const teamBuilderModal = useOverlay().create(TeamBuilderModal);

const selectTeamMenu = useTemplateRef("selectTeamMenu");
const model = defineModel<Team | undefined>();
const {format} = defineProps<{format: FormatId; disabled?: boolean}>();

const myTeams = useMyTeams();
const validTeams = computed(() => {
  return myTeams.value
    .filter(team => formatInfo[team.format].generation === formatInfo[format].generation)
    .sort(team => (team.format === format ? -1 : 1));
});

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
