<template>
  <UCard
    class="h-full w-full flex flex-col"
    :ui="{
      body: {base: 'grow overflow-auto', padding: 'p-0 sm:p-0'},
      header: {padding: 'p-1 sm:p-1'},
    }"
  >
    <template #header>
      <div class="flex justify-between items-center">
        <div class="flex items-center">
          <TooltipButton
            v-if="closable"
            text="Close"
            :popper="{placement: 'top'}"
            icon="material-symbols:close"
            variant="link"
            color="gray"
            size="lg"
            @click="$emit('close')"
          />
          <TooltipButton
            text="Forfeit"
            :popper="{placement: 'top'}"
            icon="material-symbols:flag-rounded"
            variant="link"
            color="red"
            size="lg"
            :disabled="!players.get(myId) || players.get(myId).isSpectator || !!victor"
            @click="forfeitModalOpen = true"
          />
          <!-- <TooltipButton
            text="Open Calculator"
            :popper="{ placement: 'top' }"
            icon="iconamoon:calculator-light"
            variant="ghost"
            color="gray"
            size="lg"
          /> -->
          <FormatInfoButton :format />
        </div>

        <UPopover mode="hover" :popper="{placement: 'bottom-end'}">
          <UButton
            color="white"
            variant="ghost"
            label="Players"
            trailing-icon="heroicons:chevron-down-20-solid"
          />
          <template #panel>
            <div class="p-2 gap-1 flex flex-col max-h-40 overflow-y-auto">
              <UChip
                v-for="(player, id) in players.items"
                :key="id"
                :color="player.connected ? 'lime' : 'red'"
                class="text-left"
                :ui="{wrapper: 'justify-between'}"
              >
                <span class="px-2">{{ playerInfo(player, id) }}</span>
                <TooltipButton
                  :text="`${mutedPlayers.includes(id) ? 'Unmute' : 'Mute'} this player`"
                  color="gray"
                  variant="ghost"
                  :icon="
                    mutedPlayers.includes(id)
                      ? 'material-symbols:volume-off-outline-rounded'
                      : 'material-symbols:volume-up-outline-rounded'
                  "
                  @click="toggleMute(id)"
                />
              </UChip>
            </div>
          </template>
        </UPopover>
      </div>
    </template>

    <template #default>
      <template v-for="(turn, i) in turns" :key="i">
        <div v-if="i" class="bg-gray-300 dark:bg-gray-700 w-full px-1 py-0.5">
          <h2 class="text-xl font-bold">Turn {{ i }}</h2>
        </div>
        <div class="events p-1">
          <template v-if="i > 0">
            <!-- eslint-disable-next-line vue/valid-v-for -->
            <Event v-for="e of turn" :key="perspective" :e :my-id :players :perspective :gen />
          </template>
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
      <div class="relative">
        <UInput
          v-model="message"
          placeholder="Send a message..."
          :disabled="!myId"
          @keyup.enter="sendMessage"
        >
          <template #trailing>
            <div class="w-3" />
          </template>
        </UInput>

        <UButton
          class="absolute top-1/2 right-2 -translate-y-1/2"
          icon="material-symbols:send"
          variant="link"
          color="gray"
          :padded="false"
          :disabled="!message"
          @click="sendMessage"
        />
      </div>
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
    @apply text-gray-600 dark:text-gray-400;
  }
}
</style>

<script setup lang="ts">
import {useMutedPlayerIds} from "~/composables/states";
import {GENERATIONS} from "~/game/gen";
import type {InfoRecord} from "~/server/gameServer";
import {until} from "@vueuse/core";

const props = defineProps<{
  turns: UIBattleEvent[][];
  players: Players;
  perspective: string;
  chats: InfoRecord;
  victor?: string;
  closable?: boolean;
  smoothScroll?: boolean;
  format: FormatId;
}>();
const emit = defineEmits<{(e: "chat", message: string): void; (e: "forfeit" | "close"): void}>();
const myId = useMyId();
const mutedPlayers = useMutedPlayerIds();
const message = ref("");
const scrollPoint = ref<HTMLDivElement>();
const forfeitModalOpen = ref(false);
const gen = computed(() => GENERATIONS[formatInfo[props.format].generation]!);

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

watch(props.chats, tryScroll);
watch(() => props.turns, tryScroll, {deep: true});
</script>
