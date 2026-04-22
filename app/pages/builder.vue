<template>
  <UCard class="h-full flex flex-col" :ui="{body: 'grow overflow-auto'}">
    <template #header>
      <h1 class="text-2xl text-center pb-5">My Teams</h1>
      <div class="flex flex-col sm:flex-row gap-1">
        <div class="flex gap-1 w-full">
          <FormatDropdown v-model="formats" team-only multiple class="w-48" placeholder="Format" />
          <UInput
            v-model="query"
            icon="heroicons:magnifying-glass-20-solid"
            :trailing="false"
            placeholder="Search..."
            class="w-full"
          />
        </div>
        <div class="flex gap-1">
          <TooltipButton
            text="Import"
            color="success"
            icon="heroicons:arrow-down-tray-20-solid"
            variant="soft"
            @click="onImportClick"
          />
          <TooltipButton
            text="Export"
            color="success"
            icon="heroicons:arrow-up-tray-20-solid"
            variant="soft"
            @click="onExportClick"
          />
          <TooltipButton
            text="New"
            color="success"
            icon="heroicons:plus-20-solid"
            variant="soft"
            @click="() => newTeam()"
          />
        </div>
      </div>
    </template>

    <div class="flex justify-center h-full">
      <template v-if="!filteredTeams.length">
        <UEmpty
          v-if="formats.length || query"
          variant="naked"
          size="sm"
          icon="heroicons:magnifying-glass-20-solid"
          title="No battles match this query."
          :actions="[
            {
              label: 'Clear',
              color: 'neutral',
              variant: 'subtle',
              icon: 'lucide:x',
              onClick: () => void ((formats = []), (query = '')),
            },
          ]"
        />
        <UEmpty
          v-else
          variant="naked"
          size="sm"
          icon="heroicons:circle-stack-20-solid"
          title="You don't have any teams."
          :actions="[
            {
              label: 'Create New',
              color: 'success',
              variant: 'subtle',
              icon: 'heroicons:plus-20-solid',
              onClick: () => newTeam(),
            },
          ]"
        />
      </template>

      <div class="w-max lg:grid lg:grid-cols-2 lg:gap-x-10">
        <div
          v-for="(team, i) in filteredTeams.slice((page - 1) * pageCount, page * pageCount)"
          :key="i"
          class="space-y-1 py-1 divide-y divide-default"
        >
          <div class="flex items-end pb-1">
            <div class="overflow-hidden truncate">
              <span class="text-sm">{{ teamName(team.name) }}</span>
              <div class="flex items-center gap-1 text-xs text-muted">
                <UIcon :name="formatInfo[team.format as FormatId].icon" class="size-3" />
                <span>{{ formatInfo[team.format as FormatId].name }}</span>
              </div>
            </div>
            <TooltipButton
              class="ml-auto"
              text="Copy"
              icon="material-symbols:content-copy-outline"
              color="neutral"
              variant="ghost"
              @click="() => copyTeam(team)"
            />
            <TooltipButton
              text="Duplicate"
              icon="material-symbols:file-copy-outline"
              color="neutral"
              variant="ghost"
              @click="() => duplicateTeam(team)"
            />
            <TooltipButton
              text="Edit"
              icon="material-symbols:edit-square-outline"
              color="neutral"
              variant="ghost"
              @click="() => editTeam(team)"
            />
            <TooltipButton
              text="Delete"
              icon="material-symbols:delete-outline"
              color="error"
              variant="ghost"
              @click="() => deleteTeam(team)"
            />
          </div>
          <div class="flex justify-center">
            <BoxSprite
              v-for="(poke, j) in team.pokemon"
              :key="j"
              :species-id="(poke.speciesId as SpeciesId)"
              :scale="isXS ? 1.2 : !isMdOrGreater ? 1.5 : 1.9"
              :form="(poke.form as FormId)"
            />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-center">
        <UPagination
          v-model:page="page"
          :items-per-page="pageCount"
          :total="filteredTeams.length"
        />
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import {breakpointsTailwind} from "@vueuse/core";
import ImportTeamsModal from "~/components/dialog/ImportTeamsModal.vue";
import TeamBuilderModal from "~/components/dialog/TeamBuilderModal.vue";
import type {FormId} from "~~/game/pokemon";
import type {SpeciesId} from "~~/game/species";

