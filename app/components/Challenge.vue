<template>
  <div :key="challenge.from.id" class="space-y-2 pt-2">
    <USeparator>
      <div class="flex items-center gap-2">
        <UIcon :name="formatInfo[challenge.format].icon" />
        <span>{{ formatInfo[challenge.format].name }} - {{ challenge.from.name }}</span>
      </div>
    </USeparator>

    <TeamSelector ref="selectTeamMenu" v-model="team" :format="challenge.format" />

    <div class="flex gap-1">
      <UButton icon="material-symbols:check" label="Accept" :disabled @click="accept" />
      <UButton
        icon="material-symbols:close-rounded"
        label="Reject"
        :disabled
        @click="$emit('reject')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type {TeamSelector} from "#components";
import type {Challenge} from "~~/server/gameServer";

const {challenge} = defineProps<{challenge: Challenge; disabled?: boolean}>();
const emit = defineEmits<{reject: []; accept: [team?: Team]}>();

const team = ref<Team>();
const selectTeamMenu = useTemplateRef("selectTeamMenu");

const accept = () => {
  if (formatInfo[challenge.format].needsTeam && !team.value) {
    selectTeamMenu.value!.raise();
    return;
  }

  emit("accept", team.value);
};
</script>
