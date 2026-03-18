<template>
  <UCard
    :ui="{
      root: 'h-full w-full flex flex-col',
      body: 'grow overflow-auto p-0 sm:p-0',
      header: 'p-1 sm:p-1',
      footer: 'p-2 sm:p-2',
    }"
  >
    <template #header>
      <div class="flex justify-between items-center">
        <div class="flex items-center">
          <TooltipButton
            v-if="closable"
            text="Close"
            :content="{side: 'top'}"
            icon="material-symbols:close"
            variant="link"
            color="neutral"
            size="lg"
            @click="() => $emit('close')"
          />
          <TooltipButton
            text="Forfeit"
            :content="{side: 'top'}"
            icon="material-symbols:flag-rounded"
            variant="link"
            color="error"
            size="lg"
            :disabled="!players.get(myId) || players.get(myId).isSpectator || !!victor"
            @click="openForfeitModal"
          />
          <TooltipButton
            text="Report Bug"
            :content="{side: 'top'}"
            icon="material-symbols:bug-report"
            variant="link"
            color="neutral"
            size="lg"
            @click="openReportModal"
          />
          <!-- <TooltipButton
            text="Open Calculator"
            :content="{side: 'top'}"
            icon="iconamoon:calculator-light"
            variant="ghost"
            color="gray"
            size="lg"
          /> -->
          <FormatInfoButton :format />
        </div>

        <UPopover
          :content="{align: 'end'}"
          :ui="{content: 'p-2 gap-1 flex flex-col max-h-40 overflow-y-auto overflow-x-hidden w-64'}"
        >
          <UButton
            color="neutral"
            variant="ghost"
            label="Players"
            trailing-icon="lucide:chevron-down"
          />

          <template #content>
            <div
              v-for="(player, id) in players.items"
              :key="id"
              class="flex justify-between items-center w-full"
            >
              <UChip :color="player.connected ? 'success' : 'error'">
                <UTooltip
                  :text="`${playerInfo(player, id)} (${player.connected ? 'Online' : 'Offline'})`"
                >
                  <span class="max-w-36 truncate pr-2 hover:underline hover:decoration-dotted">
                    {{ playerInfo(player, id) }}
                  </span>
                </UTooltip>
              </UChip>

              <UButton
                :label="mutedPlayers.includes(id) ? 'Unmute' : 'Mute'"
                color="neutral"
                variant="outline"
                :icon="
                  mutedPlayers.includes(id)
                    ? 'material-symbols:volume-off-outline-rounded'
                    : 'material-symbols:volume-up-outline-rounded'
                "
                @click="toggleMute(id)"
              />
            </div>
          </template>
        </UPopover>
      </div>
    </template>

    <template #default>
      <template v-for="(turn, i) in turns" :key="i">
        <div v-if="i" class="bg-accented w-full px-1 py-0.5">
          <h2 class="text-xl font-bold">Turn {{ i }}</h2>
        </div>
        <div class="events p-1">
          <template v-if="i > 0">
            <!-- eslint-disable-next-line vue/valid-v-for -->
            <Event v-for="e of turn" :key="perspective" :e :my-id :players :perspective :gen />
          </template>
          <div v-if="chats[i]?.length" class="pt-1"></div>
          <ChatMessage
            v-for="(chat, j) in chats[i] ?? []"
            :key="JSON.stringify({chat, j})"
            :chat
            :players
          />
          <template v-if="i === 0">
            <!-- eslint-disable-next-line vue/valid-v-for -->
            <Event v-for="e of turn" :key="perspective" :e :my-id :players :perspective :gen />
          </template>
        </div>
      </template>
      <div ref="scrollPoint" />
    </template>

    <template #footer>
      <UInput
        v-model="message"
        class="w-full"
        placeholder="Send a message..."
        :disabled="!myId"
        :maxlength="CHAT_MAX_MESSAGE"
        @keyup.enter="sendMessage"
      >
        <template #trailing>
          <UButton
            icon="material-symbols:send"
            variant="link"
            color="neutral"
            :padded="false"
            :disabled="!message"
            @click="sendMessage"
          />
        </template>
      </UInput>
    </template>
  </UCard>
