<template>
  <template v-if="status === 'loading'">
    <div class="flex gap-2">
      <UIcon name="line-md:loading-loop" class="size-6" />
      <span class="text-xl">Loading...</span>
    </div>
  </template>
  <template v-else-if="status === 'notfound'">
    <h1>Room not found.</h1>
  </template>

  <Battle
    ref="battle"
    :team
    :options
    :players
    :turns
    :chats
    :battlers
    :timer
    @chat="sendChat"
    @forfeit="() => makeChoice('forfeit')"
    @move="i => makeChoice('move', i)"
    @switch="i => makeChoice('switch', i)"
    @cancel="cancelMove"
    @timer="startTimer"
  />

  <MusicController />
</template>

<script setup lang="ts">
import type { Battle } from "#components";
import type { Options, Turn } from "~/game/battle";
import type { Pokemon } from "~/game/pokemon";
import type { BattleTimer, InfoRecord, JoinRoomResponse } from "~/server/utils/gameServer";
import type { InfoMessage } from "~/server/utils/info";

const { $conn } = useNuxtApp();
const title = useTitle("Battle");
const toast = useToast();
const route = useRoute();
const currentTrack = useCurrentTrack();
const battle = ref<InstanceType<typeof Battle>>();
const status = ref<"loading" | "battle" | "notfound">("loading");
const players = reactive<Record<string, ClientPlayer>>({});
const battlers = ref<string[]>([]);
const turns = ref<Turn[]>([]);
const options = ref<Options>();
const chats = reactive<InfoRecord>({});
const team = ref<Pokemon[]>();
const timer = ref<BattleTimer>();
const room = `${route.params.id}`;

let sequenceNo = 0;
onMounted(() => {
  const joinRoom = (resp: JoinRoomResponse | "bad_room", fresh: boolean) => {
    const clearObj = (foo: Record<string, any>) => {
      for (const k in foo) {
        delete foo[k];
      }
    };

    if (resp === "bad_room") {
      status.value = "notfound";
      title.value = battlers.value.join("Room not found");
      return;
    }

    if (allMusicTracks.length && !currentTrack.value) {
      currentTrack.value = randChoice(allMusicTracks);
    }

    for (const player in players) {
      players[player].connected = false;
    }

    if (fresh) {
      sequenceNo = resp.turns.length;
      turns.value = resp.turns;
      team.value = resp.team;
    } else {
      sequenceNo += resp.turns.length;
      turns.value.push(...resp.turns);
    }

    options.value = resp.options;
    timer.value = resp.timer;

    clearObj(chats);
    for (const k in resp.chats) {
      if (resp.chats[k]) {
        chats[k] = resp.chats[k];
        for (const chat of resp.chats[k]) {
          processMessage(chat);
        }
      }
    }

    status.value = "battle";
    title.value = battlers.value.map(id => players[id].name).join(" vs. ");
    if (fresh) {
      battle.value!.onConnect();
    } else {
      for (let i = 0; i < resp.turns.length; i++) {
        battle.value!.onTurnReceived();
      }
    }
  };

  const processMessage = (message: InfoMessage) => {
    if (message.type === "userJoin") {
      const { name, isSpectator, nPokemon, id } = message;
      players[id] = {
        name,
        isSpectator,
        connected: true,
        nPokemon,
        nFainted: players[id]?.nFainted ?? 0,
      };
      if (!isSpectator && !battlers.value.includes(id)) {
        battlers.value.push(id);
      }
    } else if (message.type === "userLeave") {
      players[message.id].connected = false;
    } else if (message.type === "userReconnect") {
      if (players[message.id]) {
        players[message.id].connected = true;
      }
    }
  };

  if ($conn.connected) {
    $conn.emit("joinRoom", room, 0, resp => joinRoom(resp, true));
  }

  let needsFreshStart = true;
  $conn.on("disconnect", reason => {
    needsFreshStart = reason === "io client disconnect";
  });

  $conn.on("connect", () => {
    status.value = "loading";
    options.value = undefined;
    timer.value = undefined;

    const sq = needsFreshStart ? 0 : sequenceNo;
    $conn.emit("joinRoom", room, sq, resp => joinRoom(resp, needsFreshStart));
  });

  $conn.on("nextTurn", async (roomId, turn, opts, tmr) => {
    timer.value = tmr || undefined;
    if (roomId === room) {
      turns.value.push(turn);
      options.value = opts || undefined;
      sequenceNo++;
      battle.value!.onTurnReceived();
    }
  });

  $conn.on("info", (roomId, message, turn) => {
    if (roomId !== room) {
      return;
    }

    processMessage(message);

    turn ??= Math.max(turns.value.length - 1, 0);
    if (!chats[turn]) {
      chats[turn] = [];
    }
    chats[turn].push(message);
  });

  $conn.on("timerStart", (roomId, _, tmr) => {
    if (roomId === room) {
      timer.value = tmr || undefined;
    }
  });
});

onUnmounted(() => {
  currentTrack.value = undefined;

  if (status.value === "battle" && $conn.connected) {
    $conn.emit("leaveRoom", room, () => {});
  }
});

const sendChat = (message: string) => $conn.emit("chat", room, message, displayErrorToast);
const makeChoice = (e: "move" | "switch" | "forfeit", index?: number) => {
  $conn.emit("choose", room, index ?? 0, e, sequenceNo, displayErrorToast);
};
const cancelMove = () => $conn.emit("cancel", room, sequenceNo, displayErrorToast);
const startTimer = () => $conn.emit("startTimer", room, displayErrorToast);

const displayErrorToast = (err?: string) => {
  if (!err) {
    return;
  } else if (err === "invalid_choice") {
    toast.add({
      title: "Your choice was invalid",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "not_in_battle") {
    toast.add({
      title: "You are not in this battle",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "too_late") {
    toast.add({
      title: "Your choice was too late, the next turn has started",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "bad_room") {
    toast.add({
      title: "This room has expired",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "bad_message") {
    toast.add({
      title: "Your message has been blocked",
      icon: "material-symbols:chat-error-outline-rounded",
    });
  } else if (err === "bad_room") {
    toast.add({ title: "This room has expired", icon: "material-symbols:chat-info-outline" });
  } else if (err === "not_in_room") {
    toast.add({
      title: "You must join this room first (Try reloading the page)",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "already_on") {
    toast.add({
      title: "The timer is already on",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else {
    toast.add({
      title: `An unknown error occoured: '${err}'`,
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  }
};
</script>
