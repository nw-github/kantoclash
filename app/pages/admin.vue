<template>
  <div class="h-full w-full space-x-1 overflow-auto items-center flex flex-col">
    <div v-if="!viewingBattle" class="flex gap-1">
      <UButton
        :label="!config.maintenance ? 'Start Maintenace Mode' : 'Cancel Maintenance Mode'"
        :loading
        @click="toggle('maintenance')"
      />

      <UButton
        :label="!config.botMatchmaking ? 'Enable Bots' : 'Disable Bots'"
        :loading
        @click="toggle('botMatchmaking')"
      />

      <UButton label="Reload Bug Reports" @click="loadBattles" />

      <UButton label="Load from JSON" @click="loadFromClipboard" />
    </div>
    <div v-if="!viewingBattle" class="w-min overflow-auto">
      <div
        v-for="({id, battle, reports, deleting}, i) of reportedBattles"
        :key="id"
        class="space-y-1 py-1 divide-y divide-gray-200 dark:divide-gray-800"
      >
        <div class="flex justify-between items-end">
          <div>
            <span class="text-sm truncate">Battle {{ id }}</span>
            <div class="flex items-center gap-1 text-xs">
              <UIcon :name="formatInfo[battle.format as FormatId].icon" class="size-3" />
              <span>{{ formatInfo[battle.format as FormatId].name }}</span>
            </div>
          </div>
          <div class="flex">
            <TooltipButton
              text="Copy"
              icon="material-symbols:content-copy-outline"
              color="gray"
              variant="ghost"
              @click="copyData(reportedBattles[i])"
            />
            <UPopover mode="hover">
              <UButton icon="material-symbols:chat-rounded" color="gray" variant="ghost" />
              <template #panel>
                <div v-for="(messages, player) in reports" :key="player" class="p-1">
                  <h1 class="text-md">Reports by player '{{ player }}'</h1>
                  <p v-for="{message, turn} in messages" :key="turn" class="text-sm">
                    <span class="text-gray-400">Reported on turn {{ turn }}:</span> {{ message }}
                  </p>
                </div>
              </template>
            </UPopover>
            <TooltipButton
              text="Debug"
              icon="material-symbols:play-arrow"
              color="gray"
              variant="ghost"
              @click="viewingBattle = battle"
            />
            <TooltipButton
              text="Delete"
              icon="material-symbols:delete-outline"
              color="red"
              variant="ghost"
              :disabled="deleting"
              @click="deleteBugReport(reportedBattles[i])"
            />
          </div>
        </div>
        <div class="flex justify-center items-center gap-1">
          <div class="flex justify-center -space-x-1">
            <BoxSprite
              v-for="(poke, j) in battle.player1.team"
              :key="j"
              :species-id="poke.speciesId"
              :scale="1.5"
              :form="poke.form"
              @click="copyTeam(battle.player1.team, battle.format)"
            />
          </div>
          <span class="text-lg">vs.</span>
          <div class="flex justify-center">
            <BoxSprite
              v-for="(poke, j) in battle.player2.team"
              :key="j"
              :species-id="poke.speciesId"
              :scale="1.5"
              :form="poke.form"
              @click="copyTeam(battle.player2.team, battle.format)"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="viewingBattle" class="h-full w-full p-1">
      <LocalBattle :recipe="viewingBattle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type {ValidatedPokemonDesc} from "~~/game/pokemon";
import type {BugReports, BattleRecipe, ServerConfig} from "~~/server/gameServer";
export type BugReportEntry = {
  id: string;
  battle: BattleRecipe;
  reports: BugReports;
  createdAt: string;
  deleting?: bool;
};

definePageMeta({middleware: ["admin"]});

const {$conn} = useNuxtApp();
const toast = useToast();
const config = ref<ServerConfig>({});
const loading = ref(true);
const reportedBattles = ref<BugReportEntry[]>([]);
const viewingBattle = ref<BattleRecipe>();

onMounted(() => {
  if (!$conn.connected) {
    $conn.once("connect", getConfig);
  } else {
    getConfig();
  }

  loadBattles();
});

const toggle = (key: keyof ServerConfig) => {
  const state = {...config.value, [key]: !config.value[key]};
  loading.value = true;
  $conn.emit("setConfig", state, worked => {
    loading.value = false;
    if (!worked) {
      toast.add({title: "Setting maintenance mode failed!"});
      return;
    }
    config.value = state;
  });
};

const getConfig = () => {
  $conn.emit("getConfig", state => {
    if (state) {
      config.value = state;
      loading.value = false;
    } else {
      toast.add({title: "Getting config failed!"});
    }
  });
};

const loadBattles = async () => {
  // eslint-disable-next-line
  // @ts-ignore
  reportedBattles.value = await $fetch("/api/bugs");
};

const copyData = async (entry: BugReportEntry) => {
  await navigator.clipboard.writeText(JSON.stringify(entry));
  toast.add({title: `'${entry.id}' copied to clipboard!`});
};

const deleteBugReport = async (entry: BugReportEntry) => {
  entry.deleting = true;
  try {
    const result = await $fetch(`/api/bugs/${entry.id}`, {method: "DELETE"});
    toast.add({title: `'Deleted '${result.id}'!`});
    const idx = reportedBattles.value.findIndex(e => e.id === entry.id);
    if (idx !== -1) {
      reportedBattles.value.splice(idx);
    }
  } catch (ex) {
    toast.add({title: "Deletion failed", description: `Reason: ${ex}`});
    entry.deleting = false;
  }
};

const loadFromClipboard = async () => {
  try {
    const data = JSON.parse(await navigator.clipboard.readText());
    viewingBattle.value = data.battle;
  } catch (ex) {
    console.error("Loading from clipboard failed: ", ex);
  }
};

const copyTeam = async (team: ValidatedPokemonDesc[], format: FormatId) => {
  let text = "";
  for (const poke of team) {
    text += descToString(format, poke) + "\n";
  }

  await navigator.clipboard.writeText(text.trim());
  toast.add({title: `Copied team to clipboard!`});
};
</script>
