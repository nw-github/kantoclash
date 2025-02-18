import { v4 as uuid } from "uuid";
import { Server as SocketIoServer, Socket as SocketIoClient } from "socket.io";
import { Pokemon } from "../../game/pokemon";
import { Battle, Options, Player, Turn } from "../../game/battle";
import { type FormatId, type TeamProblems, formatDescs } from "../../utils/formats";
import { User } from "#auth-utils";
import type { Gen1PokemonDesc } from "~/utils/pokemon";

export type LoginResponse = {
  id: string;
};

export type JoinRoomResponse = {
  team?: Pokemon[];
  options?: Options;
  players: { id: string; name: string; isSpectator: boolean; nPokemon: number }[];
  turns: Turn[];
  chats: Chats;
  format: FormatId;
  timer?: BattleTimer;
};

export type BattleTimer = { startedAt: number; duration: number };

export type ChoiceError = "invalid_choice" | "bad_room" | "not_in_battle" | "too_late";

export type Chats = Record<number, { player: string; message: string }[]>;

export type RoomDescriptor = {
  id: string;
  /** Name[], not Id[] */
  battlers: string[];
  format: FormatId;
};

export interface ClientMessage {
  getRooms: (ack: (rooms: RoomDescriptor[]) => void) => void;

  enterMatchmaking: (
    team: Gen1PokemonDesc[] | undefined,
    format: FormatId,
    ack: (err?: "must_login" | "invalid_team", problems?: TeamProblems) => void,
  ) => void;
  exitMatchmaking: (ack: () => void) => void;

  joinRoom: (
    room: string,
    turn: number,
    ack: (resp: JoinRoomResponse | "bad_room") => void,
  ) => void;
  leaveRoom: (room: string, ack: (resp?: "bad_room") => void) => void;
  choose: (
    room: string,
    idx: number,
    type: "move" | "switch" | "forfeit",
    turn: number,
    ack: (err?: ChoiceError) => void,
  ) => void;
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
}

export interface ServerMessage {
  foundMatch: (room: string) => void;

  nextTurn: (room: string, turn: Turn, options?: Options, timer?: BattleTimer) => void;
  timerStart: (room: string, who: string, timer: BattleTimer) => void;

  userJoin: (
    room: string,
    name: string,
    id: string,
    isSpectator: boolean,
    nPokemon: number,
  ) => void;
  userLeave: (room: string, id: string) => void;
  userReconnect: (room: string, id: string) => void;
  userChat: (room: string, id: string, message: string, turn: number) => void;
}

declare module "socket.io" {
  interface Socket {
    account?: Account;
  }
}

type Socket = SocketIoClient<ClientMessage, ServerMessage>;

const ROOM_CLEANUP_DELAY_MS = 15 * 60 * 1000;
const TURN_DECISION_TIME_MS = 45 * 1000;

class Room {
  turns: Turn[];
  accounts = new Set<Account>();
  chats: Chats = [];
  timer?: NodeJS.Timeout;
  lastTurn: number = Date.now();
  spectatorRoom: string;

  constructor(
    public id: string,
    public battle: Battle,
    init: Turn,
    public format: FormatId,
    public server: GameServer,
  ) {
    this.turns = [init];
    this.spectatorRoom = `spectator:${this.id}`;
  }

  endTurn() {
    if (this.battle.victor) {
      clearInterval(this.timer);
      this.timer = undefined;
      setTimeout(() => this.server.destroyRoom(this), ROOM_CLEANUP_DELAY_MS);
      return;
    }

    this.lastTurn = Date.now();
  }

  startTimer(initiator: Account, server: GameServer) {
    if (this.timer || this.battle.victor) {
      return false;
    }

    this.timer = setInterval(() => {
      if (Date.now() - this.lastTurn < TURN_DECISION_TIME_MS || this.battle.victor) {
        return;
      }

      for (const account of this.accounts) {
        const player = this.battle.findPlayer(account.id);
        if (player && !player.choice && player.options) {
          this.server.broadcastTurn(this, this.battle.forfeit(player, true));
          return;
        }
      }
    }, 1000);

    this.endTurn();
    for (const account of this.accounts) {
      const info = this.timerInfo(account);
      if (info) {
        server.to(account.userRoom).emit("timerStart", this.id, initiator.id, info);
      }
    }
    return true;
  }

  timerInfo(_account: Account) {
    // TODO: per-player timer duration
    return this.timer && !this.battle.victor
      ? ({ startedAt: this.lastTurn, duration: TURN_DECISION_TIME_MS } satisfies BattleTimer)
      : undefined;
  }
}

class Account {
  matchmaking?: FormatId;
  userRoom: string;
  disconnectedRooms = new Set<Room>();

  constructor(public id: string, public name: string) {
    this.userRoom = `user:${this.id}`;
  }

  joinBattle(room: Room, server: GameServer) {
    this.onSocketJoinRoom(room, server, true);

    server.to(this.userRoom).emit("foundMatch", room.id);
  }

