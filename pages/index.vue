<template>
  <div class="grid grid-rows-2 sm:grid-cols-2">
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
            searchable
            placeholder="Select Team..."
            v-model="selectedTeam"
            :options="validTeams"
            :disabled="!formatInfo[format].needsTeam || findingMatch"
            option-attribute="name"
          />
        </div>
      </ClientOnly>
      <UButton @click="enterMatchmaking" :color="findingMatch ? 'red' : 'primary'">
        {{ cancelling ? "Cancelling..." : findingMatch ? "Cancel" : "Find Match" }}

        <template #leading v-if="findingMatch || cancelling">
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
      </div>
      <UTable :rows="roomsRows" :columns="roomsCols" :empty-state="emptyState">
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
          <div v-for="[poke, problems] in errors">
            <span>{{ poke }}</span>
            <ul class="list-disc pl-8">
              <li v-for="problem in problems">{{ problem }}</li>
            </ul>
          </div>
        </div>
      </template>
    </UAlert>
  </UModal>
</template>

<script setup lang="ts">
import { speciesList } from "~/game/species";
import type { RoomDescriptor } from "~/server/utils/gameServer";

const emit = defineEmits<{ (e: "requestLogin"): void }>();

const { $conn } = useNuxtApp();
const { user } = useUserSession();
const findingMatch = ref(false);
const cancelling = ref(false);
const rooms = ref<{ to: string; name: string; format: FormatId }[]>([]);
const format = useLocalStorage<FormatId>("lastFormat", () => "randoms");
const selectedTeam = ref<Team | undefined>();
const myTeams = useMyTeams();
const validTeams = computed(() => myTeams.value.filter(team => team.format === format.value));
const modalOpen = ref(false);
const errors = ref<Record<number, [string, string[]]>>({});
const selectTeamMenu = ref<HTMLDivElement>();

useTitle("Standoff");

watch(format, () => (selectedTeam.value = validTeams.value[0]));

const roomsRows = computed(() => rooms.value);

const roomsCols = [
  { key: "type", label: "Type" },
  { key: "name", label: "Players" },
];
const emptyState = {
  label: "There are currently no active battles. Be the first!",
  icon: "heroicons:circle-stack-20-solid",
};
const filterFormats = ref<string[]>([]);
const battleQuery = ref<string>();

onMounted(() => {
  const nameCache: Record<string, string> = {};
  $conn.emit("getRooms", async result => {
    rooms.value = await Promise.all(
      result.map(async room => ({
        name: (
          await Promise.all(
            room.battlers.map(
              async id =>
                (nameCache[id] ??= await $fetch(`/api/users/${id}`, { method: "GET" })
                  .then(res => res.name)
                  .catch(e => (console.log(e), "<unknown>"))),
            ),
          )
        ).join(" vs. "),
        to: "/room/" + room.id,
        format: room.format,
      })),
    );
  });
});

onUnmounted(() => {
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

  if (!findingMatch.value) {
    findingMatch.value = true;

    const team = selectedTeam.value ? selectedTeam.value.pokemon.map(convertDesc) : undefined;
    $conn.emit("enterMatchmaking", team, format.value, (err, problems) => {
      if (err) {
        findingMatch.value = false;
        if (!problems) {
          return;
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
      }
    });
  } else {
    cancelling.value = true;
    findingMatch.value = false;
    $conn.emit("exitMatchmaking", () => {
      cancelling.value = false;
    });
  }
};
</script>