</template>

<style>
@reference "@/assets/main.css";

.events {
  .move,
  .charge,
  .confused {
    padding-top: 0.5rem;
  }

  .ability {
    @apply text-lg font-medium;
  }

  div.move + div.move,
  div.move:first-child,
  div.confused:first-child,
  div.charge:first-child,
  div.confused + div.move {
    padding-top: 0;
  }

  .muted {
    @apply text-muted;
  }
}
</style>

<script setup lang="ts">
import {useMutedPlayerIds} from "~/composables/states";
import {GENERATIONS} from "~~/game/gen";
import type {InfoRecord} from "~~/server/gameServer";
import {until} from "@vueuse/core";
import AlertModal from "~/components/dialog/AlertModal.vue";
import ReportModal from "~/components/dialog/ReportModal.vue";

const props = defineProps<{
  turns: UIBattleEvent[][];
  players: Players;
  perspective: string;
  chats: InfoRecord;
  victor?: string;
  closable?: boolean;
  smoothScroll?: boolean;
  format: FormatId;
  myId: string;
}>();
const emit = defineEmits<{chat: [string]; report: [string]; forfeit: []; close: []}>();
const mutedPlayers = useMutedPlayerIds();
const message = ref("");
const scrollPoint = useTemplateRef("scrollPoint");
const gen = computed(() => GENERATIONS[formatInfo[props.format].generation]!);

const overlay = useOverlay();
const forfeitModal = overlay.create(AlertModal);
const reportModal = overlay.create(ReportModal);

let lastScroll = 0;
onMounted(async () => {
  await until(scrollPoint).toBeTruthy();
  await nextTick();
  scrollPoint.value?.scrollIntoView({block: "center", inline: "center"});

  useEventListener(scrollPoint.value?.parentElement, "wheel", () => (lastScroll = Date.now()));
  useEventListener(scrollPoint.value?.parentElement, "touchmove", () => (lastScroll = Date.now()));
  useEventListener(scrollPoint.value?.parentElement, "mousedown", () => (lastScroll = Date.now()));
});

const sendMessage = () => {
  const msg = message.value.trim();
  if (msg.length) {
    emit("chat", message.value);
  }
  message.value = "";
};

const playerInfo = (player: ClientPlayer, id: string) => {
  let label = player.name;
  if (id === props.myId) {
    label += " (Me)";
  }
  if (player.isSpectator) {
    label += " (Spectator)";
  }
  return label;
};

const toggleMute = (id: string) => {
  const index = mutedPlayers.value.indexOf(id);
  if (index !== -1) {
    mutedPlayers.value.splice(index, 1);
  } else {
    mutedPlayers.value.push(id);
  }
};

const tryScroll = async () => {
  if (Date.now() - lastScroll < 3500) {
    return;
  }

  await nextTick();
  scrollPoint.value?.scrollIntoView({
    behavior: props.smoothScroll ? "smooth" : "instant",
    block: "center",
    inline: "center",
  });
};

const openForfeitModal = () => {
  forfeitModal.open({
    title: "Are you sure?",
    description: "You are about to forfeit the match.",
    icon: "material-symbols:error-circle-rounded-outline-sharp",
    variant: "outline",
    color: "neutral",
    actions: [
      {
        variant: "solid",
        color: "primary",
        label: "Forfeit",
        onClick: () => (forfeitModal.close(), emit("forfeit")),
      },
      {
        variant: "outline",
        color: "primary",
        label: "Cancel",
        onClick: () => forfeitModal.close(),
      },
    ],
  });
};

const openReportModal = async () => {
  const message = await reportModal.open({});
  if (message) {
    emit("report", message);
  }
};

watch(props.chats, tryScroll);
watch(() => props.turns, tryScroll, {deep: true});
</script>
