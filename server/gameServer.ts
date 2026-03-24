import {type ServerOptions, Server, type Socket as SocketIoClient} from "socket.io";

import {
  Pokemon,
  type FormId,
  type Gender,
  type PokemonDesc,
  type ValidatedPokemonDesc,
} from "~~/game/pokemon";
import {Battle, type Options} from "~~/game/battle";
import {GENERATIONS} from "~~/game/gen";
import type {BattleEvent, PlayerId, PokeId} from "~~/game/events";
import type {SpeciesId} from "~~/game/species";

import {type TeamProblems, formatDescs} from "./utils/formats";
import type {User} from "#auth-utils";
import type {InfoMessage, BattleTimers} from "./utils/info";
import {CHAT_MAX_MESSAGE, formatInfo} from "~/utils/shared";
import type {FormatId} from "~/utils/shared";
import {activeBots, createBotTeam} from "./bot";
import random from "random";

export {BattleTimers, InfoMessage};

export type TeamPreview = {speciesId: SpeciesId; form?: FormId; hasItem: bool; gender?: Gender}[];

export type JoinRoomResponse = {
  team?: ValidatedPokemonDesc[];
  options?: Options[];
  events: BattleEvent[];
  chats: InfoRecord;
  format: FormatId;
  timer?: BattleTimers;
  finished: bool;
  battlers: {
    id: string;
    name: string;
    admin?: bool;
    nPokemon: number;
    teamPreview?: TeamPreview;
  }[];
};

export type ChoiceError = "invalid_choice" | "bad_room" | "not_in_battle" | "too_late" | "finished";

export type Battler = {name: string; id: string; admin?: bool};

export type Challenge = {from: Battler; format: FormatId};

export type RoomDescriptor = {id: string; battlers: Battler[]; format: FormatId; finished: bool};
export type MMError =
  | "must_login"
  | "invalid_team"
  | "too_many"
  | "maintenance"
  | "bad_user"
  | "bad_format";

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
  reportBug: (
    room: string,
    message: string,
    ack: (resp?: "bad_room" | "not_in_room" | "bad_message" | "too_many_reports") => void,
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

  nextTurn: (room: string, events: BattleEvent[], options?: Options[], tmrs?: BattleTimers) => void;
  info: (room: string, message: InfoMessage, turn: number) => void;

  maintenanceState: (state: bool) => void;
}

export type InfoRecord = Record<number, InfoMessage[]>;

export type PlayerParams = {readonly id: PlayerId; readonly team: ValidatedPokemonDesc[]};

declare module "socket.io" {
  interface Socket {
    account?: Account;
  }
}

type Socket = SocketIoClient<ClientMessage, ServerMessage>;

const ROOM_CLEANUP_DELAY_MS = 15 * 60 * 1000;
const TURN_DECISION_TIME_MS = 45 * 1000;
const SHOW_SPECIES_FORM = new Set<SpeciesId>(["unown", "sawsbuck", "deerling", "basculin"]);

type Account = {
  id: string;
  name: string;
  admin?: bool;
  sockets: number;
  matchmaking?: {format: FormatId} | {challenged: Account};
  userRoom: string;
  activeBattles: Set<Room>;
  challenges: {format: FormatId; from: Account; player: PlayerParams}[];
  get offline(): bool;
};

class Room {
  readonly accounts = new Set<string>();
  readonly chats: InfoRecord = {};
  timer?: NodeJS.Timeout;
  lastTurn: number = Date.now();
  readonly spectatorRoom: string;
  readonly battle: Battle;
  readonly events: BattleEvent[];
  readonly battleRecipe: BattleRecipe;
  readonly reports: BugReports = {};
  readonly battlers: Battler[];

