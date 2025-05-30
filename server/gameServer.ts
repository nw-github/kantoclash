import {type ServerOptions, Server, type Socket as SocketIoClient} from "socket.io";
import type {PokemonDesc, ValidatedPokemonDesc} from "../game/pokemon";
import {Battle, type PlayerParams, type Options} from "../game/battle";
import {type TeamProblems, formatDescs} from "./utils/formats";
import type {User} from "#auth-utils";
import type {InfoMessage} from "./utils/info";
import {formatInfo} from "~/utils/shared";
import type {FormatId} from "~/utils/shared";
import {activeBots, createBotTeam} from "./bot";
import random from "random";
import {GENERATIONS} from "~/game/gen";
import type {BattleEvent, PokeId} from "~/game/events";

export type JoinRoomResponse = {
  team?: ValidatedPokemonDesc[];
  options?: Options[];
  events: BattleEvent[];
  chats: InfoRecord;
  format: FormatId;
  timer?: BattleTimer;
  finished: bool;
  battlers: {id: string; name: string; nPokemon: number}[];
};

export type BattleTimer = {startedAt: number; duration: number};

export type ChoiceError = "invalid_choice" | "bad_room" | "not_in_battle" | "too_late" | "finished";

export type Battler = {name: string; id: string};

export type Challenge = {from: Battler; format: FormatId};

export type RoomDescriptor = {id: string; battlers: Battler[]; format: FormatId; finished: bool};
export type MMError = "must_login" | "invalid_team" | "too_many" | "maintenance" | "bad_user";

export type MoveChoice = {
  type: "move";
  who: number;
  moveIndex: number;
  target?: PokeId;
};

export type SwitchChoice = {
  type: "switch";
  who: number;
  pokeIndex: number;
};

export type ForfeitChoice = {
  type: "forfeit";
};

export type Choice = MoveChoice | SwitchChoice | ForfeitChoice;

export interface ClientMessage {
  getRoom: (id: string, ack: (resp: "bad_room" | RoomDescriptor) => void) => void;
  getRooms: (ack: (rooms: RoomDescriptor[]) => void) => void;
  getPlayerRooms: (player: string, ack: (resp: "bad_player" | RoomDescriptor[]) => void) => void;
  getOnlineUsers: (q: string, ack: (resp: Battler[]) => void) => void;

  enterMatchmaking: (
    team: PokemonDesc[] | undefined,
    format: FormatId,
    challengeId: string | undefined,
    ack: (err?: MMError, problems?: TeamProblems) => void,
  ) => void;
  exitMatchmaking: (ack: () => void) => void;
  respondToChallenge: (
    id: string,
    accept: bool,
    team: PokemonDesc[] | undefined,
    ack: (err?: MMError, problems?: TeamProblems) => void,
  ) => void;
  getChallenges: (ack: (resp: Challenge[]) => void) => void;

  joinRoom: (
    room: string,
    turn: number,
    ack: (resp: JoinRoomResponse | "bad_room") => void,
  ) => void;
  leaveRoom: (room: string, ack: (resp?: "bad_room") => void) => void;
  choose: (room: string, turn: number, choice: Choice, ack: (err?: ChoiceError) => void) => void;
  cancel: (room: string, turn: number, ack: (err?: ChoiceError) => void) => void;
  chat: (
    room: string,
    message: string,
    ack: (resp?: "bad_room" | "not_in_room" | "bad_message") => void,
  ) => void;
  startTimer: (
    room: string,
    ack: (resp?: "bad_room" | "not_in_room" | "not_in_battle" | "already_on") => void,
  ) => void;

  getConfig: (ack: (state: ServerConfig | false) => void) => void;
  setConfig: (state: ServerConfig, ack: (ok: bool) => void) => void;
}

export interface ServerMessage {
  foundMatch: (room: string) => void;
  challengeReceived: (challenge: Challenge) => void;
  challengeRetracted: (by: Battler) => void;
  challengeRejected: (by: Battler) => void;

  nextTurn: (room: string, events: BattleEvent[], options?: Options[], timer?: BattleTimer) => void;
  timerStart: (room: string, who: string, timer: BattleTimer) => void;
  info: (room: string, message: InfoMessage, turn: number) => void;

  maintenanceState: (state: bool) => void;
}

export type InfoRecord = Record<number, InfoMessage[]>;

declare module "socket.io" {
  interface Socket {
    account?: Account;
  }
}

type Socket = SocketIoClient<ClientMessage, ServerMessage>;

