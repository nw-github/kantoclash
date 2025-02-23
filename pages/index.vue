<template>
  <div class="grid grid-rows-2 md:grid-cols-2 h-full overflow-y-auto">
    <div class="space-y-2 px-5">
      <h1 class="text-center">
        {{ user ? `Welcome ${user.name}!` : "You must first log in to find a battle" }}
      </h1>
      <div class="flex items-center gap-2">
        <FormatDropdown v-model="format" :disabled="findingMatch" class="grow" />
        <UPopover mode="hover">
          <UButton icon="material-symbols:info-outline-rounded" color="gray" variant="ghost" />
          <template #panel>
            <span class="p-1">{{ formatInfo[format].desc }}</span>
          </template>
        </UPopover>
      </div>
      <ClientOnly>
        <div ref="selectTeamMenu">
          <USelectMenu
            v-model="selectedTeam"
            searchable
            placeholder="Select Team..."
            :options="validTeams"
            :disabled="!formatInfo[format].needsTeam || findingMatch"
            option-attribute="name"
          />
        </div>
      </ClientOnly>
      <UButton :color="findingMatch ? 'red' : 'primary'" @click="enterMatchmaking">
        {{ cancelling ? "Cancelling..." : findingMatch ? "Cancel" : "Find Match" }}

        <template v-if="findingMatch || cancelling" #leading>
          <UIcon name="heroicons:arrow-path-20-solid" class="animate-spin size-5" />
        </template>
      </UButton>
    </div>

    <div class="space-y-2 px-5">
      <h1 class="text-center">Battles</h1>
      <div class="flex space-x-2">
        <FormatDropdown
          v-model="filterFormats"
          multiple
          class="w-1/2"
          placeholder="Filter by format..."
        />
        <UInput
          v-model="battleQuery"
          icon="heroicons:magnifying-glass-20-solid"
          :trailing="false"
          placeholder="Search..."
          class="w-full"
        />
        <UButton
          icon="material-symbols:refresh"
          :loading="loadingRooms"
          variant="ghost"
          color="gray"
          @click="loadRooms"
        />
      </div>
      <UTable :rows="filteredRooms" :columns="roomsCols" :empty-state="emptyState">
        <template #name-data="{ row }">
          <UButton :to="row.to">{{ row.name }}</UButton>
        </template>

        <template #type-data="{ row }">
          <div class="flex items-center space-x-1">
            <UIcon :name="formatInfo[row.format as FormatId].icon" class="size-5" />
            <span>{{ formatInfo[row.format as FormatId].name }}</span>
          </div>
        </template>
      </UTable>
    </div>

    <UModal v-model="modalOpen">
      <UAlert
        title="Your team is invalid!"
        :actions="[
          // Bring user to teambuilder
          // { variant: 'solid', color: 'primary', label: 'Fix', click: () =>  },
          { variant: 'solid', color: 'primary', label: 'OK', click: () => (modalOpen = false) },
        ]"
      >
        <template #description>
          <div class="max-h-60 overflow-auto">
            <div v-for="([poke, problems], i) in errors" :key="i">
              <span>{{ poke }}</span>
              <ul class="list-disc pl-8">
                <li v-for="(problem, j) in problems" :key="j">{{ problem }}</li>
              </ul>
            </div>
          </div>
        </template>
      </UAlert>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { speciesList } from "~/game/species";

const emit = defineEmits<{ (e: "requestLogin"): void }>();

const { $conn } = useNuxtApp();
const { user } = useUserSession();
const toast = useToast();
const findingMatch = ref(false);
const cancelling = ref(false);
const loadingRooms = ref(false);
const rooms = ref<{ to: string; name: string; format: FormatId }[]>([]);
const format = useLocalStorage<FormatId>("lastFormat", () => "randoms");
const selectedTeam = ref<Team | undefined>();
const myTeams = useMyTeams();
const validTeams = computed(() => myTeams.value.filter(team => team.format === format.value));
const modalOpen = ref(false);
const errors = ref<Record<number, [string, string[]]>>({});
const selectTeamMenu = ref<HTMLDivElement>();
const filterFormats = ref<string[]>([]);
const battleQuery = ref<string>("");
const filteredRooms = computed(() => {
  const q = battleQuery.value;
  const f = filterFormats.value;
  return rooms.value
    .filter(room => !q || room.name.toLowerCase().includes(q.toLowerCase()))
    .filter(room => !f.length || f.includes(room.format));
});

