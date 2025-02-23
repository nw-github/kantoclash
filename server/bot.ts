import { io, type Socket } from "socket.io-client";
import type { JoinRoomResponse } from "./utils/gameServer";
import type { BattleEvent } from "../game/events";
import type { Options, Turn } from "../game/battle";
import type { FormatId } from "~/utils/formats";
import type { ClientPlayer } from "~/utils";
import type { Pokemon } from "~/game/pokemon";
import { clamp } from "../game/utils";
import random from "random";
import { v4 as uuid } from "uuid";

export type BotFunction = (
  team: Pokemon[],
  options: Options,
  players: Record<string, ClientPlayer>,
  me: string,
  activePokemon: number,
) => readonly [number, "switch" | "move"];

export async function startBot(format: FormatId = "randoms", botFunction: BotFunction = randomBot) {
  const name = "BOT " + random.int(1111, 9999);
  console.log(`[${name}] initializing bot...`);

  await $fetch("/api/_auth/session", { method: "DELETE" }).catch(() => {});
  const resp = await $fetch.raw("/api/register", {
    method: "POST",
    body: { username: name, password: uuid() },
  });
  const cookie = resp.headers.getSetCookie().at(-1)!.split(";")[0];
  const { user } = await $fetch("/api/_auth/session", { method: "GET", headers: { cookie } });
  if (!user) {
    console.log(`[${name}] Login failed!...`);
    return;
  }

  const myId = user!.id;
  console.log(`[${name}] Logged in! My ID: ${myId}`);

  const $conn: Socket<ServerMessage, ClientMessage> = io("ws://localhost:3000", {
    extraHeaders: { cookie },
  });
  const games: Record<string, (turn: Turn, opts?: Options) => void> = {};
  $conn.on("connect", () => {
    console.log(`[${name}] Connected! Logging in...`);

    $conn.on("foundMatch", roomId => {
      $conn.emit("joinRoom", roomId, 0, resp => {
        if (resp === "bad_room") {
          console.error(`[${name}] got bad room trying to join ${roomId}!`);
          return;
        }

        $conn.emit("startTimer", roomId, () => {});

        console.log(`[${name}] found a match for '${resp.format}': ${roomId}`);
        playGame(roomId, resp, botFunction, () => {
          console.log(`[${name}] finished game ${roomId} (${resp.format})`);
          $conn.emit("leaveRoom", roomId, () => {});

          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete games[roomId];
          findMatch(resp.format);
        });
      });
    });

    $conn.on("nextTurn", async (roomId, turn, opts) => {
      if (games[roomId]) {
        games[roomId](turn, opts);
      }
    });

    $conn.on("maintenanceState", enabled => {
      if (!enabled) {
        findMatch(format);
      }
    });

    findMatch(format);
  });

  function findMatch(format: FormatId) {
    console.log(`[${name}] queueing for a ${format}`);
    $conn.emit("enterMatchmaking", undefined, format, (err, problems) => {
      if (err) {
        console.error(`[${name}] enter matchmaking failed: '${err}', `, problems);
      }
    });
  }

  function playGame(
    room: string,
    { team, options, chats, turns, battlers }: JoinRoomResponse,
    ai: BotFunction,
    gameOver: () => void,
  ) {
    const players: Record<string, ClientPlayer> = {};
    let activeIndex = -1;
    let turnNo = 0;

    const handleEvent = (e: BattleEvent) => {
      // TODO: unify this and Battle.vue:handleEvent
      if (e.type === "switch") {
        const player = players[e.src];
        player.active = { ...e, stages: {}, flags: {}, fainted: false };
        if (e.src === myId) {
          if (team?.[activeIndex]?.status === "tox") {
            team[activeIndex].status = "psn";
          }

          activeIndex = e.indexInTeam;
          player.active.stats = undefined;
        }
      } else if (e.type === "damage" || e.type === "recover") {
        players[e.target].active!.hpPercent = e.hpPercentAfter;
        if (e.target === myId) {
          team![activeIndex].hp = e.hpAfter!;
        }

        if (e.dead) {
          players[e.target].nFainted++;
        }

        if (e.why === "rest") {
          players[e.target].active!.status = "slp";
        }

        // if (e.why === "substitute") {
        // }
      } else if (e.type === "status") {
        players[e.id].active!.status = e.status;
        if (e.id === myId) {
          players[e.id].active!.stats = e.stats;
          team![activeIndex].status = e.status;
        }
      } else if (e.type === "stages") {
        players[myId].active!.stats = e.stats;
        const active = players[e.id].active!;
        for (const [stat, val] of e.stages) {
          active.stages[stat] = clamp((active.stages[stat] ?? 0) + val, -6, 6);
        }
      } else if (e.type === "transform") {
        const target = players[e.target].active!;
        const src = players[e.src].active!;
        src.transformed = target.transformed ?? target.speciesId;
        src.stages = { ...target.stages };
      } else if (e.type === "info") {
        if (e.why === "haze") {
          for (const player in players) {
            const active = players[player].active;
            if (!active) {
              continue;
            }

            if (player === e.id && active.status === "tox") {
              active.status = "psn";
            } else if (player !== e.id) {
              active.status = undefined;
            }

            active.stages = {};
          }

          players[myId].active!.stats = undefined;
        } else if (e.why === "wake" || e.why === "thaw") {
          players[e.id].active!.status = undefined;
        }
      } else if (e.type === "conversion") {
        players[e.user].active!.conversion = e.types;
      } else if (e.type === "hit_sub") {
        // if (e.broken) {
        // }
      }
    };

    const makeDecision = (options: Options, tries = 3) => {
      if (tries === 0) {
        console.error(`[${name}] Couldn't make a valid move after 3 tries, abandoning game.`);
        $conn.emit("chat", room, "Sorry, I couldn't figure out a move and must forfeit!", () => {});
        $conn.emit("choose", room, 0, "forfeit", turnNo, () => {});

        gameOver();
        return;
      }

      const [idx, opt] = ai(team!, options, players, myId, activeIndex);
      $conn.emit("choose", room, idx, opt, turnNo, err => {
        if (err) {
          if (opt === "switch") {
            console.error(`[${name}] bad switch '${err}' (to:`, team?.[idx], ")");
          } else {
            console.error(`[${name}] bad move: ${err} (was:`, options.moves?.[idx], ")");
          }
          makeDecision(options, tries - 1);
        }
      });
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
      } else if (message.type === "userLeave") {
        players[message.id].connected = false;
      }
    };

    for (const { id, name, nPokemon } of battlers) {
      players[id] = { name, isSpectator: false, connected: false, nPokemon, nFainted: 0 };
    }

    games[room] = (turn: Turn, options?: Options) => {
      turnNo++;

      let done = false;
      for (const event of turn.events) {
        handleEvent(event);

        if (event.type === "victory") {
          done = true;
        }
      }

      if (done && games[room]) {
        gameOver();
        return;
      }

      if (options) {
        makeDecision(options);
      }
    };

    for (const k in chats) {
      for (const msg of chats[k]) {
        processMessage(msg);
      }
    }

    for (let i = 0; i < turns.length; i++) {
      games[room](turns[i], i + 1 === turns.length ? options : undefined);
    }
  }
}

export function randomBot(
  team: Pokemon[],
  options: Options,
  _players: Record<string, ClientPlayer>,
  _me: string,
  activePokemon: number,
) {
  const validSwitches = team!.filter((poke, i) => poke.hp !== 0 && i !== activePokemon);
  const validMoves = options.moves.filter(move => move.valid);
  const switchRandomly = random.int(0, 10) === 1;
  if (!validMoves.length || (options.canSwitch && validSwitches.length && switchRandomly)) {
    return [team.indexOf(random.choice(validSwitches)!), "switch"] as const;
  } else {
    return [options.moves.indexOf(random.choice(validMoves)!), "move"] as const;
  }
}
