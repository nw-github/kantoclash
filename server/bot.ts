import { io, type Socket } from "socket.io-client";
import type { ClientMessage, JoinRoomResponse, ServerMessage } from "./gameServer";
import type { BattleEvent } from "../game/events";
import type { Options, Turn } from "../game/battle";
import { randoms } from "~/server/utils/formats";
import { formatInfo, type ClientPlayer } from "~/utils";
import type { Pokemon } from "~/game/pokemon";
import { clamp } from "../game/utils";
import random from "random";
import { convertDesc, parseTeams } from "~/utils/pokemon";
import type { FormatId } from "~/utils/data";

export type BotFunction = (
  team: Pokemon[],
  options: Options,
  players: Record<string, ClientPlayer>,
  me: string,
  activePokemon: number,
) => readonly [number, "switch" | "move"];

type S = Socket<ServerMessage, ClientMessage>;

let nBots = 0;

export async function startBot(format: FormatId = "randoms", botFunction: BotFunction = randomBot) {
  nBots++;

  const name = "BOT " + nBots;
  const ouTeams = parseTeams(teams);
  console.log(`[${name}] initializing bot...`);

  await $fetch("/api/_auth/session", { method: "DELETE" }).catch(() => {});
  let resp;
  try {
    resp = await $fetch.raw("/api/register", {
      method: "POST",
      body: { username: name, password: process.env.BOT_PASSWORD },
    });
  } catch {
    resp = await $fetch.raw("/api/login", {
      method: "POST",
      body: { username: name, password: process.env.BOT_PASSWORD },
    });
  }

  const cookie = resp.headers.getSetCookie().at(-1)!.split(";")[0];
  const { user } = await $fetch("/api/_auth/session", { method: "GET", headers: { cookie } });
  if (!user) {
    console.log(`[${name}] Login failed!...`);
    return;
  }

  const myId = user!.id;
  console.log(`[${name}] Logged in! My ID: ${myId}`);

  const $conn: S = io("ws://localhost:3000", { extraHeaders: { cookie } });
  const games: Record<string, (turn: Turn, opts?: Options) => void> = {};
  $conn.on("connect", () => {
    console.log(`[${name}] Connected!`);

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
      $conn.emit("respondToChallenge", from.id, true, getTeam(format), () => {});
    });

    findMatch();
  });

  function getTeam(format: FormatId) {
    let team = undefined;
    if (formatInfo[format].needsTeam) {
      if (format === "standard") {
        team = random.choice(ouTeams)!.pokemon.map(convertDesc);
      } else {
        team = randoms(s => (format === "nfe") === s.evolves).map(({ moves, speciesId, level }) => {
          return { dvs: {}, statexp: {}, level, species: speciesId, moves };
        });
      }
    }
    return team;
  }

  function findMatch() {
    console.log(`[${name}] queueing for a ${format}`);
    $conn.emit("enterMatchmaking", getTeam(format), format, undefined, (err, problems) => {
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
        players[e.src].active!.status = e.status;
        if (e.src === myId) {
          players[e.src].active!.stats = e.stats;
          team![activeIndex].status = e.status;
        }
      } else if (e.type === "stages") {
        players[myId].active!.stats = e.stats;
        const active = players[e.src].active!;
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

            if (player === e.src && active.status === "tox") {
              active.status = "psn";
            } else if (player !== e.src) {
              active.status = undefined;
            }

            active.stages = {};
          }

          players[myId].active!.stats = undefined;
        } else if (e.why === "wake" || e.why === "thaw") {
          players[e.src].active!.status = undefined;
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


=== [gen1ou] GGFan 2006 ===

Jynx
- Lovely Kiss
- Blizzard
- Psychic
- Body Slam

Gengar
- Confuse Ray
- Thunderbolt
- Mega Drain
- Explosion

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
