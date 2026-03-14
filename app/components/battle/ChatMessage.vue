<template>
  <p :key="JSON.stringify(chat)">
    <span
      v-if="chat.type === 'chat' && !mutedPlayers.includes(chat.id)"
      class="text-wrap wrap-break-word break-all"
    >
      <b :class="player?.admin && 'text-amber-200'">{{ player?.name ?? "???" }}</b
      >:
      {{
        censorEnabled
          ? censor.applyTo(chat.message, profanityMatcher.getAllMatches(chat.message))
          : chat.message
      }}
    </span>
    <span
      v-else-if="chat.type === 'userJoin' && !mutedPlayers.includes(chat.id)"
      class="text-sm text-gray-600 dark:text-gray-400"
    >
      <b :class="player?.admin && 'text-amber-200'">{{ player?.name ?? "???" }}</b> joined the room.
    </span>
    <span
      v-else-if="chat.type === 'userLeave' && !mutedPlayers.includes(chat.id)"
      class="text-sm text-gray-600 dark:text-gray-400"
    >
      <b :class="player?.admin && 'text-amber-200'">{{ player?.name ?? "???" }}</b> left the room.
    </span>
    <span v-else-if="chat.type === 'timerStart'">
      The timer was started by
      <b :class="player?.admin && 'text-amber-200'">{{ player?.name ?? "???" }}</b
      >.
    </span>
  </p>
</template>

<script setup lang="ts">
import {TextCensor} from "obscenity";
import type {InfoMessage} from "~~/server/utils/info";

const {chat, players} = defineProps<{chat: InfoMessage; players: Players}>();

const mutedPlayers = useMutedPlayerIds();
const censorEnabled = useChatCensorEnabled();

const censor = new TextCensor();
const player = computed(() => players.get(chat.id));
censor.setStrategy(ctx => "*".repeat(ctx.matchLength));
</script>