const ROOM_CLEANUP_DELAY_MS = 15 * 60 * 1000;
const TURN_DECISION_TIME_MS = 45 * 1000;

type Account = {
  id: string;
  name: string;
  admin?: bool;
  offline: bool;
  matchmaking?: {format: FormatId} | {challenged: Account};
  userRoom: string;
  activeBattles: Set<Room>;
  challenges: {format: FormatId; from: Account; player: PlayerParams}[];
};

class Room {
  accounts = new Set<Account>();
  chats: InfoRecord = {};
  timer?: NodeJS.Timeout;
  lastTurn: number = Date.now();
  spectatorRoom: string;

  constructor(
    public id: string,
    public battle: Battle,
    public events: BattleEvent[],
    public format: FormatId,
    public server: GameServer,
  ) {
    this.spectatorRoom = `spectator:${this.id}`;
  }

  resetTimerState() {
    if (this.battle.finished) {
      clearInterval(this.timer);
      this.timer = undefined;
      setTimeout(() => this.server.destroyRoom(this), ROOM_CLEANUP_DELAY_MS);
      return;
    }

    this.lastTurn = Date.now();
  }

  startTimer(initiator: Account) {
    if (this.timer || this.battle.finished) {
      return false;
    }

    this.timer = setInterval(() => {
      if (Date.now() - this.lastTurn < TURN_DECISION_TIME_MS || this.battle.finished) {
        return;
      }

      let loser;
      for (const player of this.battle.players) {
        if (!player.hasChosen()) {
          loser = loser ? undefined : player;
        }
      }
      this.broadcastTurn(loser ? this.battle.forfeit(loser, true) : this.battle.draw("timer"));
    }, 1000);

    this.resetTimerState();
    for (const account of this.accounts) {
      const info = this.timerInfo(account);
      if (info) {
        this.server.to(account.userRoom).emit("timerStart", this.id, initiator.id, info);
      }
    }

    this.sendMessage({type: "timerStart", id: initiator.id});
    return true;
  }

  timerInfo(_account: Account) {
    // TODO: per-player timer duration
    return this.timer && !this.battle.finished
      ? ({startedAt: this.lastTurn, duration: TURN_DECISION_TIME_MS} satisfies BattleTimer)
      : undefined;
  }

  broadcastTurn(turn: BattleEvent[]) {
    this.events.push(...turn);
    this.resetTimerState();

    for (const player of this.battle.players) {
      const account = this.server.getAccount(player.id);
      if (account) {
        const result = Battle.censorEvents(turn, player);
        const opts = player.active.map(a => a.options).filter(a => !!a);
        this.server
          .to(account.userRoom)
          .emit("nextTurn", this.id, result, opts, this.timerInfo(account));
      }
    }

    this.server.to(this.spectatorRoom).emit("nextTurn", this.id, Battle.censorEvents(turn));
    if (this.battle.finished) {
      for (const player of this.battle.players) {
        this.server.onBattleEnded(player.id, this);
      }

      this.server.telemetry?.onBattleComplete(this.format, this.battle);
    }
  }

  sendMessage(message: InfoMessage) {
    const turn = this.battle.turn;
    if (!this.chats[turn]) {
      this.chats[turn] = [];
    }
    this.chats[turn].push(message);
    this.server.to(this.id).emit("info", this.id, message, turn);
  }

  onSocketJoin(socket: Socket, notifyJoin: bool) {
    socket.join(this.id);
    if (!socket.account) {
      socket.join(this.spectatorRoom);
      return;
    } else if (this.accounts.has(socket.account)) {
      if (!this.battle.findPlayer(socket.account.id)) {
        socket.join(this.spectatorRoom);
      }
      return;
    }

    const player = this.battle.findPlayer(socket.account.id);
    if (notifyJoin) {
      this.sendMessage({
        type: "userJoin",
        id: socket.account.id,
        name: socket.account.name,
        isSpectator: !player,
        nPokemon: player?.team.length ?? 0,
      });
    }
    this.accounts.add(socket.account);
    if (!player) {
      socket.join(this.spectatorRoom);
    }
  }

  makeDescriptor() {
    return {
      id: this.id,
      battlers: this.server.getBattlers(this),
      format: this.format,
      finished: this.battle.finished,
    } satisfies RoomDescriptor;
  }

