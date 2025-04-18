<template>
  <div class="flex flex-col gap-4 md:gap-0 md:grid md:grid-cols-2 h-full overflow-y-auto">
    <div class="space-y-2 px-5 md:overflow-y-auto">
      <h1 class="text-center">
        {{ user ? `Welcome ${user.name}!` : "You must first log in to find a battle" }}
      </h1>
      <ClientOnly>
        <div class="flex items-center gap-1.5">
          <FormatSelector2 v-model="selectedFormat" />
          <FormatInfoButton :format="selectedFormat" />
        </div>
        <TeamSelector
          ref="selectTeamMenu"
          v-model="selectedTeam"
          :format="selectedFormat"
          :disabled="findingMatch"
        />
      </ClientOnly>
      <div class="relative">
        <USelectMenu
          v-model="challengeUser"
          placeholder="Challenge a user..."
          :searchable="searchUsers"
          option-attribute="name"
          :loading="loading"
          by="name"
          :disabled="findingMatch || cancelling"
        >
        </USelectMenu>
        <UButton
          class="absolute top-0 right-8"
          icon="material-symbols:close"
          variant="link"
          color="gray"
          :disabled="!challengeUser || findingMatch || cancelling"
          @click="challengeUser = undefined"
        />
      </div>

      <UButton
        :color="findingMatch ? 'red' : 'primary'"
        :disabled="acceptingChallenge"
        icon="heroicons:magnifying-glass-20-solid"
        @click="enterMatchmaking"
      >
        {{
          cancelling
            ? "Cancelling..."
            : findingMatch
            ? "Cancel"
            : challengeUser
            ? "Send Challenge"
            : "Find Match"
        }}

        <template v-if="findingMatch || cancelling" #leading>
          <UIcon name="heroicons:arrow-path-20-solid" class="animate-spin size-5" />
        </template>
      </UButton>

      <Challenge
        v-for="challenge of challenges"
        :key="challenge.from.id"
        :challenge
        :disabled="findingMatch || cancelling || acceptingChallenge"
        @accept="team => respondToChallenge(true, challenge, team)"
        @reject="respondToChallenge(false, challenge)"
      />
    </div>

    <div class="space-y-2 px-5">
      <h1 class="text-center">Battles</h1>
      <div class="flex gap-2">
        <FormatDropdown
          v-model="filterFormats"
          no-icons
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
        <TooltipButton
          text="Refresh"
          icon="material-symbols:refresh"
          :loading="loadingRooms"
          variant="ghost"
          color="gray"
          @click="loadRooms"
        />
      </div>
      <UCheckbox v-model="recentlyPlayed" label="Recently Played" />
      <UTable :rows="filteredRooms" :columns="roomsCols" :empty-state="emptyState">
        <template #live-data="{row}">
          <UIcon
            class="size-6"
            :name="row.live ? 'material-symbols:check' : 'material-symbols:add-2'"
            :class="!row.live && 'rotate-45'"
          />
        </template>

        <template #name-data="{row}">
          <UButton :to="row.to">{{ row.name }}</UButton>
        </template>

        <template #type-data="{row}">
          <div class="flex items-center gap-1">
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
          {variant: 'solid', color: 'primary', label: 'OK', click: () => (modalOpen = false)},
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
import type {TeamSelector} from "#components";
import type {PokemonDesc} from "~/game/pokemon";
import {speciesList, type SpeciesId} from "~/game/species";
import type {Battler, Challenge, MMError} from "~/server/gameServer";

const emit = defineEmits<{(e: "requestLogin"): void}>();

const {$conn} = useNuxtApp();
const {user} = useUserSession();
const toast = useToast();

const findingMatch = ref(false);
const cancelling = ref(false);
const loadingRooms = ref(false);
const acceptingChallenge = ref(false);
const modalOpen = ref(false);
const recentlyPlayed = useLocalStorage("showRecentlyPlayed", true);
const selectedTeam = ref<Team | undefined>();
const errors = ref<Record<number, [string, string[]]>>({});
const selectTeamMenu = ref<InstanceType<typeof TeamSelector>>();

