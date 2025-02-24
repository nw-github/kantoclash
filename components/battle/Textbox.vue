<template>
  <UCard
    class="card h-full w-full flex flex-col"
    :ui="{
      body: { base: 'grow overflow-auto', padding: 'p-0 sm:p-0' },
      header: { padding: 'p-1 sm:p-1' },
    }"
  >
    <template #header>
      <div class="flex justify-between items-center">
        <div>
          <UTooltip v-if="closable" text="Close" :popper="{ placement: 'top' }">
            <UButton
              icon="material-symbols:close"
              variant="link"
              color="gray"
              size="lg"
              @click="$emit('close')"
            />
          </UTooltip>
          <UTooltip text="Forfeit" :popper="{ placement: 'top' }">
            <UButton
              icon="material-symbols:flag-rounded"
              variant="link"
              color="red"
              size="lg"
              :disabled="!players[myId] || players[myId].isSpectator || !!victor"
              @click="forfeitModalOpen = true"
            />
          </UTooltip>
          <UTooltip text="Open Calculator" :popper="{ placement: 'top' }">
            <UButton icon="iconamoon:calculator-light" variant="ghost" color="gray" size="lg" />
          </UTooltip>
        </div>

        <UPopover mode="hover" :popper="{ placement: 'bottom-start' }">
          <UButton
            color="white"
            variant="ghost"
            label="Players"
            trailing-icon="heroicons:chevron-down-20-solid"
          />
          <template #panel>
            <div class="p-2 space-y-1 flex flex-col">
              <UChip
                v-for="(player, id) in players"
                :key="id"
                :color="players[id].connected ? 'lime' : 'red'"
                class="text-left"
              >
                <span class="px-2">{{ playerInfo(player, id) }}</span>
                <UTooltip :text="`${mutedPlayers.includes(id) ? 'Unmute' : 'Mute'} this player`">
                  <UButton
                    color="gray"
                    variant="ghost"
                    :icon="
                      mutedPlayers.includes(id)
                        ? 'material-symbols:volume-off-outline-rounded'
                        : 'material-symbols:volume-up-outline-rounded'
                    "
                    @click="toggleMute(id)"
                  />
                </UTooltip>
              </UChip>
            </div>
          </template>
        </UPopover>
      </div>
    </template>

    <template #default>
      <template v-for="([turn, switchTurn, turnNo], i) in turns" :key="i">
        <div v-if="i && !switchTurn" class="bg-gray-300 dark:bg-gray-700 w-full px-1 py-0.5">
          <h2 class="text-xl font-bold">Turn {{ turnNo }}</h2>
        </div>
        <div class="events p-1">
          <component :is="() => turn" v-if="i > 0" />
          <p v-for="chat in chats[i] ?? []" :key="JSON.stringify(chat)">
            <span v-if="chat.type === 'chat' && !mutedPlayers.includes(chat.id)">
              <b>{{ players[chat.id]?.name ?? "???" }}</b
              >: {{ chat.message }}
            </span>
            <span
              v-else-if="chat.type === 'userJoin' && !mutedPlayers.includes(chat.id)"
              class="text-sm text-gray-600 dark:text-gray-400"
            >
              <b>{{ players[chat.id]?.name ?? "???" }}</b> joined the room.
            </span>
            <span
              v-else-if="chat.type === 'userLeave' && !mutedPlayers.includes(chat.id)"
              class="text-sm text-gray-600 dark:text-gray-400"
            >
              <b>{{ players[chat.id]?.name ?? "???" }}</b> left the room.
            </span>
            <span v-else-if="chat.type === 'timerStart'">
              The timer was started by <b>{{ players[chat.id]?.name ?? "???" }}</b
              >.
            </span>
          </p>
          <component :is="() => turn" v-if="i === 0" />
        </div>
      </template>
      <div ref="scrollPoint" />
    </template>

    <template #footer>
      <UInput
        v-model="message"
        placeholder="Send a message..."
        :disabled="!myId"
        @keyup.enter="sendMessage"
      >
        <template #trailing>
          <UButton
            v-show="message !== ''"
            icon="material-symbols:send"
            variant="link"
            color="gray"
            :padded="false"
            @click="sendMessage"
          />
        </template>
      </UInput>
    </template>
  </UCard>

  <UModal v-model="forfeitModalOpen">
    <UAlert
      title="Are you sure?"
      description="You are about to forfeit the match."
      icon="material-symbols:error-circle-rounded-outline-sharp"
      :actions="[
        {
          variant: 'solid',
          color: 'primary',
          label: 'Forfeit',
          click: () => ((forfeitModalOpen = false), $emit('forfeit')),
        },
        {
          variant: 'outline',
          color: 'primary',
          label: 'Cancel',
          click: () => (forfeitModalOpen = false),
        },
      ]"
    />
  </UModal>
</template>

<style>
@import "@/assets/colors.css";
.events {
  .red {
    color: var(--stat-down);
    @apply text-sm;
  }

  .green {
    color: green;
    @apply text-sm;
  }

  > * {
    padding: 0 0.25rem;
  }

  .move,
  .confused {
    padding-top: 0.5rem;
  }

  .move + .move,
  .move:first-child {
    padding-top: 0;
  }

  .confused + .move {
    padding-top: 0;
  }
}
</style>

<script setup lang="ts">
import { useMutedPlayerIds } from "~/composables/states";
import type { InfoRecord } from "~/server/utils/gameServer";

const props = defineProps<{
  turns: [VNode[], boolean, number][];
  players: Record<string, ClientPlayer>;
  chats: InfoRecord;
  victor?: string;
  closable?: boolean;
}>();
const emit = defineEmits<{
  (e: "chat", message: string): void;
  (e: "forfeit" | "close"): void;
}>();
const myId = useMyId();
const mutedPlayers = useMutedPlayerIds();
const message = ref("");
const scrollPoint = ref<HTMLDivElement>();
const forfeitModalOpen = ref(false);

onMounted(async () => {
  await nextTick();
  scrollPoint.value?.scrollIntoView({
    // behavior: "smooth",
    block: "center",
    inline: "center",
  });
});

watch([props.chats, props.turns], async () => {
  await nextTick();
  scrollPoint.value?.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "center",
  });
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
  if (id === myId.value) {
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
</script>