const modal = useOverlay();
const importTeamsModal = modal.create(ImportTeamsModal);
const teamBuilderModal = modal.create(TeamBuilderModal);

const toast = useToast();
const myTeams = useMyTeams();
const breakpoints = useBreakpoints(breakpointsTailwind);
const isLgOrGreater = breakpoints.greaterOrEqual("lg");
const isXS = breakpoints.smaller("sm");
const isMdOrGreater = breakpoints.greaterOrEqual("md");
const query = ref("");
const formats = ref<string[]>([]);
const pageCount = computed(() => (isLgOrGreater.value ? 10 : 5));
const page = ref(1);
const filteredTeams = computed(() => {
  const q = query.value;
  const f = formats.value;
  return myTeams.value
    .filter(team => !q || team.name.toLowerCase().includes(q.toLowerCase()))
    .filter(team => !f.length || f.includes(team.format));
});
watch([pageCount, filteredTeams], () => (page.value = 1));

const router = useRouter();

onMounted(() => {
  useTitle("Team Builder | Kanto Clash");

  const route = useRoute();
  const format = String(route.query.new_team);
  const editing = +String(route.query.editing);

  router.replace({query: {}});
  if (battleFormats.includes(format)) {
    newTeam(format);
  } else if (myTeams.value[editing]) {
    editTeam(myTeams.value[editing]);
  }
});

const editTeam = async (team: Team) => {
  router.replace({query: {editing: myTeams.value.indexOf(team)}});

  const shouldDelete = await teamBuilderModal.open({team});
  router.replace({query: {}});

  if (shouldDelete) {
    deleteTeam(team);
  }
};

const deleteTeam = (team: Team) => {
  const idx = myTeams.value.indexOf(team);
  const [removed] = myTeams.value.splice(idx, 1);
  toast.add({
    title: `'${teamName(team.name)}' deleted!`,
    actions: [{label: "Undo", onClick: () => void myTeams.value.splice(idx, 0, removed)}],
  });
};

const newTeam = (format: FormatId = "g1_standard") => {
  myTeams.value.unshift({
    name: "New Team",
    format,
    pokemon: [parsePokemon(format, "")],
    id: crypto.randomUUID(),
  });
  editTeam(myTeams.value[0]);
};

const copyTeam = async (team: Team) => {
  await navigator.clipboard.writeText(teamToString(team));
  toast.add({title: `'${teamName(team.name)}' copied to clipboard!`});
};

const duplicateTeam = (team: Team) => {
  const newTeam: Team = JSON.parse(JSON.stringify(team));
  const teamNames = new Set(
    myTeams.value.filter(team => team.name.startsWith(newTeam.name)).map(team => team.name),
  );
  newTeam.id = crypto.randomUUID();
  for (let i = 1; ; i++) {
    const name = newTeam.name + ` (${i})`;
    if (!teamNames.has(name)) {
      newTeam.name = name;
      break;
    }
  }

  const idx = myTeams.value.indexOf(team);
  myTeams.value.splice(idx, 0, newTeam);
  editTeam(myTeams.value[idx]);
};

const onImportClick = async () => {
  const res = await importTeamsModal.open({text: "", exportMode: false});
  if (res?.accepted) {
    const teams = parseTeams(res.text);
    myTeams.value.unshift(...teams);
    if (teams.length === 1) {
      editTeam(myTeams.value[0]);
    } else if (!teams.length) {
      toast.add({
        title: "Malformed Input!",
        icon: "material-symbols:error-circle-rounded-outline-sharp",
      });
    }
  }
};

const onExportClick = async () => {
  const text = myTeams.value.map(teamToString).join("\n");
  const res = await importTeamsModal.open({text, exportMode: true});
  if (res?.accepted) {
    await navigator.clipboard.writeText(res.text);
    toast.add({title: `Copied to clipboard!`});
  }
};
</script>