const rooms = ref<{to: string; name: string; format: FormatId; live: bool}[]>([]);
const filterFormats = ref<string[]>([]);
const battleQuery = ref("");
const challengeUser = ref<Battler>();
const challenges = useChallenges();
const filteredRooms = computed(() => {
  const q = battleQuery.value;
  const f = filterFormats.value;
  return rooms.value
    .filter(room => !q || room.name.toLowerCase().includes(q.toLowerCase()))
    .filter(room => !f.length || f.includes(room.format))
    .filter(room => recentlyPlayed.value || room.live);
});
const selectedFormat = ref<FormatId>("g1_randoms");

const roomsCols = [
  {key: "live", label: "Live"},
  {key: "type", label: "Type"},
  {key: "name", label: "Players"},
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

const onMaintenanceMode = (state: bool) => state && (findingMatch.value = false);
const onChallengeRejected = () => (findingMatch.value = false);

useTitle("Kanto Clash");

onMounted(() => {
  loadRooms();
  $conn.on("maintenanceState", onMaintenanceMode);
  $conn.on("challengeRejected", onChallengeRejected);
});

onUnmounted(() => {
  $conn.off("maintenanceState", onMaintenanceMode);
  $conn.off("challengeRejected", onChallengeRejected);
  if (findingMatch.value) {
    $conn.emit("exitMatchmaking", () => {});
    findingMatch.value = false;
  }
});

const enterMatchmaking = () => {
  if (!$conn.connected) {
    return toast.add({
      title: "Disconnected",
      description: "You are not currently connected to the server! Try refreshing the page.",
    });
  }

  if (!user.value) {
    return emit("requestLogin");
  }

  if (formatInfo[selectedFormat.value].needsTeam && !selectedTeam.value) {
    selectTeamMenu.value!.raise();
    return;
  }

  if (findingMatch.value) {
    cancelling.value = true;
    findingMatch.value = false;
    $conn.emit("exitMatchmaking", () => (cancelling.value = false));
    return;
  }

  findingMatch.value = true;

  const team = selectedTeam.value && convertTeam(selectedTeam.value);
  $conn.emit(
    "enterMatchmaking",
    team,
    selectedFormat.value,
    challengeUser.value?.id,
    (err, problems) => enterMMCallback(team, err, problems),
  );
};

const respondToChallenge = (accept: bool, challenge: Challenge, selected?: Team) => {
  acceptingChallenge.value = true;

  const team = accept && selected ? convertTeam(selected) : undefined;
  $conn.emit("respondToChallenge", challenge.from.id, accept, team, (err, problems) => {
    acceptingChallenge.value = false;
    let idx;
    if (!err && (idx = challenges.value.indexOf(challenge)) !== -1) {
      challenges.value.splice(idx);
    }

    enterMMCallback(team, err, problems);
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
        live: !room.finished,
      })),
    );
    loadingRooms.value = false;
  });
};

const loading = ref(false);

const searchUsers = async (q: string) => {
  loading.value = true;

  return new Promise<Battler[]>(resolve => {
    $conn.emit("getOnlineUsers", q, res => {
      loading.value = false;
      resolve(res);
    });
  });
};

const enterMMCallback = (team?: PokemonDesc[], err?: MMError, problems?: TeamProblems) => {
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
      description:
        "Cannot start a new battle right now, the server will soon be going down for maintenance.",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "bad_user") {
    return toast.add({
      title: "Matchmaking failed!",
      description: "User is offline or does not exist.",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (!problems) {
    return toast.add({
      title: "Matchmaking failed for an unknown reason.",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  }

  const issues: Record<number, [string, string[]]> = {};
  for (const {path, message} of problems) {
    const [pokemon, category, index] = path as [number, string, number | string];
    // We're just getting name, fine to use generic speciesList here
    const name =
      team![pokemon]?.name ||
      speciesList[team![pokemon]?.species as SpeciesId]?.name ||
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
};
</script>
