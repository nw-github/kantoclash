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
                :color="players[id].connected ? 'lime' : 'red'"
                class="text-left"
              >
                <span class="px-2">{{ playerInfo(player, id) }}</span>
              </UChip>
            </div>
          </template>
        </UPopover>
      </div>
    </template>

    <template #default>
      {{ void (turnCounter = 0) }}
      <template v-for="([turn, switchTurn], i) in turns">
        <div class="bg-gray-300 dark:bg-gray-700 w-full px-1 py-0.5" v-if="i && !switchTurn">
          <h2 class="text-xl">Turn {{ ++turnCounter }}</h2>
        </div>
        <div class="events p-1">
          <component v-if="i > 0" :is="() => turn" />
          <p v-for="chat in chats[i] ?? []">
            <b v-if="chat.id && chat.type !== 'timerStart'">
              {{ players[chat.id!]?.name ?? "???" }}
            </b>

            <span v-if="chat.type === 'chat'">: {{ chat.message }}</span>
            <span v-if="chat.type === 'userJoin'"> joined the room.</span>
            <span v-if="chat.type === 'userLeave'"> left the room.</span>
            <span v-if="chat.type === 'userReconnect'"> reconnected.</span>
            <span v-if="chat.type === 'timerStart'">
              The timer was started by <b>{{ players[chat.id!]?.name ?? "???" }}</b
              >.
            </span>
          </p>
          <component v-if="i === 0" :is="() => turn" />
        </div>
      </template>
      <div ref="scrollPoint"></div>
    </template>

    <template #footer>
      <UInput
        placeholder="Send a message..."
        v-model="message"
        v-on:keyup.enter="sendMessage"
        :disabled="!myId"
      >
        <template #trailing>
          <UButton
            icon="material-symbols:send"
            variant="link"
            color="gray"
            :padded="false"
            v-show="message !== ''"
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
      icon="iconamoon:attention-circle"
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
import type { InfoRecord } from "~/server/utils/gameServer";

const props = defineProps<{
  turns: [VNode[], boolean][];
  players: Record<string, ClientPlayer>;
  chats: InfoRecord;
  victor?: string;
  closable?: boolean;
}>();
const emit = defineEmits<{
  (e: "chat", message: string): void;
  (e: "forfeit"): void;
  (e: "close"): void;
}>();
const myId = useMyId();
const message = ref("");
const scrollPoint = ref<HTMLDivElement>();
const forfeitModalOpen = ref(false);

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

let turnCounter = 0;
</script>
