import { io, type Socket } from "socket.io-client";
import type { JoinRoomResponse } from "./utils/gameServer";
import type { BattleEvent } from "../game/events";
import { clamp } from "../game/utils";
import type { Options, Turn } from "../game/battle";
import { FormatId } from "~/utils/formats";
import { ClientPlayer } from "~/utils";
import { Pokemon } from "~/game/pokemon";
import random from "random";

export type BotFunction = (
  team: Pokemon[],
  options: Options,
  players: Record<string, ClientPlayer>,
  me: string,
  activePokemon: number,
) => readonly [number, "switch" | "move"];

export function startBot(format: FormatId = "randoms", botFunction: BotFunction = randomBot) {
  const $conn = io("ws://localhost:3000") as Socket<ServerMessage, ClientMessage>;
  const games: Record<string, (turn: Turn, opts?: Options) => void> = {};
  let myId = "";
  let name = "Bot " + Math.floor(Math.random() * 10000);

  console.log(`[${name}] initializing bot...`);

  $conn.on("connect", () => {
    console.log(`[${name}] Connected! Logging in...`);

    $conn.emit("login", name, resp => {
      if (resp === "bad_username") {
        console.error(`[${name}] got bad username!`);
        return;
      }
      console.log(`[${name}] Logged in! My ID: ${resp.id}`);

      myId = resp.id;
      findMatch(format);
    });

    $conn.on("foundMatch", roomId => {
      $conn.emit("joinRoom", roomId, resp => {
        if (resp === "bad_room") {
          console.error(`[${name}] got bad room trying to join ${roomId}!`);
          return;
        }

        $conn.emit("startTimer", roomId, () => {});

        console.log(`[${name}] found a match for '${resp.format}': ${roomId}`);
        playGame(roomId, resp, botFunction, () => {
          console.log(`[${name}] finished game ${roomId} (${resp.format})`);

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
  });

  function findMatch(format: FormatId) {
    console.log(`[${name}] queueing for a ${format}`);
    $conn.emit("enterMatchmaking", undefined, format, () => {});
  }

  function playGame(
    room: string,
    { team, options, players: respPlayers, turns }: JoinRoomResponse,
    ai: BotFunction,
    gameOver: () => void,
  ) {
    const players: Record<string, ClientPlayer> = {};
    let activeIndex = 0;
    let turnNo = 0;

    const handleEvent = (e: BattleEvent) => {
      // TODO: unify this and Battle.vue:handleEvent
      if (e.type === "switch") {
        const player = players[e.src];
        player.active = { ...e, stages: {}, flags: {} };
        if (e.src === myId) {
          if (team?.[activeIndex]?.status === "tox") {
            team[activeIndex].status = "psn";
          }

          activeIndex = e.indexInTeam;
          player.active.stats = undefined;
        }
      } else if (e.type === "damage" || e.type === "recover") {
        players[e.target].active!.hp = e.hpAfter;
        if (e.target === myId) {
          team![activeIndex].hp = e.hpAfter;
        }

        if (e.hpAfter === 0) {
          players[e.target].nFainted++;
        }

        if (e.why === "rest") {
          players[e.target].active!.status = "slp";
        }

        if (e.why === "substitute") {
        }
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
        if (e.broken) {
        }
      }
    };

    const makeDecision = (options: Options, tries = 3) => {
      if (tries === 0) {
        console.error(`[${name}] Couldn't make a valid move after 3 tries, abandoning game.`);
        $conn.emit("chat", room, "Sorry, I couldn't figure out a move and must forfeit!", () => {});
        $conn.emit("choose", room, 0, "forfeit", turnNo, err => {});

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

    for (const { isSpectator, id, name, nPokemon } of respPlayers) {
      players[id] = { name, isSpectator, connected: true, nPokemon, nFainted: 0 };
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