onMounted(() => useTitle("Standoff"));

watch(format, () => (selectedTeam.value = validTeams.value[0]));

const roomsCols = [
  { key: "type", label: "Type" },
  { key: "name", label: "Players" },
];
const emptyStateEmpty = {
  label: "There are currently no active battles. Be the first!",
  icon: "heroicons:circle-stack-20-solid",
};
const emptyStateFilter = {
  label: "No battles match this query.",
  icon: "heroicons:magnifying-glass-20-solid",
};
const emptyState = computed(() => {
  return filterFormats.value.length || battleQuery.value.length
    ? emptyStateFilter
    : emptyStateEmpty;
});

const onMaintenanceMode = (state: boolean) => {
  if (state) {
    findingMatch.value = false;
  }
};

onMounted(() => {
  loadRooms();
  $conn.on("maintenanceState", onMaintenanceMode);
});

onUnmounted(() => {
  $conn.off("maintenanceState", onMaintenanceMode);
  if (findingMatch.value) {
    $conn.emit("exitMatchmaking", () => {});
    findingMatch.value = false;
  }
});

const enterMatchmaking = () => {
  if (!user.value) {
    return emit("requestLogin");
  }

  if (formatInfo[format.value].needsTeam && !selectedTeam.value) {
    selectTeamMenu.value!.querySelector("button")?.click();
    return;
  }

  if (findingMatch.value) {
    cancelling.value = true;
    findingMatch.value = false;
    $conn.emit("exitMatchmaking", () => (cancelling.value = false));
    return;
  }

  findingMatch.value = true;

  const team = selectedTeam.value ? selectedTeam.value.pokemon.map(convertDesc) : undefined;
  $conn.emit("enterMatchmaking", team, format.value, (err, problems) => {
    if (!err) {
      return;
    }

    findingMatch.value = false;
    if (err === "must_login") {
      return toast.add({
        title: "Matchmaking failed!",
        description: "Try logging back in.",
        icon: "material-symbols:error-circle-rounded-outline-sharp",
      });
    } else if (err === "too_many") {
      return toast.add({
        title: "Matchmaking failed!",
        description: "You're already in too many battles.",
        icon: "material-symbols:error-circle-rounded-outline-sharp",
      });
    } else if (err === "maintenance") {
      return toast.add({
        title: "Matchmaking failed!",
        description: "Cannot start a new battle right now, maintenance mode is enabled.",
        icon: "material-symbols:error-circle-rounded-outline-sharp",
      });
    } else if (!problems) {
      return toast.add({
        title: "Matchmaking failed for an unknown reason.",
        icon: "material-symbols:error-circle-rounded-outline-sharp",
      });
    }

    const issues: Record<number, [string, string[]]> = {};
    for (const { path, message } of problems) {
      const [pokemon, category, index] = path as [number, string, number | string];
      const name =
        team![pokemon]?.name ||
        speciesList[team![pokemon]?.species]?.name ||
        (pokemon !== undefined && `Pokemon ${pokemon + 1}`) ||
        "General";
      const arr = (issues[pokemon] ??= [name, []]);
      if (category === "moves") {
        if (index) {
          arr[1].push(`Move '${team![pokemon].moves[index as number]}' is invalid: ${message}`);
        } else {
          arr[1].push(`Moves are invalid: ${message}`);
        }
      } else if (category === "statexp") {
        arr[1].push(`'${toTitleCase(index as string)}' EV is invalid: ${message}`);
      } else if (category === "dv") {
        arr[1].push(`'${toTitleCase(index as string)}' IV is invalid: ${message}`);
      } else {
        arr[1].push(`${message}`);
      }
    }

    errors.value = issues;
    modalOpen.value = true;
  });
};

const loadRooms = () => {
  loadingRooms.value = true;
  $conn.emit("getRooms", async result => {
    await delay(200);
    rooms.value = await Promise.all(
      result.map(async room => ({
        name: room.battlers.map(pl => pl.name).join(" vs. "),
        to: "/room/" + room.id,
        format: room.format,
      })),
    );
    loadingRooms.value = false;
  });
};
</script>
