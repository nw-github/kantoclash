<template>
  <UCard class="h-full flex flex-col" :ui="{ body: { base: 'grow overflow-auto' } }">
    <template #header>
      <h1 class="text-2xl text-center pb-5">Your Teams</h1>
      <div class="flex flex-col sm:flex-row gap-1">
        <div class="flex gap-1 w-full">
          <FormatDropdown v-model="formats" team-only multiple class="w-1/2" placeholder="Format" />
          <UInput
            v-model="query"
            icon="heroicons:magnifying-glass-20-solid"
            :trailing="false"
            placeholder="Search..."
            class="w-full"
          />
        </div>
        <div class="flex gap-1">
          <UTooltip text="Import">
            <UButton
              color="green"
              icon="heroicons:arrow-down-tray-20-solid"
              variant="soft"
              @click="onImportClick"
            />
          </UTooltip>
          <UTooltip text="Export">
            <UButton
              color="green"
              icon="heroicons:arrow-up-tray-20-solid"
              variant="soft"
              @click="onExportClick"
            />
          </UTooltip>
          <UTooltip text="New">
            <UButton
              color="green"
              icon="heroicons:plus-20-solid"
              variant="soft"
              @click="newTeam()"
            />
          </UTooltip>
        </div>
      </div>
    </template>

    <div class="flex justify-center h-full">
      <div
        v-if="!filteredTeams.length"
        class="flex flex-col items-center justify-center flex-1 px-6 py-14 sm:px-14"
      >
        <template v-if="!formats.length && !query">
          <UIcon
            name="i-heroicons:circle-stack-20-solid"
            class="size-6 mx-auto text-gray-400 dark:text-gray-500 mb-4"
          />
          <p class="text-sm text-center text-gray-900 dark:text-white">You don't have any teams.</p>
        </template>
        <template v-else>
          <UIcon
            name="i-heroicons:circle-stack-20-solid"
            class="size-6 mx-auto text-gray-400 dark:text-gray-500 mb-4"
          />
          <p class="text-sm text-center text-gray-900 dark:text-white">
            No teams match this query.
          </p>
        </template>
      </div>

      <div class="w-max lg:grid lg:grid-cols-2 lg:gap-x-10">
        <div
          v-for="(team, i) in filteredTeams.slice((page - 1) * pageCount, page * pageCount)"
          :key="i"
          class="space-y-1 py-1 divide-y divide-gray-200 dark:divide-gray-800"
        >
          <div class="flex justify-between items-end">
            <div>
              <span class="text-sm truncate">{{ team.name }}</span>
              <div class="flex items-center gap-1 text-xs">
                <UIcon :name="formatInfo[team.format as FormatId].icon" class="size-3" />
                <span>{{ formatInfo[team.format as FormatId].name }}</span>
              </div>
            </div>
            <div>
              <TooltipButton
                text="Copy"
                icon="material-symbols:content-copy-outline"
                color="gray"
                variant="ghost"
                @click="copyTeam(team)"
              />
              <TooltipButton
                text="Duplicate"
                icon="material-symbols:file-copy-outline"
                color="gray"
                variant="ghost"
                @click="duplicateTeam(team)"
              />
              <TooltipButton
                text="Edit"
                icon="material-symbols:edit-square-outline"
                color="gray"
                variant="ghost"
                @click="editingTeam = team"
              />
              <TooltipButton
                text="Delete"
                icon="material-symbols:delete-outline"
                color="red"
                variant="ghost"
                @click="deleteTeam(team)"
              />

              <!-- <UTooltip text="Delete">
                <UButton icon="material-symbols:delete-outline" color="red" variant="ghost" />
              </UTooltip> -->
            </div>
          </div>
          <div class="flex justify-center">
            <Sprite
              v-for="(poke, j) in team.pokemon"
              :key="j"
              :species="(speciesList as Record<string, Species>)[poke.species]"
              :scale="isXS ? 1.5 : 2"
              kind="box"
            />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-center">
        <UPagination v-model="page" :page-count :total="filteredTeams.length" />
      </div>
    </template>

    <UModal v-model="open">
      <TeamBuilder
        v-if="editingTeam"
        :team="editingTeam"
        @delete="deleteTeam(editingTeam)"
        @close="editingTeam = undefined"
      />
    </UModal>

    <UModal v-model="importOpen">
      <UTextarea
        v-model="importText"
        :ui="{ base: 'h-full min-h-[23.5rem]', rounded: 'rounded-lg' }"
        :placeholder="exportMode ? undefined : 'Paste your team(s) here...'"
        variant="none"
      >
        <TooltipButton
          v-if="!exportMode"
          text="Import"
          :popper="{ placement: 'bottom-end', offsetDistance: 40 }"
          class="absolute top-2 right-2"
          icon="heroicons:arrow-down-tray-20-solid"
          variant="ghost"
          color="gray"
          @click="importOrCopy"
        />
        <TooltipButton
          v-else
          text="Copy"
          :popper="{ placement: 'bottom-end', offsetDistance: 40 }"
          class="absolute top-2 right-2"
          icon="material-symbols:content-copy-outline"
          variant="ghost"
          color="gray"
          @click="importOrCopy"
        />
      </UTextarea>
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
import { breakpointsTailwind } from "@vueuse/core";
import { speciesList, type Species } from "~/game/species";