  async onSocketLeave(socket: Socket, server: GameServer, sockets?: Socket[]) {
    socket.leave(this.id);
    socket.leave(this.spectatorRoom);
    if (!socket.account || !this.accounts.has(socket.account)) {
      return;
    }

    sockets ??= (await server.in(socket.account.userRoom).fetchSockets()) as unknown as Socket[];
    if (sockets.every(s => !s.rooms.has(this.id))) {
      this.sendMessage({type: "userLeave", id: socket.account.id});
      this.accounts.delete(socket.account);
    }
  }
}

export type Telemetry = {onBattleComplete(format: FormatId, battle: Battle): void};

export type ServerConfig = {maintenance?: bool; botMatchmaking?: bool};

export class GameServer extends Server<ClientMessage, ServerMessage> {
  private readonly accounts = new Map<string, Account>();
  private readonly mmWaiting: Partial<Record<FormatId, PlayerParams>> = {};
  private readonly rooms = new Map<string, Room>();
  private config: ServerConfig = {botMatchmaking: true};

  constructor(opts?: Partial<ServerOptions>, public readonly telemetry?: Telemetry) {
    super(opts);
    this.on("connection", socket => this.newConnection(socket));
    this.on("error", console.error);
    this.on("close", () => console.log("game server has closed..."));
  }