  onSocketJoinRoom(room: Room, server: GameServer, notifyJoin: boolean) {
    if (room.accounts.has(this)) {
      if (this.disconnectedRooms.delete(room)) {
        server.to(room.id).emit("userReconnect", room.id, this.id);
      }
      return;
    }

    if (notifyJoin) {
      const player = room.battle.findPlayer(this.id);
      server
        .to(room.id)
        .emit("userJoin", room.id, this.name, this.id, !player, player?.team.length ?? 0);
    }
    room.accounts.add(this);
  }

  /** @returns true if this account still has one or more sockets connected in this room */
  async onSocketLeaveRoom(room: Room, server: GameServer, forced: boolean, sockets?: Socket[]) {
    if (!room.accounts.has(this)) {
      return false;
    }

    sockets ??= (await server.in(this.userRoom).fetchSockets()) as unknown as Socket[];
    if (forced) {
      for (const socket of sockets) {
        socket.leave(room.id);
        socket.leave(room.spectatorRoom);
      }

      room.accounts.delete(this);
      this.disconnectedRooms.delete(room);
    } else if (sockets.some(s => s.rooms.has(room.id))) {
      return true;
    } else {
      const player = room.battle.findPlayer(this.id);
      if (player) {
        // TODO: start room disconnect timer
        this.disconnectedRooms.add(room);
      } else {
        room.accounts.delete(this);
      }

      server.to(room.id).emit("userLeave", room.id, this.id);
      return !!player;
    }
    return false;
  }
}

export class GameServer extends SocketIoServer<ClientMessage, ServerMessage> {
  private accounts: Record<string, Account> = {};
  private mmWaiting: Partial<Record<FormatId, [Player, Account]>> = {};
  private rooms: Record<string, Room> = {};

  constructor(server?: any) {
    super(server);
    this.on("connection", socket => this.newConnection(socket));
    this.on("error", console.error);
    this.on("close", () => console.log("game server has closed..."));
  }

  private newConnection(socket: Socket) {
    // @ts-expect-error property does not exist
    const user: User | undefined = socket.request.__SOCKETIO_USER__;
    if (user) {
      console.log(`new connection: ${socket.id} from user: '${user.name}' (${user.id})`);
      socket.account = this.accounts[user.id] ??= new Account(user.id, user.name);
      socket.join(socket.account.userRoom);
    } else {
      console.log(`new connection: ${socket.id}`);
    }

    socket.on("enterMatchmaking", (team, format, ack) => {
      const account = socket.account;
      if (!account) {
        return ack("must_login");
      }

      if (account.matchmaking) {
        this.leaveMatchmaking(account);
      }

      const problems = this.enterMatchmaking(account, format, team);
      if (problems) {
        ack("invalid_team", problems);
      } else {
        ack();
      }
    });
    socket.on("exitMatchmaking", ack => {
      if (socket.account) {
        this.leaveMatchmaking(socket.account);
      }
      ack();
    });
    socket.on("joinRoom", (roomId, turn, ack) => {
      const room = this.rooms[roomId];
      if (!room) {
        return ack("bad_room");
      }

      socket.join(roomId);
      if (socket.account) {
        socket.account.onSocketJoinRoom(room, this, true);
      } else {
        socket.join(room.spectatorRoom);
      }

      const player = socket.account && room.battle.findPlayer(socket.account.id);
      return ack({
        team: player?.originalTeam,
        options: player?.options,
        players: room.accounts
          .keys()
          .map(acc => ({
            name: acc.name,
            id: acc.id,
            isSpectator: !room.battle.findPlayer(acc.id),
            nPokemon: room.battle.findPlayer(acc.id)?.team.length ?? 0,
          }))
          .toArray(),
        turns: room.turns.slice(turn).map(({ events, switchTurn }) => ({
          events: Battle.censorEvents(events, player),
          switchTurn,
        })),
        chats: room.chats,
        format: room.format,
        timer: socket.account && room.timerInfo(socket.account),
      });
    });
    socket.on("leaveRoom", async (roomId, ack) => {
      const room = this.rooms[roomId];
      if (!room) {
        return ack("bad_room");
      }

      socket.leave(roomId);
      if (socket.account) {
        await socket.account.onSocketLeaveRoom(room, this, false);
      } else {
        socket.leave(room.spectatorRoom);
      }
      return ack();
    });
    socket.on("choose", (roomId, index, type, sequenceNo, ack) => {
      const info = this.validatePlayer(socket, roomId, sequenceNo);
      if (typeof info === "string") {
        return ack(info);
      }

      const [player, room] = info;
      if (type === "move") {
        if (!player.chooseMove(index)) {
          return ack("invalid_choice");
        }
      } else if (type === "switch") {
        if (!player.chooseSwitch(index)) {
          return ack("invalid_choice");
        }
      } else if (type !== "forfeit") {
        return ack("invalid_choice");
      }

      ack();
      const turn = type === "forfeit" ? room.battle.forfeit(player, false) : room.battle.nextTurn();
      if (turn) {
        this.broadcastTurn(room, turn);
      }
    });
    socket.on("cancel", (roomId, sequenceNo, ack) => {
      const info = this.validatePlayer(socket, roomId, sequenceNo);
      if (typeof info === "string") {
        return ack(info);
      }

      info[0].cancel();
      ack();
    });
    socket.on("startTimer", (roomId, ack) => {
      const room = this.rooms[roomId];
      if (!room) {
        return ack("bad_room");
      } else if (!socket.account || !room.accounts.has(socket.account)) {
        return ack("not_in_room");
      } else if (!room.battle.findPlayer(socket.account.id)) {
        return ack("not_in_battle");
      }

      ack(room.startTimer(socket.account, this) ? "already_on" : undefined);
    });
    socket.on("chat", (roomId, message, ack) => {
      message = message.trim();

      const room = this.rooms[roomId];
      if (!room) {
        return ack("bad_room");
      } else if (!message.length) {
        return ack("bad_message");
      } else if (!socket.account || !room.accounts.has(socket.account)) {
        return ack("not_in_room");
      }

      ack();
      this.sendChat(room, message, socket.account.id, true);
    });
    socket.on("getRooms", ack =>
      ack(
        Object.entries(this.rooms)
          .filter(([, room]) => !room.battle.victor)
          .map(([id, room]) => ({
            id,
            battlers: room.accounts
              .keys()
              .filter(acc => room.battle.findPlayer(acc.id))
              .map(acc => acc.name)
              .toArray(),
            format: room.format,
          })),
      ),
    );
    socket.on("disconnecting", async () => {
      const account = socket.account;
      if (!account) {
        return;
      }

      socket.leave(account.userRoom);

      const rooms = [...socket.rooms];
      // across this await point SocketIO might clean up this socket and clear rooms
      const sockets = (await this.in(account.userRoom).fetchSockets()) as unknown as Socket[];

      let stillInRooms = false;
      for (const id of rooms) {
        const room = this.rooms[id];
        if (room && (await account.onSocketLeaveRoom(room, this, false, sockets))) {
          stillInRooms = true;
        }
      }

      if (!sockets.length) {
        this.leaveMatchmaking(account);
        if (!stillInRooms) {
          delete this.accounts[account.id];
        }
      }
    });
  }