const toast = useToast();
const myTeams = useMyTeams();
const editingTeam = ref<Team>();
const importText = ref("");
const open = computed({
  get() {
    return !!editingTeam.value;
  },
  set() {
    editingTeam.value = undefined;
  },
});
const importOpen = ref(false);
const exportMode = ref(false);
const isXS = useMediaQuery("(max-width: 480px)");
const breakpoints = useBreakpoints(breakpointsTailwind);
const isLgOrGreater = breakpoints.greaterOrEqual("lg");
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

onMounted(() => {
  useTitle("Team Builder");

  const format = String(useRoute().query.new_team);
  useRouter().replace({ query: {} });
  if ((battleFormats as readonly string[]).includes(format)) {
    newTeam(format as FormatId);
  }
});

const importOrCopy = async () => {
  importOpen.value = false;
  if (exportMode.value) {
    await navigator.clipboard.writeText(importText.value);
    toast.add({ title: `Copied to clipboard!` });
    return;
  }

  const teams = parseTeams(importText.value);
  importText.value = "";
  myTeams.value.unshift(...teams);
  if (teams.length === 1) {
    editingTeam.value = myTeams.value.at(-1);
  } else if (!teams.length) {
    toast.add({
      title: "Malformed Input!",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  }
};

const deleteTeam = (team: Team) => {
  editingTeam.value = undefined;

  const idx = myTeams.value.indexOf(team);
  const [removed] = myTeams.value.splice(idx, 1);
  toast.add({
    title: `'${team.name}' deleted!`,
    actions: [{ label: "Undo", click: () => myTeams.value.splice(idx, 0, removed) }],
  });
};

const newTeam = (format: FormatId = "g1_standard") => {
  myTeams.value.unshift({
    name: "New Team",
    format,
    pokemon: [parsePokemon("")],
  });
  editingTeam.value = myTeams.value[0];
};

const copyTeam = async (team: Team) => {
  await navigator.clipboard.writeText(teamToString(team));
  toast.add({ title: `'${team.name}' copied to clipboard!` });
};

const duplicateTeam = (team: Team) => {
  const newTeam: Team = JSON.parse(JSON.stringify(team));
  const teamNames = new Set(
    myTeams.value.filter(team => team.name.startsWith(newTeam.name)).map(team => team.name),
  );
  for (let i = 1; ; i++) {
    const name = newTeam.name + ` (${i})`;
    if (!teamNames.has(name)) {
      newTeam.name = name;
      break;
    }
  }

  myTeams.value.splice(myTeams.value.indexOf(team) + 1, 0, newTeam);
};

const onImportClick = () => {
  importOpen.value = true;
  exportMode.value = false;
  importText.value = "";
};

const onExportClick = () => {
  importOpen.value = exportMode.value = true;
  importText.value = myTeams.value.map(teamToString).join("\n");
};
</script>