  private newConnection(socket: Socket) {
    // @ts-expect-error property does not exist
    const user: User | undefined = socket.request.__SOCKETIO_USER__;
    if (user) {
      console.log(`new connection: ${socket.id} from '${user.name}':${user.id}`);
      if (!(socket.account = this.accounts.get(user.id))) {
        const account: Account = {
          id: user.id,
          name: user.name,
          admin: user.admin,
          offline: false,
          userRoom: `user:${user.id}`,
          activeBattles: new Set(),
          challenges: [],
        };
        this.accounts.set(user.id, account);
        socket.account = account;
      }
      socket.account.offline = false;
      socket.join(socket.account.userRoom);
    } else {
      console.log(`new connection: ${socket.id}`);
    }

    socket.on("enterMatchmaking", (team, format, challenge, ack) => {
      if (this.config.maintenance) {
        return ack("maintenance");
      }

      const account = socket.account;
      if (!account) {
        return ack("must_login");
      }

      if (account.matchmaking) {
        this.leaveMatchmaking(account);
      }

      if (account.activeBattles.size >= 5) {
        return ack("too_many");
      }

      const player = this.getPlayer(account, format, team);
      if (Array.isArray(player)) {
        return ack("invalid_team", player);
      }

      if (challenge) {
        const challenged = this.accounts.get(challenge);
        if (!challenged || challenged.offline) {
          return ack("bad_user");
        }

        challenged.challenges.push({format, from: account, player});
        account.matchmaking = {challenged};

        this.to(challenged.userRoom).emit("challengeReceived", {
          format,
          from: {name: account.name, id: account.id},
        });
        return ack();
      }

      // highly advanced matchmaking algorithm
      const opponent = this.mmWaiting[format];
      if (opponent) {
        this.setupRoom(player, opponent, format);
      } else {
        this.mmWaiting[format] = player;
        account.matchmaking = {format};

        this.scheduleBotMatch(format, player);
      }

      ack();
    });
    socket.on("respondToChallenge", (id, accept, team, ack) => {
      if (this.config.maintenance) {
        return ack("maintenance");
      }

      const account = socket.account;
      if (!account) {
        return ack("must_login");
      }

      const idx = account.challenges.findIndex(acc => acc.from.id === id);
      if (idx === -1) {
        return ack("bad_user");
      } else if (!accept) {
        const [c] = account.challenges.splice(idx, 1);
        delete c.from.matchmaking;
        this.to(c.from.userRoom).emit("challengeRejected", {name: account.name, id: account.id});
        return ack();
      }

      if (account.matchmaking) {
        this.leaveMatchmaking(account);
      }

      if (account.activeBattles.size >= 5) {
        return ack("too_many");
      }

      const player = this.getPlayer(account, account.challenges[idx].format, team);
      if (Array.isArray(player)) {
        return ack("invalid_team", player);
      }

      const [c] = account.challenges.splice(idx, 1);
      delete c.from.matchmaking;
      this.setupRoom(player, c.player, c.format);
      ack();
    });
    socket.on("exitMatchmaking", ack => {
      if (socket.account) {
        this.leaveMatchmaking(socket.account);
      }
      ack();
    });
    socket.on("joinRoom", (roomId, eventStartIndex, ack) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        return ack("bad_room");
      }

      room.onSocketJoin(socket, true);

      const player = socket.account && room.battle.findPlayer(socket.account.id);
      return ack({
        team: player?.teamDesc,
        options: player?.active?.map(a => a.options)?.filter(a => !!a),
        events: Battle.censorEvents(room.events.slice(eventStartIndex), player),
        chats: room.chats,
        format: room.format,
        timer: socket.account && room.timerInfo(socket.account),
        finished: room.battle.finished,
        battlers: this.getBattlers(room),
      });
    });
    socket.on("leaveRoom", async (roomId, ack) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        return ack("bad_room");
      }

      await room.onSocketLeave(socket, this);
      return ack();
    });
    socket.on("choose", (roomId, sequenceNo, choice, ack) => {
      const info = this.validateMove(socket, roomId, sequenceNo);
      if (typeof info === "string") {
        return ack(info);
      }

      const [player, room] = info;
      if (choice.type === "move") {
        if (!player.chooseMove(choice.who, room.battle, choice.moveIndex, choice.target)) {
          return ack("invalid_choice");
        }
      } else if (choice.type === "switch") {
        if (!player.chooseSwitch(choice.who, room.battle, choice.pokeIndex)) {
          return ack("invalid_choice");
        }
      } else if (choice.type !== "forfeit") {
        return ack("invalid_choice");
      } else if (room.battle.finished) {
        return ack("finished");
      }

      ack();
      const turn =
        choice.type === "forfeit" ? room.battle.forfeit(player, false) : room.battle.nextTurn();
      if (turn) {
        room.broadcastTurn(turn);
      }
    });
    socket.on("cancel", (roomId, sequenceNo, ack) => {
      const info = this.validateMove(socket, roomId, sequenceNo);
      if (typeof info === "string") {
        return ack(info);
      }

      info[0].cancel();
      ack();
    });
    socket.on("startTimer", (roomId, ack) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        return ack("bad_room");
      } else if (!socket.account || !room.accounts.has(socket.account)) {
        return ack("not_in_room");
      } else if (!room.battle.findPlayer(socket.account.id)) {
        return ack("not_in_battle");
      }

      ack(!room.startTimer(socket.account) ? "already_on" : undefined);
    });
    socket.on("chat", (roomId, message, ack) => {
      message = message.trim();

      const room = this.rooms.get(roomId);
      if (!room) {
        return ack("bad_room");
      } else if (!message.length) {
        return ack("bad_message");
      } else if (!socket.account || !room.accounts.has(socket.account)) {
        return ack("not_in_room");
      }

      ack();
      room.sendMessage({type: "chat", message, id: socket.account.id});
    });
    socket.on("getRoom", (id, ack) => {
      const room = this.rooms.get(id);
      if (!room) {
        return ack("bad_room");
      }

      return ack(room.makeDescriptor());
    });
    socket.on("getRooms", ack => {
      ack(
        this.rooms
          .values()
          .map(room => room.makeDescriptor())
          .toArray(),
      );
    });
    socket.on("getPlayerRooms", (player, ack) => {
      const account = this.accounts.get(player);
      if (!account) {
        return ack("bad_player");
      }

      ack(
        account.activeBattles
          .values()
          .filter(room => !room.battle.finished)
          .map(room => room.makeDescriptor())
          .toArray(),
      );
    });
    socket.on("getOnlineUsers", (q: string, ack) => {
      return ack(
        this.accounts
          .values()
          .filter(
            acc =>
              socket.account?.id !== acc.id &&
              !acc.offline &&
              acc.name.toLowerCase().includes(q.toLowerCase()),
          )
          .map(acc => ({name: acc.name, id: acc.id}))
          .toArray(),
      );
    });
    socket.on("getChallenges", ack => {
      if (!socket.account) {
        return ack([]);
      }

      return ack(
        socket.account.challenges.map(c => ({
          from: {name: c.from.name, id: c.from.id},
          format: c.format,
        })),
      );
    });
    socket.on("disconnecting", async () => {
      const account = socket.account;
      if (!account) {
        console.log(`lost connection: ${socket.id}`);
        return;
      }

      console.log(`lost connection: ${socket.id} (was '${account.name}':${account.id})`);
      socket.leave(account.userRoom);

      const rooms = [...socket.rooms];
      // across this await point SocketIO might clean up this socket and clear rooms
      const sockets = (await this.in(account.userRoom).fetchSockets()) as unknown as Socket[];
      for (const id of rooms) {
        const room = this.rooms.get(id);
        if (room) {
          await room.onSocketLeave(socket, this, sockets);
        }
      }

      if (!sockets.length) {
        this.leaveMatchmaking(account);
        account.offline = true;
        // FIXME: Account memory leak
        // this.accounts.delete(account.id);
      }
    });
    socket.on("getConfig", ack => {
      if (!socket.account?.admin) {
        return ack(false);
      }

      return ack(this.config);
    });
    socket.on("setConfig", (state, ack) => {
      if (!socket.account?.admin) {
        return ack(false);
      }

      if (!!this.config.maintenance !== !!state.maintenance) {
        this.emit("maintenanceState", !!state.maintenance);

        if (!state.maintenance) {
          for (const format in this.mmWaiting) {
            const player = this.mmWaiting[format as FormatId];
            if (player) {
              this.leaveMatchmaking(this.accounts.get(player.id)!);
            }
          }
        }
      }

      this.config = state;
      ack(true);
    });
  }

  private scheduleBotMatch(format: FormatId, player: PlayerParams) {
    if (!activeBots.length || activeBots.includes(player.id) || !this.config.botMatchmaking) {
      return;
    }

    setTimeout(() => {
      if (this.mmWaiting[format] !== player) {
        return;
      }

      const bot = this.accounts.get(random.choice(activeBots)!)!;
      let botPlayer;
      while (!botPlayer || Array.isArray(botPlayer)) {
        botPlayer = this.getPlayer(bot, format, createBotTeam(format));
      }
      this.setupRoom(this.mmWaiting[format], botPlayer, format);
    }, 1000 * 5);
  }

  private leaveMatchmaking(account: Account) {
    const res = account.matchmaking;
    if (!res) {
      return;
    }

    if ("format" in res) {
      const waiting = this.mmWaiting[res.format];
      if (waiting && this.accounts.get(waiting.id) === account) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.mmWaiting[res.format];
      }
    } else {
      const idx = res.challenged.challenges.findIndex(c => c.from.id === account.id);
      if (idx !== -1) {
        const [c] = res.challenged.challenges.splice(idx, 1);
        this.to(res.challenged.userRoom).emit("challengeRetracted", {
          name: c.from.name,
          id: c.from.id,
        });
      }
    }

    delete account.matchmaking;
  }

  private setupRoom(player: PlayerParams, opponent: PlayerParams, format: FormatId) {
    const onFoundMatch = (room: Room, account: Account) => {
      account.activeBattles.add(room);
      this.to(account.userRoom).emit("foundMatch", room.id);
      this.leaveMatchmaking(account);
    };

    const fmt = formatInfo[format];
    const [battle, turn0] = Battle.start({
      gen: GENERATIONS[fmt.generation]!,
      player1: player,
      player2: opponent,
      doubles: fmt.doubles,
      chooseLead: fmt.chooseLead,
      mods: fmt.mods,
    });
    const room = new Room(crypto.randomUUID(), battle, turn0, format, this);
    this.rooms.set(room.id, room);

    onFoundMatch(room, this.accounts.get(player.id)!);
    onFoundMatch(room, this.accounts.get(opponent.id)!);
  }

  private validateMove(socket: Socket, roomId: string, sequenceNo: number) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return "bad_room";
    } else if (!socket.account) {
      return "not_in_battle";
    }

    const player = room.battle.findPlayer(socket.account.id);
    if (!player) {
      return "not_in_battle";
    } else if (sequenceNo !== room.events.length) {
      return "too_late";
    }

    return [player, room] as const;
  }

  private getPlayer(account: Account, format: FormatId, team?: any) {
    if (formatDescs[format].validate) {
      const [success, result] = formatDescs[format].validate(team);
      if (!success) {
        return result;
      }

      return {id: account.id, team: result};
    } else {
      return {id: account.id, team: formatDescs[format].generate!()};
    }
  }

  getBattlers(room: Room) {
    return room.battle.players.map(pl => {
      const acc = this.accounts.get(pl.id)!;
      return {name: acc.name, id: acc.id, nPokemon: pl.teamDesc.length};
    });
  }

  getAccount(id: string) {
    return this.accounts.get(id);
  }

  onBattleEnded(player: string, room: Room) {
    this.accounts.get(player)!.activeBattles.delete(room);
  }

  destroyRoom(room: Room) {
    this.socketsLeave([room.spectatorRoom, room.id]);
    this.rooms.delete(room.id);
  }
}
