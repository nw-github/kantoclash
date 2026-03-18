<template>
  <div class="w-full h-full">
    <Battle
      ref="battle"
      :options
      :players
      :events
      :chats
      :timers
      :finished
      :format
      :ready
      :my-id
      @chat="sendChat"
      @report="sendBugReport"
      @choice="makeChoice"
      @cancel="cancelMove"
      @timer="startTimer"
    />
  </div>
</template>

<script setup lang="ts">
import type {Socket} from "socket.io-client";
import type {Options} from "~~/game/battle";
import type {BattleEvent} from "~~/game/events";
import type {Choice, InfoRecord, JoinRoomResponse} from "~~/server/gameServer";
import type {InfoMessage, BattleTimers} from "~~/server/utils/info";
import AlertModal from "~/components/dialog/AlertModal.vue";

const alert = useOverlay().create(AlertModal);

const {$conn} = useNuxtApp();
const {user} = useUserSession();
const title = useTitle("Battle");
const toast = useToast();
const route = useRoute();
const router = useRouter();
const mounted = useMounted();
const myId = useMyId();
const {track: currentTrack} = useBGMusic();
const battle = useTemplateRef("battle");
const loading = ref(true);
const players = ref<Players>(new Players());
const events = ref<BattleEvent[]>([]);
const options = reactive<Partial<Record<number, Options[]>>>({});
const chats = reactive<InfoRecord>({});
const timers = ref<BattleTimers>();
const room = `${route.params.id}`;
const finished = ref(false);
const format = ref<FormatId>("g1_standard");
const ready = ref(false);

let sequenceNo = 0;
let needsFreshStart = true;
let firstConnect = false;

onMounted(() => {
  if ($conn.connected) {
    $conn.emit("joinRoom", room, 0, onJoinRoom);
  }

  $conn.on("connect", onConnect);
  $conn.on("disconnect", onDisconnect);
  $conn.on("nextTurn", onNextTurn);
  $conn.on("info", onInfo);

  firstConnect = Boolean(route.query.intro);
  router.replace({query: {}});
});

onUnmounted(() => {
  $conn.off("connect", onConnect);
  $conn.off("disconnect", onDisconnect);
  $conn.off("nextTurn", onNextTurn);
  $conn.off("info", onInfo);

  if ($conn.connected) {
    $conn.emit("leaveRoom", room, () => {});
  }
});

const sendChat = (message: string) => $conn.emit("chat", room, message, displayErrorToast);
const sendBugReport = (report: string) => {
  $conn.emit("reportBug", room, report, resp => {
    if (!resp) {
      toast.add({
        title: "Report received, Thank you!",
        icon: "material-symbols:bug-report",
      });
    } else if (resp === "bad_message") {
      toast.add({
        title: `Report message was invalid! (Must be 0 - ${CHAT_MAX_MESSAGE} characters long)`,
        icon: "material-symbols:error-circle-rounded-outline-sharp",
      });
    } else {
      displayErrorToast(resp);
    }
  });
};
const makeChoice = (choice: Choice) => {
  $conn.emit("choose", room, sequenceNo, choice, displayErrorToast);
};
const cancelMove = () => $conn.emit("cancel", room, sequenceNo, displayErrorToast);
const startTimer = () => $conn.emit("startTimer", room, displayErrorToast);

