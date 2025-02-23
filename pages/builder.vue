<template>
  <UCard class="h-full flex flex-col" :ui="{ body: { base: 'grow overflow-auto' } }">
    <template #header>
      <h1 class="text-2xl text-center pb-5">Your Teams</h1>
      <div class="flex flex-col space-y-1 sm:space-y-0 sm:flex-row sm:space-x-2">
        <div class="flex space-x-1 w-full">
          <FormatDropdown v-model="formats" team-only multiple class="w-1/2" placeholder="Format" />
          <UInput
            v-model="query"
            icon="heroicons:magnifying-glass-20-solid"
            :trailing="false"
            placeholder="Search..."
            class="w-full"
          />
        </div>
        <div class="flex space-x-1">
          <UTooltip text="Import">
            <UButton
              color="green"
              icon="heroicons:arrow-down-tray-20-solid"
              variant="soft"
              @click="importTeam"
            />
          </UTooltip>
          <UTooltip text="New">
            <UButton color="green" icon="heroicons:plus-20-solid" variant="soft" @click="newTeam" />
          </UTooltip>
        </div>
      </div>
    </template>

    <div class="flex justify-center h-full">
      <div class="w-max">
        <div
          v-if="!filteredTeams.length"
          class="flex flex-col items-center justify-center flex-1 px-6 py-14 sm:px-14"
        >
          <template v-if="!filterFormats.length && !query">
            <UIcon
              name="i-heroicons:circle-stack-20-solid"
              class="size-6 mx-auto text-gray-400 dark:text-gray-500 mb-4"
            />
            <p class="text-sm text-center text-gray-900 dark:text-white">
              You don't have any teams.
            </p>
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

        <div
          v-for="(team, i) in filteredTeams"
          :key="i"
          class="space-y-1 py-1 divide-y divide-gray-200 dark:divide-gray-800"
        >
          <div class="flex justify-between items-end">
            <div class="">
              <span class="text-sm">{{ team.name }}</span>
              <div class="flex items-center space-x-1 text-xs">
                <UIcon :name="formatInfo[team.format as FormatId].icon" class="size-3" />
                <span>{{ formatInfo[team.format as FormatId].name }}</span>
              </div>
            </div>
            <div>
              <UTooltip
                v-for="({ icon, click, color, label }, j) in dropdownItems(team)"
                :key="j"
                :text="label"
              >
                <UButton
                  :icon="icon"
                  variant="ghost"
                  :color="color as any ?? 'gray'"
                  @click="click"
                />
              </UTooltip>
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

    <UModal v-model="open">
      <TeamBuilder
        v-if="editingTeam"
        :team="editingTeam"
        @delete="deleteTeam(editingTeam)"
        @close="editingTeam = undefined"
      />
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
import { speciesList, type Species } from "~/game/species";

const formats = ref<string[]>([]);
const toast = useToast();
const myTeams = useMyTeams();
const editingTeam = ref<Team>();
const open = computed({
  get() {
    return !!editingTeam.value;
  },
  set() {
    editingTeam.value = undefined;
  },
});
const isXS = useMediaQuery("(max-width: 480px)");

const query = ref("");
const filterFormats = ref<string[]>([]);
const filteredTeams = computed(() => {
  const q = query.value;
  const f = filterFormats.value;
  return myTeams.value
    .filter(team => !q || team.name.toLowerCase().includes(q.toLowerCase()))
    .filter(team => !f.length || f.includes(team.format));
});

onMounted(() => useTitle("Team Builder"));

const dropdownItems = (team: Team) => [
  {
    label: "Copy",
    icon: "material-symbols:content-copy-outline",
    async click() {
      await navigator.clipboard.writeText(serializeTeam(team));
      toast.add({ title: `'${team.name}' copied to clipboard!` });
    },
  },
  {
    label: "Edit",
    icon: "material-symbols:edit-square-outline",
    click() {
      editingTeam.value = team;
    },
  },
  {
    label: "Delete",
    icon: "material-symbols:delete-outline",
    color: "red",
    click: () => deleteTeam(team),
  },
];

const importTeam = async () => {
  const clipboard = await navigator.clipboard.readText();
  const team = clipboard
    .split("\n\n")
    .map(t => t.trim())
    .filter(t => t.length)
    .map(parsePokemon);
  if (!team.length) {
    return;
  }

  const len = myTeams.value.push({
    name: "New Team",
    pokemon: team,
    format: "standard",
  });
  editingTeam.value = myTeams.value[len - 1];
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

const newTeam = () => {
  const len = myTeams.value.push({
    name: "New Team",
    format: "standard",
    pokemon: [parsePokemon("")],
  });
  editingTeam.value = myTeams.value[len - 1];
};
</script>