  constructor(
    public readonly id: string,
    public readonly server: GameServer,
    format: FormatId,
    player1: PlayerParams,
    player2: PlayerParams,
    seed = crypto.randomUUID(),
  ) {
    const fmt = formatInfo[format];
    const gen = GENERATIONS[fmt.generation]!;
    const cvtAndModify = ({id, team}: PlayerParams) => {
      return {
        id,
        team: team.map(p => {
          const poke = Pokemon.fromDescriptor(gen, p);
          p.shiny = poke.shiny;
          p.form = poke.form;
          p.gender = poke.gender;
          return poke;
        }),
      };
    };

    const [battle, turn0] = Battle.start({
      gen,
      player1: cvtAndModify(player1),
      player2: cvtAndModify(player2),
      doubles: fmt.doubles,
      chooseLead: !!fmt.chooseLead,
      mods: fmt.mods,
      seed,
    });

    this.battle = battle;
    this.events = turn0;
    this.spectatorRoom = `spectator:${this.id}`;
    this.battleRecipe = {seed, player1, player2, choices: {}, format};
    this.battlers = [player1, player2].map(pl => {
      const acc = this.server.getAccount(pl.id)!;
      // admin might become stale but not a huge deal
      return {name: acc.name, id: acc.id, admin: acc.admin};
    });

    console.log(
      `New room '${this.id}' hosting battle with seed '${seed}' [players ${this.battlers[0].name}, ${this.battlers[1].name}]`,
    );
  }

  getTeam(id: PlayerId) {
    if (id === this.battleRecipe.player1.id) {
      return this.battleRecipe.player1.team;
    } else if (id === this.battleRecipe.player2.id) {
      return this.battleRecipe.player2.team;
    }
  }

  getBattlerInfo(): JoinRoomResponse["battlers"] {
    return this.battlers.map(pl => {
      const team = this.getTeam(pl.id)!;
      return {
        id: pl.id,
        name: pl.name,
        admin: pl.admin,
        nPokemon: team.length,
        teamPreview:
          formatInfo[this.battleRecipe.format].chooseLead === "teamPreview"
            ? team.map(p => ({
                speciesId: p.speciesId,
                form: SHOW_SPECIES_FORM.has(p.speciesId) ? p.form : undefined,
                hasItem: !!p.item,
                gender: p.gender,
              }))
            : undefined,
      };
    });
  }

  resetTimerState() {
    if (this.battle.finished) {
      clearInterval(this.timer);
      this.timer = undefined;
      setTimeout(() => this.server.destroyRoom(this), ROOM_CLEANUP_DELAY_MS);
      return;
    }

    this.lastTurn = Date.now();
    return this.timerInfo();
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
      if (loser) {
        this.battleRecipe.terminated = {timer: loser.id};
        this.broadcastTurn(this.battle.forfeit(loser, true));
      } else {
        this.battleRecipe.terminated = {timer: null};
        this.broadcastTurn(this.battle.forceEnd("timer"));
      }
    }, 1000);

    this.sendMessage({type: "timerStart", id: initiator.id, info: this.resetTimerState()!});
    return true;
  }

  timerInfo() {
    if (!this.timer || this.battle.finished) {
      return undefined;
    }

    const info: BattleTimers = {};
    for (const {id} of this.battlers) {
      // TODO: per-player timer duration
      info[id] = {startedAt: this.lastTurn, duration: TURN_DECISION_TIME_MS};
    }
    return info;
  }

  broadcastTurn(turn: BattleEvent[]) {
    this.events.push(...turn);
    const timer = this.resetTimerState();
    for (const player of this.battle.players) {
      const account = this.server.getAccount(player.id);
      if (account) {
        const result = Battle.censorEvents(turn, player);
        const opts = player.active.map(a => a.options).filter(a => !!a);
        this.server.to(account.userRoom).emit("nextTurn", this.id, result, opts, timer);
      }
    }

    this.server
      .to(this.spectatorRoom)
      .emit("nextTurn", this.id, Battle.censorEvents(turn), undefined, timer);
    if (this.battle.finished) {
      for (const player of this.battle.players) {
        this.server.onBattleEnded(player.id, this);
      }

      this.server.telemetry?.onBattleComplete(this.battleRecipe.format, this.battle);
      if (Object.keys(this.reports).length) {
        this.server.telemetry?.reportBugs(this.id, this.battleRecipe, this.reports);
      }
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
    } else if (this.accounts.has(socket.account.id)) {
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
        admin: socket.account.admin,
        isSpectator: !player,
        nPokemon: player?.team.length ?? 0,
      });
    }
    this.accounts.add(socket.account.id);
    if (!player) {
      socket.join(this.spectatorRoom);
    }
  }

  makeDescriptor(): RoomDescriptor {
    return {
      id: this.id,
      battlers: this.battlers,
      format: this.battleRecipe.format,
      finished: this.battle.finished,
    };
  }

  saveChoice(accountId: string, choice: Choice) {
    const choices = (this.battleRecipe.choices[this.sequenceNo()] ??= []);
    if (choice.type !== "forfeit") {
      const other = choices.findIndex(
        ([acc, rhs]) => accountId == acc && rhs.type !== "forfeit" && rhs.who === choice.who,
      );
      if (other !== -1) {
        choices[other][1] = choice;
        return;
      }
    }

    choices.push([accountId, choice]);
  }

  reportBug(accountId: string, message: string) {
    const reports = (this.reports[accountId] ??= []);
    if (reports.length >= 5) {
      return false;
    }

    reports.push({turn: this.battle.turn, message});
    this.server.telemetry?.reportBugs(this.id, this.battleRecipe, this.reports);
    return true;
  }

  sequenceNo() {
    return this.events.length;
  }

  async onSocketLeave(socket: Socket, server: GameServer, sockets?: Socket[]) {
    socket.leave(this.id);
    socket.leave(this.spectatorRoom);
    if (!socket.account || !this.accounts.has(socket.account.id)) {
      return;
    }

    sockets ??= (await server.in(socket.account.userRoom).fetchSockets()) as unknown as Socket[];
    if (sockets.every(s => !s.rooms.has(this.id))) {
      this.sendMessage({type: "userLeave", id: socket.account.id});
      this.accounts.delete(socket.account.id);
    }
  }
}

