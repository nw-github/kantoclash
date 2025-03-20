import { io, type Socket } from "socket.io-client";
import type { ClientMessage, JoinRoomResponse, ServerMessage } from "./gameServer";
import type { BattleEvent } from "~/game/events";
import type { Options, Turn } from "~/game/battle";
import { randoms } from "~/server/utils/formats";
import {
  type ClientVolatiles,
  type ClientPlayer,
  type FormatId,
  formatInfo,
  mergeVolatiles,
} from "~/utils/shared";
import { Pokemon } from "~/game/pokemon";
import { getEffectiveness } from "~/game/utils";
import random from "random";
import { convertDesc, parseTeams, type Team } from "~/utils/pokemon";
import type { MoveId } from "~/game/moves";
import { type Generation, GENERATIONS } from "~/game/gen";

export type BotParams = {
  team: Pokemon[];
  options: Options;
  players: Record<string, ClientPlayer>;
  me: string;
  activePokemon: number;
  opponent: string;
  gen: Generation;
};

export type BotFunction = (params: BotParams) => readonly [number, "switch" | "move"];

type S = Socket<ServerMessage, ClientMessage>;

let nBots = 0;

export const activeBots: string[] = [];

export async function startBot(format?: FormatId, botFunction: BotFunction = randomBot) {
  const result = await login();
  if (!result) {
    console.log("Failed 3 times, not starting bot!");
    return;
  }

  const { cookie, myId, name } = result;

  const url = import.meta.dev
    ? "http://localhost:3000"
    : process.env.SELF_URL || `https://localhost:${process.env.PORT}`;
  const $conn: S = io(url, { extraHeaders: { cookie }, secure: !import.meta.dev });
  const games: Record<string, (turn: Turn, opts?: Options) => void> = {};
  $conn.on("connect", () => {
    activeBots.push(myId);

    $conn.on("foundMatch", roomId => {
      $conn.emit("joinRoom", roomId, 0, resp => {
        if (resp === "bad_room") {
          console.error(`[${name}] got bad room trying to join ${roomId}!`);
          return;
        }

        if (!import.meta.dev) {
          $conn.emit("startTimer", roomId, () => {});
        }

        console.log(`[${name}] found a match for '${resp.format}': ${roomId}`);
        playGame(roomId, resp, botFunction, () => {
          console.log(`[${name}] finished game ${roomId} (${resp.format})`);
          $conn.emit("leaveRoom", roomId, () => {});

          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete games[roomId];
          findMatch();
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
        findMatch();
      }
    });

    $conn.on("challengeReceived", ({ format, from }) => {
      $conn.emit("respondToChallenge", from.id, true, createBotTeam(format), () => {});
    });

    findMatch();
  });

  async function login() {
    let attempts = 3;
    while (attempts--) {
      const name = "BOT " + ++nBots;
      await $fetch("/api/_auth/session", { method: "DELETE" }).catch(() => {});
      let resp;
      try {
        resp = await $fetch.raw("/api/register", {
          method: "POST",
          body: { username: name, password: process.env.BOT_PASSWORD },
        });
      } catch {
        try {
          resp = await $fetch.raw("/api/login", {
            method: "POST",
            body: { username: name, password: process.env.BOT_PASSWORD },
          });
        } catch {
          console.log(`[${name}] Login failed!...`);
          continue;
        }
      }

      const cookie = resp.headers.getSetCookie().at(-1)!.split(";")[0];
      const { user } = await $fetch("/api/_auth/session", { method: "GET", headers: { cookie } });
      if (user) {
        return { cookie, myId: user.id, name };
      }

      console.log(`[${name}] Login failed!...`);
    }
  }

  function findMatch() {
    if (!format) {
      return;
    }

    console.log(`[${name}] queueing for a ${format}`);
    $conn.emit("enterMatchmaking", createBotTeam(format), format, undefined, (err, problems) => {
      if (err) {
        console.error(`[${name}] enter matchmaking failed: '${err}', `, problems);
      }
    });
  }

  function playGame(
    room: string,
    { team: teamDesc, options, chats, turns, battlers, format }: JoinRoomResponse,
    ai: BotFunction,
    gameOver: () => void,
  ) {
    const players: Record<string, ClientPlayer> = {};
    const gen = GENERATIONS[formatInfo[format].generation]!;
    let activePokemon = -1;
    let turnNo = 0;
    let opponent = "";
    const team = teamDesc!.map(poke => new Pokemon(gen, poke));

    const handleEvent = (e: BattleEvent) => {
      // TODO: unify this and Battle.vue:handleEvent
      if (e.type === "switch") {
        const player = players[e.src];
        player.active = { ...e, v: { stages: {} }, fainted: false };
        if (e.src === myId) {
          if (team?.[activePokemon]?.status === "tox") {
            team[activePokemon].status = "psn";
          }

          activePokemon = e.indexInTeam;
          player.active.v.stats = undefined;
        }
      } else if (e.type === "damage" || e.type === "recover") {
        players[e.target].active!.hpPercent = e.hpPercentAfter;
        if (e.target === myId) {
          team[activePokemon].hp = e.hpAfter!;
        }

        if (e.dead) {
          players[e.target].nFainted++;
        }
      }

      if (e.volatiles) {
        for (const { v, id } of e.volatiles) {
          players[id].active!.v = mergeVolatiles(v, players[id].active!.v) as ClientVolatiles;
          if (id === myId) {
            team[activePokemon].status = players[id].active!.v.status;
          }
        }
      }
    };

    const makeDecision = (options: Options, tries = 3) => {
      if (tries === 0) {
        console.error(`[${name}] Couldn't make a valid move after 3 tries, abandoning ${room}.`);
        // $conn.emit("chat", room, "Sorry, I couldn't figure out a move and must forfeit!", () => {});
        $conn.emit("choose", room, 0, "forfeit", turnNo, () => {});

        gameOver();
        return;
      }

      const [idx, opt] = ai({
        team,
        options,
        players,
        me: myId,
        activePokemon,
        opponent,
        gen,
      });
      $conn.emit("choose", room, idx, opt, turnNo, err => {
        if (err) {
          if (opt === "switch") {
            console.error(`[${name}] bad switch '${err}' (to: ${idx}|`, team?.[idx], ")");
          } else {
            console.error(`[${name}] bad move: ${err} (was: ${idx}|`, options.moves?.[idx], ")");
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
      if (id !== myId) {
        opponent = id;
      }
    }

    games[room] = (turn: Turn, options?: Options) => {
      turnNo++;

      let done = false;
      for (const event of turn.events) {
        handleEvent(event);

        if (event.type === "end") {
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

let ouTeams: Team[] = [];
export function createBotTeam(format: FormatId) {
  if (!ouTeams.length) {
    ouTeams = parseTeams(teams);
  }

  let team = undefined;
  if (formatInfo[format].needsTeam) {
    if (format.includes("standard")) {
      team = random.choice(ouTeams)!.pokemon.map(convertDesc);
    } else {
      const gen = GENERATIONS[formatInfo[format].generation]!;
      team = randoms(gen, s => (format === "g1_nfe") === !!s.evolvesTo);
    }
  }
  return team;
}

export function randomBot({ team, options, activePokemon }: BotParams) {
  const validSwitches = team.filter((poke, i) => poke.hp !== 0 && i !== activePokemon);
  const validMoves = options.moves.filter(move => move.valid);
  const switchRandomly = random.int(0, 11) === 1;
  if (!validMoves.length || (options.canSwitch && validSwitches.length && switchRandomly)) {
    return [team.indexOf(random.choice(validSwitches)!), "switch"] as const;
  } else {
    return [options.moves.indexOf(random.choice(validMoves)!), "move"] as const;
  }
}

export function rankBot({
  team,
  options,
  players,
  activePokemon,
  opponent: id,
  me,
  gen,
}: BotParams) {
  const rank = <T>(arr: T[], sort: (t: T, i: number) => number) => {
    const result = arr
      .map((item, i) => ({ score: sort(item, i), i }))
      .sort((a, b) => b.score - a.score)
      .filter((move, _, arr) => move.score >= 0 && move.score === arr[0].score);
    return result.length ? random.choice(result)! : { score: -1, i: -1 };
  };

  const rankMove = ({ move: id, valid }: { move: MoveId; valid: boolean }) => {
    if (!valid) {
      return -1;
    }

    const opponentPoke = new Pokemon(gen, {
      species: opponentActive.speciesId,
      level: opponentActive.level,
      moves: [],
    });
    opponentPoke.hp *= opponentActive.hpPercent / 100;

    const move = gen.moveList[id];
    if ((move.power ?? 0) > 1) {
      const eff = getEffectiveness(gen.typeChart, move.type, opponentPoke.species.types);
      if (eff > 1) {
        return 15;
      } else if (eff < 1) {
        return 5;
      } else if (eff === 0) {
        return 0;
      }
      return 10;
    } else if (move.kind === "recover") {
      if (self.hpPercent === 100) {
        return 0;
      } else if (self.hpPercent <= 25) {
        return 15;
      } else {
        return 5;
      }
    } else {
      // prettier-ignore
      const useless = (move.kind === "confuse" && opponentActive.v.confused) ||
        (move.kind === "status" && opponentActive.v.status) ||
        (id === "leechseed" && (opponentActive.v.seeded || opponentPoke.species.types.includes("grass"))) ||
        (id === "substitute" && self.v.substitute) ||
        (move.kind === "stage" && move.acc && opponentActive.v.substitute);
      if (useless) {
        return 0;
      }
    }

    return 10;
  };

  const self = players[me].active!;
  const opponentActive = players[id].active!;
  // const selfPoke = team[activePokemon];

  const { score, i: bestMove } = rank(options.moves, rankMove);
  if ((bestMove !== -1 && score > 5) || !options.canSwitch) {
    return [bestMove, "move"] as const;
  }

  const { i: bestSwitch } = rank(team, (poke, i) => {
    if (poke.hp === 0 || i === activePokemon) {
      return -1;
    } else if (!opponentActive) {
      return 10;
    } else if (poke.status === "frz" || poke.status === "slp") {
      return 0;
    }

    return Math.max(...poke.moves.map(move => rankMove({ move, valid: true })));
  });
  if (bestSwitch === -1) {
    return [bestMove, "move"] as const;
  }

  return [bestSwitch, "switch"] as const;
}

/// From: https://gist.github.com/scheibo/7c9172f3379bbf795a5e61a802caf2f0
const teams = `
=== [gen1ou] marcoasd 2014 ===

Gengar
- Hypnosis
- Thunderbolt
- Night Shade
- Explosion

Chansey
- Ice Beam
- Thunderbolt
- Thunder Wave
- Soft-Boiled

Snorlax
- Body Slam
- Earthquake
- Hyper Beam
- Self-Destruct

Exeggutor
- Sleep Powder
- Stun Spore
- Psychic
- Explosion

Tauros
- Body Slam
- Earthquake
- Hyper Beam
- Blizzard

Lapras
- Blizzard
- Thunderbolt
- Body Slam
- Confuse Ray


=== [gen1ou] Isa Standard ===

Alakazam
- Psychic
- Recover
- Seismic Toss
- Thunder Wave

Exeggutor
- Explosion
- Psychic
- Sleep Powder
- Mega Drain

Snorlax
- Body Slam
- Earthquake
- Hyper Beam
- Selfdestruct

Tauros
- Blizzard
- Body Slam
- Earthquake
- Hyper Beam

Chansey
- Ice Beam
- Softboiled
- Thunder Wave
- Thunderbolt

Rhydon
- Body Slam
- Earthquake
- Rock Slide
- Substitute


=== [gen1ou] GGFan 2002 (TOS) ===

Starmie
- Blizzard
- Thunderbolt
- Thunder Wave
- Recover

Tauros
- Blizzard
- Body Slam
- Earthquake
- Hyper Beam

Exeggutor
- Explosion
- Psychic
- Mega Drain
- Sleep Powder

Golem
- Explosion
- Earthquake
- Rock Slide
- Body Slam

Alakazam
- Psychic
- Thunder Wave
- Reflect
- Recover

Slowbro
- Amnesia
- Surf
- Thunder Wave
- Rest

=== [gen1ou] GGFan 2003 (Big 4) ===

Starmie
- Blizzard
- Thunderbolt
- Thunder Wave
- Recover

Snorlax
- Body Slam
- Earthquake
- Hyper Beam
- Selfdestruct

Tauros
- Blizzard
- Body Slam
- Earthquake
- Hyper Beam

Chansey
- Ice Beam
- Thunderbolt
- Thunder Wave
- Softboiled

Exeggutor
- Explosion
- Psychic
- Stun Spore
- Sleep Powder

Alakazam
- Psychic
- Thunder Wave
- Reflect
- Recover


=== [gen1ou] GGFan 2007 ===

Jynx
- Lovely Kiss
- Blizzard
- Psychic
- Body Slam

Tauros
- Blizzard
- Body Slam
- Earthquake
- Hyper Beam

Snorlax
- Body Slam
- Earthquake
- Hyper Beam
- Selfdestruct

Exeggutor
- Psychic
- Sleep Powder
- Explosion
- Stun Spore

Chansey
- Ice Beam
- Thunder Wave
- Counter
- Softboiled

Alakazam
- Psychic
- Thunder Wave
- Recover
- Reflect


=== [gen1ou] GGFan 2011 ===

Starmie
- Blizzard
- Psychic
- Thunder Wave
- Recover

Tauros
- Blizzard
- Body Slam
- Earthquake
- Hyper Beam

Clefable
- Blizzard
- Body Slam
- Thunder Wave
- Hyper Beam

Jolteon
- Thunderbolt
- Thunder Wave
- Pin Missile
- Double Kick

Nidoqueen
- Blizzard
- Body Slam
- Earthquake
- Thunderbolt

Snorlax
- Amnesia
- Reflect
- Body Slam
- Rest

=== [gen1ou] GGFan 2012 ===

Starmie
- Blizzard
- Psychic
- Thunder Wave
- Recover

Tauros
- Blizzard
- Body Slam
- Earthquake
- Hyper Beam

Snorlax
- Body Slam
- Earthquake
- Hyper Beam
- Selfdestruct

Exeggutor
- Explosion
- Psychic
- Sleep Powder
- Stun Spore

Chansey
- Ice Beam
- Thunder Wave
- Counter
- Softboiled

Clefable
- Blizzard
- Body Slam
- Thunder Wave
- Hyper Beam


=== [gen1ou] GGFan 2013 ===

Starmie
- Blizzard
- Psychic
- Thunder Wave
- Recover

Snorlax
- Body Slam
- Hyper Beam
- Earthquake
- Selfdestruct

Tauros
- Blizzard
- Body Slam
- Hyper Beam
- Earthquake

Exeggutor
- Psychic
- Sleep Powder
- Explosion
- Hyper Beam

Chansey
- Ice Beam
- Thunder Wave
- Softboiled
- Light Screen

Alakazam
- Psychic
- Thunder Wave
- Reflect
- Recover


=== [gen1ou] RBY ===

Alakazam
- Psychic
- Recover
- Thunder Wave
- Seismic Toss

Jolteon
- Thunder Wave
- Thunderbolt
- Pin Missile
- Double Kick

Lapras
- Sing
- Ice Beam
- Thunderbolt
- Confuse Ray

Exeggutor
- Sleep Powder
- Double-Edge
- Psychic
- Explosion

Persian
- Slash
- Bubble Beam
- Hyper Beam
- Thunderbolt

Tauros
- Body Slam
- Earthquake
- Blizzard
- Hyper Beam


=== [gen1ou] Double Elec with Tauros > Zap ===

Starmie
- Psychic
- Ice Beam
- Thunder Wave
- Recover

Exeggutor
- Sleep Powder
- Psychic
- Explosion
- Mega Drain

Jolteon
- Thunder Wave
- Thunderbolt
- Double Kick
- Pin Missile

Tauros
- Body Slam
- Earthquake
- Hyper Beam
- Blizzard

Snorlax
- Body Slam
- Earthquake
- Hyper Beam
- Self-Destruct

Alakazam
- Psychic
- Recover
- Seismic Toss
- Thunder Wave


=== [gen1ou] MASTERZAP ===

Alakazam
- Psychic
- Recover
- Seismic Toss
- Thunder Wave

Snorlax
- Body Slam
- Counter
- Surf
- Self-Destruct

Exeggutor
- Sleep Powder
- Psychic
- Explosion
- Stun Spore

Zapdos
- Thunderbolt
- Drill Peck
- Thunder Wave
- Rest

Chansey
- Thunderbolt
- Soft-Boiled
- Ice Beam
- Thunder Wave

Tauros
- Blizzard
- Body Slam
- Earthquake
- Hyper Beam


=== [gen1ou] AmnesiaSNORLAX ===

Starmie
- Blizzard
- Thunder Wave
- Psychic
- Recover

Tauros
- Body Slam
- Blizzard
- Earthquake
- Hyper Beam

Exeggutor
- Explosion
- Psychic
- Sleep Powder
- Stun Spore

Snorlax
- Amnesia
- Ice Beam
- Reflect
- Rest

Lapras
- Rest
- Blizzard
- Body Slam
- Thunderbolt

Alakazam
- Recover
- Psychic
- Thunder Wave
- Seismic Toss


=== [gen1ou] BETSY STAR ===

Starmie
- Recover
- Psychic
- Ice Beam
- Thunderbolt

Chansey
- Reflect
- Ice Beam
- Soft-Boiled
- Thunderbolt

Alakazam
- Thunder Wave
- Psychic
- Recover
- Seismic Toss

Snorlax
- Body Slam
- Earthquake
- Self-Destruct
- Counter

Slowbro
- Counter
- Amnesia
- Surf
- Rest

Tauros
- Blizzard
- Body Slam
- Earthquake
- Hyper Beam


=== [gen1ou] JYNX, MAN ===

Jynx
- Lovely Kiss
- Psychic
- Blizzard
- Mimic

Exeggutor
- Psychic
- Sleep Powder
- Explosion
- Stun Spore

Snorlax
- Body Slam
- Blizzard
- Amnesia
- Self-Destruct

Tauros
- Body Slam
- Earthquake
- Blizzard
- Hyper Beam

Lapras
- Body Slam
- Blizzard
- Thunderbolt
- Confuse Ray

Alakazam
- Psychic
- Thunder Wave
- Recover
- Seismic Toss


=== [gen1ou] WrapitUp ===

Starmie
- Thunder Wave
- Psychic
- Recover
- Ice Beam

Exeggutor
- Stun Spore
- Psychic
- Sleep Powder
- Explosion

Snorlax
- Body Slam
- Earthquake
- Self-Destruct
- Counter

Alakazam
- Psychic
- Recover
- Seismic Toss
- Thunder Wave

Dragonite
- Wrap
- Surf
- Agility
- Hyper Beam

Tauros
- Body Slam
- Earthquake
- Blizzard
- Hyper Beam


=== [gen1ou] Lord Gengar ===

Jynx
- Lovely Kiss
- Psychic
- Blizzard
- Mimic

Gengar
- Hypnosis
- Psychic
- Explosion
- Night Shade

Snorlax
- Body Slam
- Counter
- Earthquake
- Self-Destruct

Persian
- Bubble Beam
- Hyper Beam
- Slash
- Screech

Tauros
- Earthquake
- Body Slam
- Blizzard
- Hyper Beam

Alakazam
- Psychic
- Recover
- Seismic Toss
- Thunder Wave


=== [gen1ou] Double Electric ===

Starmie
- Psychic
- Ice Beam
- Thunder Wave
- Recover

Exeggutor
- Sleep Powder
- Psychic
- Explosion
- Mega Drain

Jolteon
- Thunder Wave
- Thunderbolt
- Double Kick
- Pin Missile

Zapdos
- Thunderbolt
- Drill Peck
- Thunder Wave
- Rest

Snorlax
- Body Slam
- Earthquake
- Surf
- Self-Destruct

Alakazam
- Psychic
- Recover
- Seismic Toss
- Thunder Wave


=== [gen1ou] NEW_META ===

Starmie
- Ice Beam
- Thunder Wave
- Psychic
- Recover

Slowbro
- Amnesia
- Surf
- Rest
- Thunder Wave

Zapdos
- Thunder Wave
- Thunderbolt
- Drill Peck
- Rest

Exeggutor
- Sleep Powder
- Mega Drain
- Psychic
- Explosion

Chansey
- Reflect
- Soft-Boiled
- Seismic Toss
- Counter

Tauros
- Body Slam
- Earthquake
- Blizzard
- Hyper Beam


=== [gen1ou] Donk_Crystal ===

Jynx
- Blizzard
- Lovely Kiss
- Psychic
- Counter

Alakazam
- Psychic
- Recover
- Thunder Wave
- Seismic Toss

Snorlax
- Body Slam
- Earthquake
- Counter
- Self-Destruct

Articuno
- Blizzard
- Ice Beam
- Rest
- Hyper Beam

Nidoking
- Earthquake
- Counter
- Blizzard
- Body Slam

Exeggutor
- Psychic
- Stun Spore
- Sleep Powder
- Explosion

=== [gen1ou] CounterLax + Golem ===

Starmie
- Psychic
- Recover
- Thunder Wave
- Blizzard

Snorlax
- Counter
- Body Slam
- Earthquake
- Self-Destruct

Chansey
- Thunderbolt
- Thunder Wave
- Soft-Boiled
- Ice Beam

Exeggutor
- Sleep Powder
- Stun Spore
- Psychic
- Explosion

Tauros
- Body Slam
- Earthquake
- Hyper Beam
- Blizzard

Golem
- Earthquake
- Explosion
- Body Slam
- Rock Slide


=== [gen1ou] Slowbro + Rhydon ===

Gengar
- Hypnosis
- Night Shade
- Thunderbolt
- Explosion

Rhydon
- Earthquake
- Rock Slide
- Body Slam
- Substitute

Slowbro
- Amnesia
- Rest
- Thunder Wave
- Psychic

Snorlax
- Body Slam
- Earthquake
- Hyper Beam
- Self-Destruct

Tauros
- Body Slam
- Blizzard
- Earthquake
- Hyper Beam

Chansey
- Soft-Boiled
- Thunder Wave
- Sing
- Seismic Toss


=== [gen1ou] Slowbro + Rhydon w/ Jynx ===

Jynx
- Psychic
- Lovely Kiss
- Counter
- Blizzard

Golem
- Body Slam
- Earthquake
- Explosion
- Rock Slide

Slowbro
- Amnesia
- Rest
- Thunder Wave
- Psychic

Tauros
- Body Slam
- Blizzard
- Earthquake
- Hyper Beam

Snorlax
- Body Slam
- Earthquake
- Counter
- Self-Destruct

Alakazam
- Psychic
- Reflect
- Thunder Wave
- Recover

=== [gen1ou] Hyper Offense ===

Jolteon
- Pin Missile
- Thunderbolt
- Thunder Wave
- Double Kick

Snorlax
- Body Slam
- Earthquake
- Reflect
- Rest

Starmie
- Thunderbolt
- Psychic
- Recover
- Thunder Wave

Alakazam
- Psychic
- Seismic Toss
- Thunder Wave
- Recover

Tauros
- Body Slam
- Blizzard
- Earthquake
- Hyper Beam

Chansey
- Soft-Boiled
- Sing
- Thunder Wave
- Seismic Toss

=== [gen1ou] The Standard? ===

Jynx
- Psychic
- Lovely Kiss
- Rest
- Blizzard

Zapdos
- Thunderbolt
- Light Screen
- Drill Peck
- Thunder Wave

Tauros
- Body Slam
- Blizzard
- Earthquake
- Hyper Beam

Snorlax
- Body Slam
- Earthquake
- Hyper Beam
- Self-Destruct

Exeggutor
- Psychic
- Sleep Powder
- Explosion
- Stun Spore

Chansey
- Ice Beam
- Soft-Boiled
- Thunder Wave
- Thunderbolt


=== [gen1ou] Ladder Team ===

Jolteon
- Thunderbolt
- Pin Missile
- Thunder Wave
- Double Kick

Tauros
- Body Slam
- Blizzard
- Earthquake
- Hyper Beam

Chansey
- Ice Beam
- Counter
- Thunder Wave
- Soft-Boiled

Exeggutor
- Psychic
- Sleep Powder
- Hyper Beam
- Explosion

Snorlax
- Body Slam
- Counter
- Earthquake
- Self-Destruct

Starmie
- Recover
- Psychic
- Blizzard
- Thunder Wave


=== [gen1ou] Kingler ===

Gengar
- Hypnosis
- Night Shade
- Thunderbolt
- Explosion

Exeggutor
- Sleep Powder
- Stun Spore
- Psychic
- Explosion

Zapdos
- Drill Peck
- Thunderbolt
- Thunder Wave
- Light Screen

Chansey
- Ice Beam
- Soft-Boiled
- Thunder Wave
- Thunderbolt

Tauros
- Body Slam
- Blizzard
- Earthquake
- Hyper Beam

Kingler
- Crabhammer
- Body Slam
- Hyper Beam
- Swords Dance


=== [gen1ou] Old Standard  ===

Alakazam
- Psychic
- Thunder Wave
- Seismic Toss
- Recover

Snorlax
- Body Slam
- Earthquake
- Self-Destruct
- Hyper Beam

Chansey
- Ice Beam
- Soft-Boiled
- Thunder Wave
- Thunderbolt

Exeggutor
- Sleep Powder
- Psychic
- Stun Spore
- Explosion

Tauros
- Body Slam
- Hyper Beam
- Blizzard
- Earthquake

Golem
- Earthquake
- Rock Slide
- Body Slam
- Explosion


=== [gen1ou] Oddball Wrap ===

Starmie
- Blizzard
- Psychic
- Thunder Wave
- Recover

Jolteon
- Double Kick
- Pin Missile
- Thunderbolt
- Thunder Wave

Golem
- Body Slam
- Earthquake
- Rock Slide
- Explosion

Alakazam
- Psychic
- Thunder Wave
- Reflect
- Recover

Cloyster
- Clamp
- Blizzard
- Hyper Beam
- Explosion

Victreebel
- Razor Leaf
- Stun Spore
- Sleep Powder
- Wrap


=== [gen1ou] Double Electric ===

Alakazam
- Psychic
- Seismic Toss
- Thunder Wave
- Recover

Exeggutor
- Sleep Powder
- Psychic
- Stun Spore
- Explosion

Snorlax
- Body Slam
- Earthquake
- Hyper Beam
- Self-Destruct

Jolteon
- Double Kick
- Pin Missile
- Thunderbolt
- Thunder Wave

Tauros
- Blizzard
- Body Slam
- Earthquake
- Hyper Beam

Zapdos
- Drill Peck
- Thunder Wave
- Thunderbolt
- Thunder
`;