  private enterMatchmaking(account: Account, format: FormatId, team?: any) {
    let player;
    if (formatDescs[format].validate) {
      const [success, result] = formatDescs[format].validate(team);
      if (!success) {
        return result;
      }

      player = new Player(account.id, result);
    } else {
      player = new Player(account.id, formatDescs[format].generate!());
    }

    // highly advanced matchmaking algorithm
    const mm = this.mmWaiting[format];
    if (mm) {
      const roomId = uuid();
      const [opponent, opponentAcc] = mm;
      const [battle, turn0] = Battle.start(player, opponent);
      this.rooms[roomId] = new Room(roomId, battle, turn0, format, this);

      account.joinBattle(this.rooms[roomId], this);
      opponentAcc.joinBattle(this.rooms[roomId], this);

      this.leaveMatchmaking(account);
      this.leaveMatchmaking(opponentAcc);
    } else {
      this.mmWaiting[format] = [player, account];
      account.matchmaking = format;
    }
  }

  private leaveMatchmaking(account: Account) {
    const format = account.matchmaking;
    if (format && this.mmWaiting[format]?.[1] === account) {
      delete this.mmWaiting[format];
    }
    delete account.matchmaking;
  }

  private validatePlayer(socket: Socket, roomId: string, sequenceNo: number) {
    const room = this.rooms[roomId];
    if (!room) {
      return "bad_room";
    } else if (!socket.account) {
      return "not_in_battle";
    }

    const player = room.battle.findPlayer(socket.account.id);
    if (!player) {
      return "not_in_battle";
    } else if (sequenceNo !== room.turns.length) {
      return "too_late";
    }

    return [player, room] as const;
  }

  broadcastTurn(room: Room, turn: Turn) {
    room.turns.push(turn);
    room.endTurn();

    const { switchTurn, events } = turn;
    for (const account of room.accounts) {
      const player = room.battle.findPlayer(account.id);
      if (player) {
        const result = { switchTurn, events: Battle.censorEvents(events, player) };
        this.to(account.userRoom).emit(
          "nextTurn",
          room.id,
          result,
          player?.options,
          room.timerInfo(account),
        );
      }
    }

    this.to(room.spectatorRoom).emit("nextTurn", room.id, {
      switchTurn,
      events: Battle.censorEvents(events),
    });
  }

  sendChat(room: Room, message: string, player: string, save: boolean) {
    const turn = Math.max(room.turns.length - 1, 0);
    if (save) {
      if (!room.chats[turn]) {
        room.chats[turn] = [];
      }
      room.chats[turn].push({ message, player });
    }
    this.to(room.id).emit("userChat", room.id, player, message, turn);
  }

  async destroyRoom(room: Room) {
    await Promise.allSettled(room.accounts.keys().map(a => a.onSocketLeaveRoom(room, this, true)));
    delete this.rooms[room.id];
  }
}