export type BattleBugReport = {
  turn: number;
  message: string;
};

export type BattleRecipe = {
  format: FormatId;
  choices: Record<number, [string, Choice][]>;
  player1: PlayerParams;
  player2: PlayerParams;
  seed: string;
  terminated?: {timer: string | null};
};

export type BugReports = Record<string, BattleBugReport[]>;

export type Telemetry = {
  onBattleComplete(format: FormatId, battle: Battle): void;
  reportBugs(roomId: string, battle: BattleRecipe, reports: BugReports): void;
};

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
      if ((socket.account = this.accounts.get(user.id))) {
        socket.account.admin = user.admin;
        socket.account.name = user.name;
        socket.account.sockets++;
      } else {
        socket.account = {
          id: user.id,
          name: user.name,
          admin: user.admin,
          sockets: 1,
          userRoom: `user:${user.id}`,
          activeBattles: new Set(),
          challenges: [],
          get offline() {
            return this.sockets === 0;
          },
        };
        this.accounts.set(user.id, socket.account);
      }
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

      if (
        !(format in formatInfo) ||
        (formatInfo[format].beta && !import.meta.dev && !account.admin)
      ) {
        return ack("bad_format");
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
        if (!challenged || challenged.offline || challenged.id === account.id) {
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
        team: socket.account && room.getTeam(socket.account.id),
        options: player?.active?.map(a => a.options)?.filter(a => !!a),
        events: Battle.censorEvents(room.events.slice(eventStartIndex), player),
        chats: room.chats,
        format: room.battleRecipe.format,
        timer: room.timerInfo(),
        finished: room.battle.finished,
        battlers: room.getBattlerInfo(),
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
      const info = this.validateMove(socket, roomId);
      if (typeof info === "string") {
        return ack(info);
      }

      const [player, room] = info;
      if (room.battle.finished) {
        return ack("finished");
      } else if (choice.type !== "forfeit" && sequenceNo !== room.sequenceNo()) {
        return "too_late";
      }

      let ok = false;
      try {
        if (choice.type === "move") {
          ok = player.chooseMove(choice.who, room.battle, choice.moveIndex, choice.target);
        } else if (choice.type === "switch") {
          ok = player.chooseSwitch(choice.who, room.battle, choice.pokeIndex);
        } else if (choice.type === "forfeit") {
          ok = true;
        }
      } catch (ex) {
        console.log(`Ending ${room.id} due to an exception while choosing: `, ex);

        room.saveChoice(player.id, choice);
        room.broadcastTurn(room.battle.forceEnd("error"));
        return ack();
      }

      if (!ok) {
        return ack("invalid_choice");
      }

      ack();
      room.saveChoice(player.id, choice);
      try {
        const turn =
          choice.type === "forfeit" ? room.battle.forfeit(player, false) : room.battle.nextTurn();
        if (turn) {
          room.broadcastTurn(turn);
        }
      } catch (ex) {
        console.log(`Ending ${room.id} due to an exception: `, ex);

        room.reportBug("", "The game was automatically terminated due to an exception.");
        room.broadcastTurn(room.battle.forceEnd("error"));
      }
    });
    socket.on("cancel", (roomId, sequenceNo, ack) => {
      const info = this.validateMove(socket, roomId);
      if (typeof info === "string") {
        return ack(info);
      } else if (sequenceNo !== info[1].sequenceNo()) {
        return "too_late";
      }

      info[0].cancel();
      ack();
    });
    socket.on("startTimer", (roomId, ack) => {
      const room = this.rooms.get(roomId);
      if (!room) {
        return ack("bad_room");
      } else if (!socket.account || !room.accounts.has(socket.account.id)) {
        return ack("not_in_room");
      } else if (!room.battle.findPlayer(socket.account.id)) {
        return ack("not_in_battle");
      }

      ack(!room.startTimer(socket.account) ? "already_on" : undefined);
    });
    socket.on("chat", (roomId, message, ack) => {
      if (typeof message !== "string") {
        return ack("bad_message");
      }

      message = message.trim();

      const room = this.rooms.get(roomId);
      if (!room) {
        return ack("bad_room");
      } else if (!message.length || message.length > CHAT_MAX_MESSAGE) {
        return ack("bad_message");
      } else if (!socket.account || !room.accounts.has(socket.account.id)) {
        return ack("not_in_room");
      }

      ack();
      room.sendMessage({type: "chat", message, id: socket.account.id});
    });
    socket.on("reportBug", (roomId, message, ack) => {
      if (typeof message !== "string") {
        return ack("bad_message");
      }

      message = message.trim();

      const room = this.rooms.get(roomId);
      if (!room) {
        return ack("bad_room");
      } else if (!message.length || message.length > CHAT_MAX_MESSAGE) {
        return ack("bad_message");
      } else if (!socket.account || !room.accounts.has(socket.account.id)) {
        return ack("not_in_room");
      }

      if (!room.reportBug(socket.account.id, message)) {
        return ack("too_many_reports");
      } else {
        ack();
      }
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

      console.log(
        `lost connection: ${socket.id} (was '${account.name}':${account.id}, ${
          account.sockets - 1
        } sockets connected)`,
      );
      if (--account.sockets <= 0) {
        this.leaveMatchmaking(account);
        if (!account.activeBattles.size) {
          this.accounts.delete(account.id);
          console.log(`Pruning account '${account.name}': Went offline + not in any battles`);
        }
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

    const room = new Room(crypto.randomUUID(), this, format, player, opponent);
    this.rooms.set(room.id, room);

    onFoundMatch(room, this.accounts.get(player.id)!);
    onFoundMatch(room, this.accounts.get(opponent.id)!);
  }

  private validateMove(socket: Socket, roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return "bad_room";
    } else if (!socket.account) {
      return "not_in_battle";
    }

    const player = room.battle.findPlayer(socket.account.id);
    if (!player) {
      return "not_in_battle";
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

  getAccount(id: string) {
    return this.accounts.get(id);
  }

  onBattleEnded(player: string, room: Room) {
    const account = this.accounts.get(player);
    if (account) {
      account.activeBattles.delete(room);
      if (account.offline && !account.activeBattles.size) {
        this.accounts.delete(account.id);
        console.log(`Pruning account '${account.name}': Last battle ended & user is offline`);
      }
    } else {
      console.error(
        `onBattleEnded(): Account with ID ${player} was somehow pruned while still in a battle!`,
      );
    }
  }

  destroyRoom(room: Room) {
    this.socketsLeave([room.spectatorRoom, room.id]);
    this.rooms.delete(room.id);
  }
}