//

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
      title: "Your choice was too late, the next turn has started.",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "bad_room") {
    toast.add({
      title: "This room has expired.",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "bad_message") {
    toast.add({
      title: "Your message has been blocked!",
      icon: "material-symbols:chat-error-outline-rounded",
    });
  } else if (err === "not_in_room") {
    toast.add({
      title: "You must join this room first (Try reloading the page)",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "already_on") {
    toast.add({
      title: "The timer is already on.",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else if (err === "finished") {
    toast.add({
      title: "This battle is already over.",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  } else {
    toast.add({
      title: `An unknown error occoured: '${err}'`,
      icon: "material-symbols:error-circle-rounded-outline-sharp",
    });
  }
};

const processMessage = (message: InfoMessage) => {
  if (message.type === "userJoin") {
    const player = players.value.get(message.id);
    if (player) {
      player.connected = true;
    } else if (message.isSpectator) {
      players.value.add(message.id, {
        name: message.name,
        isSpectator: message.isSpectator,
        nPokemon: message.nPokemon,
        admin: message.admin,
        nFainted: 0,
        connected: true,
        active: [],
        team: [],
        teamDesc: [],
      });
    }
  } else if (message.type === "userLeave") {
    players.value.get(message.id).connected = false;
  }
};

// Event listeners

const onJoinRoom = (resp: JoinRoomResponse | "bad_room") => {
  const clearObj = (foo: Record<string, any>) => {
    for (const k in foo) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete foo[k];
    }
  };

  if (resp === "bad_room") {
    alert.open({
      title: "Invalid Room",
      description: "This room does not exist or has expired.",
      icon: "material-symbols:error-circle-rounded-outline-sharp",
      dismissible: false,
      variant: "outline",
      color: "neutral",
      actions: [
        {
          label: "Go Home",
          to: "/",
          icon: "heroicons:home",
          variant: "solid",
          onClick: () => alert.close(),
        },
      ],
    });
    loading.value = false;
    return;
  } else if (!mounted.value) {
    $conn.emit("leaveRoom", room, () => {});
    return;
  }

  if (allMusicTracks.length && !currentTrack.value) {
    currentTrack.value = randChoice(allMusicTracks);
  }

  const fmt = formatInfo[resp.format];
  for (const {id, name, nPokemon, admin} of resp.battlers) {
    const player = players.value.get(id);
    if (player) {
      continue;
    }

    players.value.add(id, {
      name,
      admin,
      isSpectator: false,
      connected: false,
      nPokemon,
      nFainted: 0,
      active: Array(fmt.doubles ? 2 : 1).fill(undefined),
      team: [],
      teamDesc: [],
    });
  }

  if (needsFreshStart) {
    sequenceNo = resp.events.length;
    events.value = resp.events;
    const self = players.value.get(myId.value);
    if (self) {
      self.teamDesc = resp.team ?? [];
    }
  } else {
    sequenceNo += resp.events.length;
    events.value.push(...resp.events);
  }

  options[sequenceNo] = resp.options;
  timers.value = resp.timer;
  format.value = resp.format;

  clearObj(chats);
  for (const k in resp.chats) {
    if (resp.chats[k]) {
      chats[k] = resp.chats[k];
      for (const chat of resp.chats[k]) {
        processMessage(chat);
      }
    }
  }

  loading.value = false;
  title.value = `${resp.battlers.map(b => b.name).join(" vs. ")} - ${fmt.name}`;
  finished.value = resp.finished;

  let startAtBeginning = firstConnect;
  if (!resp.battlers.find(b => b.id === user.value?.id)) {
    startAtBeginning = false;
  }
  if (resp.finished) {
    startAtBeginning = true;
  }

  firstConnect = false;

  ready.value = true;
  if (needsFreshStart) {
    nextTick().then(() => battle.value!.skipToTurn(startAtBeginning ? 0 : -1));
  }
};

const onConnect = () => {
  loading.value = true;
  ready.value = false;
  timers.value = undefined;

  for (const k in options) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete options[k];
  }

  const sq = needsFreshStart ? 0 : sequenceNo;
  $conn.emit("joinRoom", room, sq, onJoinRoom);
};

const onDisconnect = (reason: Socket.DisconnectReason) => {
  needsFreshStart = reason === "io client disconnect";
};

const onNextTurn = (roomId: string, turn: BattleEvent[], opts?: Options[], tmr?: BattleTimers) => {
  timers.value = tmr || undefined;
  if (roomId === room) {
    events.value.push(...turn);
    sequenceNo += turn.length;
    options[sequenceNo] = opts;

    // console.log("next turn, got", turn.length, "events");
  }
};

const onInfo = (roomId: string, message: InfoMessage, turn: number) => {
  if (roomId !== room) {
    return;
  }

  processMessage(message);
  if (!chats[turn]) {
    chats[turn] = [];
  }
  chats[turn].push(message);

  if (message.type === "timerStart") {
    timers.value = message.info;
  }
};
</script>
