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
  <template v-else>
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
      @forfeit="forfeit"
      @move="selectMove"
      @switch="selectSwitch"
      @cancel="cancelMove"
      @timer="startTimer"
    />
  </template>

  <MusicController />
</template>

<script setup lang="ts">
import type { Battle } from "#components";
import type { Options, Turn } from "~/game/battle";
import type { Pokemon } from "~/game/pokemon";
import type { BattleTimer, Chats, JoinRoomResponse } from "~/server/utils/gameServer";

const { $conn } = useNuxtApp();
const route = useRoute();
const currentTrack = useCurrentTrack();
const battle = ref<InstanceType<typeof Battle>>();
const status = ref<"loading" | "battle" | "notfound">("loading");
const players = reactive<Record<string, ClientPlayer>>({});
const battlers = ref<string[]>([]);
const turns = ref<Turn[]>([]);
const options = ref<Options>();
const chats = reactive<Chats>({});
const team = ref<Pokemon[]>();
const timer = ref<BattleTimer>();
const room = `${route.params.id}`;

let sequenceNo = 0;
onMounted(() => {
  const pushChat = (id: string, message: string, turn?: number) => {
    turn ??= Math.max(turns.value.length - 1, 0);
    if (!chats[turn]) {
      chats[turn] = [];
    }

    chats[turn].push({ message, player: id });
  };

  if ($conn.connected) {
    $conn.emit("joinRoom", room, joinRoom);
  }

  $conn.on("connect", () => {
    status.value = "loading";
    turns.value.length = 0;
    team.value = undefined;
    options.value = undefined;
    timer.value = undefined;

    // TODO: instead of rejoining the room, send a 'catch up' request with the sequenceNo
    $conn.emit("joinRoom", room, joinRoom);
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

  $conn.on("userJoin", (roomId, name, id, isSpectator, nPokemon) => {
    if (roomId === room) {
      players[id] = { name, isSpectator, nPokemon, connected: true, nFainted: 0 };
      pushChat("", `${players[id].name} joined the room.`);
    }
  });

  $conn.on("userReconnect", (roomId, id) => {
    if (roomId === room) {
      if (players[id]) {
        pushChat("", `${players[id].name} reconnected.`);
      }
    }
  });

  $conn.on("userLeave", (roomId, id) => {
    if (roomId === room) {
      players[id].connected = false;
      if (players[id].isSpectator) {
        pushChat("", `${players[id].name} disconnected from the room.`);
      } else {
        pushChat("", `${players[id].name} left the room.`);
      }
    }
  });

  $conn.on("userChat", (roomId, id, message, turn) => {
    if (roomId === room) {
      pushChat(id, message, turn);
    }
  });

  $conn.on("timerStart", (roomId, who, tmr) => {
    if (roomId === room) {
      const turn = Math.max(turns.value.length - 1, 0);
      if (timer.value === undefined) {
        pushChat("", `${players[who].name} started the timer.`, turn);
      }

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

const joinRoom = (resp: JoinRoomResponse | "bad_room") => {
  const clearObj = (foo: Record<string, any>) => {
    for (const k in foo) {
      delete foo[k];
    }
  };

  if (resp === "bad_room") {
    status.value = "notfound";
    return;
  }

  if (allMusicTracks.length && !currentTrack.value) {
    currentTrack.value = randChoice(allMusicTracks);
  }

  for (const { isSpectator, id, name, nPokemon } of resp.players) {
    players[id] = { name, isSpectator, connected: true, nPokemon, nFainted: 0 };
    if (!isSpectator && !battlers.value.includes(id)) {
      battlers.value.push(id);
    }
  }

  sequenceNo = resp.turns.length;
  turns.value = resp.turns;
  team.value = resp.team;
  options.value = resp.options;
  timer.value = resp.timer;

  clearObj(chats);
  for (const k in resp.chats) {
    chats[k] = resp.chats[k];
  }

  if (resp.timer) {
    chats[0] ??= [];
    chats[0].unshift({ player: "", message: "The timer is on." });
  }

  status.value = "battle";
  if (battle.value) {
    battle.value.onConnect();
  } else {
    watchOnce(battle, battle => battle!.onConnect());
  }
};

const sendChat = (message: string) => {
  $conn.emit("chat", room, message, err => {
    // TODO: do something with the error
  });
};

const forfeit = () => {
  $conn.emit("choose", room, 0, "forfeit", sequenceNo, err => {
    // TODO: do something with the error
  });
};

const selectMove = (index: number) => {
  $conn.emit("choose", room, index, "move", sequenceNo, err => {
    // TODO: do something with the error
  });
};

const selectSwitch = (index: number) => {
  $conn.emit("choose", room, index, "switch", sequenceNo, err => {
    // TODO: do something with the error
  });
};

const cancelMove = () => {
  $conn.emit("cancel", room, sequenceNo, err => {
    // TODO: do something with the error
  });
};

const startTimer = () => {
  $conn.emit("startTimer", room, err => {
    // TODO: do something with the error
  });
};
</script>
