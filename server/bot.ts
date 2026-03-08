import {io, type Socket} from "socket.io-client";
import random from "random";

import type {Choice, ClientMessage, JoinRoomResponse, ServerMessage} from "./gameServer";

import type {BattleEvent} from "~~/game/events";
import type {Options} from "~~/game/battle";
import type {Pokemon} from "~~/game/pokemon";
import {getEffectiveness, playerId, VF} from "~~/game/utils";
import type {MoveId} from "~~/game/moves";
import {type Generation, GENERATIONS} from "~~/game/gen";

import {type FormatId, formatInfo} from "~/utils/shared";
import {convertTeam, parseTeams, type Team} from "~/utils/pokemon";
import {ClientManager, Players} from "~/utils/client";

import {randoms} from "./utils/formats";
import type {InfoMessage} from "./utils/info";

export type BotParams = {
  options: Options[];
  players: Players;
  me: string;
  opponent: string;
  gen: Generation;
  mgr: ClientManager;
  debugMode: bool;
  sendChatMessage: (msg: string) => void;
};

export type BotFunction = (params: BotParams) => Choice[];

type S = Socket<ServerMessage, ClientMessage>;

const usedNames: string[] = [];

export const activeBots: string[] = [];

type Game = {
  nextTurn(turn: BattleEvent[], opts?: Options[]): void;
  chat(message: InfoMessage): void;
};

export async function startBot(botType: BotType, format?: FormatId) {
  const result = await login();
  if (!result) {
    console.log("Failed 3 times, not starting bot!");
    return;
  }

  const {cookie, myId, name} = result;

  const url = import.meta.dev
    ? "http://localhost:3000"
    : process.env.SELF_URL || `https://localhost:${process.env.PORT}`;
  const $conn: S = io(url, {extraHeaders: {cookie}, secure: !import.meta.dev});
  const games: Record<string, Game> = {};
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
        playGame(roomId, resp, () => {
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
        games[roomId].nextTurn(turn, opts);
      }
    });

    $conn.on("info", (roomId, message) => {
      if (games[roomId]) {
        games[roomId].chat(message);
      }
    });

    $conn.on("maintenanceState", enabled => {
      if (!enabled) {
        findMatch();
      }
    });

    $conn.on("challengeReceived", ({format, from}) => {
      $conn.emit("respondToChallenge", from.id, true, createBotTeam(format), (err, problems) => {
        if (err) {
          console.error(`matchmaking error '${err}':`, problems);
        }
      });
    });

    findMatch();
  });

  function generateName() {
    const regex = botType === "rank" ? /[a-mA-M]/ : /[n-zN-Z]/;
    return random.choice(
      namedTrainers
        .split("\n")
        .map(n => n.trim())
        .filter(n => n && !usedNames.includes(n) && (n as string)[0].match(regex)),
    )!;
  }

  async function login() {
    let attempts = 4;
    while (attempts--) {
      const name = attempts > 1 ? generateName() : "BOT " + (usedNames.length + 1);

      await $fetch("/api/_auth/session", {method: "DELETE"}).catch(() => {});
      let resp;
      try {
        resp = await $fetch.raw("/api/register", {
          method: "POST",
          body: {username: name, password: process.env.BOT_PASSWORD},
        });
      } catch {
        try {
          resp = await $fetch.raw("/api/login", {
            method: "POST",
            body: {username: name, password: process.env.BOT_PASSWORD},
          });
        } catch {
          console.log(`[${name}] Login failed!...`);
          continue;
        }
      }

      const cookie = resp.headers.getSetCookie().at(-1)!.split(";")[0];
      const {user} = await $fetch("/api/_auth/session", {method: "GET", headers: {cookie}});
      if (user) {
        usedNames.push(name);
        return {cookie, myId: user.id, name};
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
    {team: teamDesc, options, chats, events, battlers, format}: JoinRoomResponse,
    gameOver: () => void,
  ) {
    const players = new Players();
    const fmt = formatInfo[format];
    const gen = GENERATIONS[fmt.generation]!;
    const mgr = new ClientManager({
      playCry() {},
      playShiny() {},
      playDmg() {},
      preloadSprite() {},
      playAnimation: (_, params) => params.cb?.(),
      displayEvent() {},
    });
    let eventNo = 0;
    let opponent = "";
    let debugMode = false;
    let aiMode = botType;

    const sendChatMessage = (msg: string) => {
      return $conn.emit("chat", room, msg, () => {});
    };

    const makeDecision = (options: Options[], tries = 3) => {
      if (tries === 0) {
        console.error(`[${name}] Couldn't make a valid move after 3 tries, abandoning ${room}.`);
        sendChatMessage("I couldn't figure out a move and must forfeit!");
        $conn.emit("choose", room, eventNo, {type: "forfeit"}, () => {});

        gameOver();
        return;
      }

      const choices = botFunctions[aiMode]({
        options,
        players,
        me: myId,
        opponent,
        gen,
        mgr,
        debugMode,
        sendChatMessage,
      });
      for (const choice of choices) {
        $conn.emit("choose", room, eventNo, choice, err => {
          if (err) {
            if (choice.type === "switch") {
              const poke = {...players.get(myId).team[choice.pokeIndex], gen: undefined};
              console.error(`[${name}] bad switch '${err}' (to: ${choice.pokeIndex}|`, poke, ")");
            } else if (choice.type === "move") {
              console.error(
                `[${name}] bad move: ${err} (was: ${choice.moveIndex}|`,
                options[choice.who]?.moves?.[choice.moveIndex],
                ")",
              );
            }
            makeDecision(options, tries - 1);
          }
        });
      }
    };

    const processMessage = (message: InfoMessage) => {
      if (message.type === "userJoin") {
        const {name, isSpectator, nPokemon, id, admin} = message;
        if (players.get(id)) {
          return;
        }

        players.add(id, {
          name,
          isSpectator,
          connected: true,
          nPokemon,
          nFainted: players.get(id)?.nFainted ?? 0,
          active: [],
          team: [],
          teamDesc: [],
          admin,
        });
      } else if (message.type === "userLeave") {
        players.get(message.id).connected = false;
      }
    };

    for (const {id, name, nPokemon, admin} of battlers) {
      players.add(id, {
        name,
        isSpectator: false,
        connected: false,
        nPokemon,
        nFainted: 0,
        active: Array(fmt.doubles ? 2 : 1),
        team: [],
        teamDesc: id === myId ? teamDesc! : [],
        admin,
      });
      if (id !== myId) {
        opponent = id;
      }
    }

    mgr.reset(players, gen);
    games[room] = {
      async nextTurn(turn, options) {
        let done = false;
        for (const event of turn) {
          eventNo++;
          await mgr.handleEvent(event, players, gen);
          if (event.type === "end") {
            done = true;
          }
        }

        if (done && games[room]) {
          gameOver();
          return;
        }

        if (options && options.length) {
          makeDecision(options);
        }
      },
      chat(message) {
        const dox = (a: Pokemon) => {
          const name = (m: MoveId) => {
            const move = gen.moveList[m];
            const typ = "getType" in move && move.getType!(a, mgr.weather);
            if (typ) {
              return m + typ;
            }
            return m;
          };

          sendChatMessage(`${a.species.name} @ ${a.itemId}`);
          if (a.ability) {
            sendChatMessage(`Ability: ${a.ability}`);
          }
          sendChatMessage(`- ${a.moves.map(name).join(", ")}`);
        };

        if (message.id === myId || message.type !== "chat" || !players.get(message.id)?.admin) {
          return;
        }

        const msg = message.message.toLowerCase();
        if (msg.startsWith("/dox")) {
          if (msg.includes("team")) {
            players.get(myId).team.forEach(dox);
          } else {
            for (const poke of players.get(myId).active) {
              if (poke?.base) {
                dox(poke.base);
              }
            }
          }
        } else if (msg.startsWith("/debug")) {
          debugMode = !debugMode;
          sendChatMessage("Debug mode " + (debugMode ? "enabled" : "disabled"));
        } else if (msg.startsWith("/ai")) {
          const other = msg.split(" ")[1]?.trim();
          if (!other) {
            sendChatMessage(`Current AI Mode: ${aiMode}`);
          } else if (other in botFunctions) {
            aiMode = other as BotType;
            sendChatMessage(`AI mode set to ${other}`);
          } else {
            sendChatMessage(`Invalid AI mode (options are ${Object.keys(botFunctions)})`);
          }
        }
      },
    };

    for (const k in chats) {
      for (const msg of chats[k]) {
        processMessage(msg);
      }
    }

    games[room].nextTurn(events, options);
  }
}

const teams: Team[] = [];
export function createBotTeam(format: FormatId) {
  if (!teams.length) {
    teams.push(...parseTeams(gen1ou));
    teams.push(...parseTeams(gen2ou));
    teams.push(...parseTeams(gen3ou));
  }

  if (formatInfo[format].needsTeam) {
    const team = random.choice(
      teams.filter(team => formatInfo[team.format].generation === formatInfo[format].generation),
    );
    if (team) {
      return convertTeam(team);
    } else {
      const gen = GENERATIONS[formatInfo[format].generation]!;
      return randoms(
        gen,
        formatInfo[format].maxLevel,
        s => format.includes("nfe") === !!s.evolvesTo,
      );
    }
  }
}

export type BotType = keyof typeof botFunctions;

const botFunctions = {
  random({options, me}: BotParams) {
    const switchedTo: number[] = [];
    const choices: Choice[] = [];
    for (const opt of options) {
      const who = +opt.id.split(":")[1];
      const validMoves = opt.moves.filter(move => move.valid);
      const switchRandomly = random.int(0, 11 * options.length) === 1;
      if (!validMoves.length || (opt.switches.length && switchRandomly)) {
        const pokeIndex = random.choice(opt.switches.filter(i => !switchedTo.includes(i)))!;
        choices.push({type: "switch", who, pokeIndex});
        switchedTo.push(pokeIndex);
      } else {
        const move = random.choice(validMoves)!;
        let targets = move.targets.filter(t => playerId(t) !== me);
        if (!targets.length) {
          targets = move.targets;
        }

        choices.push({
          type: "move",
          who,
          moveIndex: opt.moves.indexOf(move),
          target: random.choice(targets),
        });
      }
    }
    return choices;
  },
  rank(params: BotParams): Choice[] {
    const {options, players, opponent, me, gen, mgr} = params;
    if (params.players.get(me).active.length !== 1) {
      return this.random(params);
    }

    const selfP = players.get(me);
    const active = selfP.active![0]!;
    const opponentActive = players.get(opponent).active![0]!;
    const opts = options[0];

    const rank = <T>(arr: T[], getScore: (t: T) => number, name: (t: T) => string) => {
      const res = arr
        .map((item, i) => ({score: getScore(item), i}))
        .sort((a, b) => b.score - a.score);
      if (params.debugMode) {
        params.sendChatMessage(res.map(p => `${name(arr[p.i])}:${p.score}`).join(", "));
      }

      const result = res.filter((item, _, arr) => item.score >= 0 && item.score === arr[0].score);
      return result.length ? random.choice(result)! : {score: -1, i: -1};
    };

    const rankMove = ({move: id, valid}: {move: MoveId; valid: bool}) => {
      if (!valid) {
        return -1;
      }

      const opponentPoke = opponentActive.base;
      const move = gen.moveList[id];
      if ((move.power ?? 0) > 1) {
        const eff = getEffectiveness(
          gen.typeChart,
          ("getType" in move && move.getType?.(active.base, mgr.weather)) || move.type,
          opponentActive.v.types ?? opponentPoke.species.types,
        );
        let score = 10;
        if (eff > 1) {
          score = 15;
        } else if (eff < 1) {
          score = 5;
        } else if (eff === 0) {
          score = 0;
        }
        if (move.kind === "damage" && move.charge) {
          score = Math.max(score - 2, 0);
        }
        return score;
      } else if (move.kind === "recover") {
        if (active.base.hpPercent === 100) {
          return 0;
        } else if (active.base.hpPercent <= 25) {
          return 15;
        } else {
          return 5;
        }
      }

      const confused = (opponentActive.v.flags || 0) & VF.cConfused;
      const seeded = (opponentActive.v.flags || 0) & VF.cSeeded;
      const cursed = (opponentActive.v.flags || 0) & VF.curse;
      const dbond = (active.v.flags || 0) & VF.destinyBond;
      const sub = opponentActive.substitute;

      // prettier-ignore
      const useless = ((move.kind === "confuse" || move.kind === "swagger") && confused) ||
          (move.kind === "status" && (opponentActive.v.status || (gen.id > 1 && sub))) ||
          (id === "leechseed" && (seeded || opponentPoke.species.types.includes("grass"))) ||
          (id === "curse" && cursed) ||
          (id === "destinybond" && dbond) ||
          (id === "substitute" && active.substitute) ||
          (move.kind === "stage" && move.acc && sub);
      if (useless) {
        return 0;
      }

      return 10;
    };

    try {
      const {score, i: bestMove} = rank(opts.moves, rankMove, m => m.move);
      const target = opts.moves[bestMove]?.targets?.[0];
      if ((bestMove !== -1 && score > 5) || !opts.switches.length) {
        return [{type: "move", moveIndex: bestMove, who: 0, target}] as const;
      }

      const {i: bestSwitch} = rank(
        opts.switches,
        index => {
          const poke = selfP.team[index];
          if (poke.hp === 0) {
            return -1;
          } else if (!opponentActive || opponentActive.base.hp === 0) {
            return 10;
          } else if (poke.status === "frz" || poke.status === "slp") {
            return 0;
          }
          return Math.max(...poke.moves.map(move => rankMove({move, valid: true})));
        },
        index => selfP.team[index].name,
      );
      if (bestSwitch === -1) {
        return [{type: "move", moveIndex: bestMove, who: 0, target}] as const;
      }

      return [{type: "switch", who: 0, pokeIndex: opts.switches[bestSwitch]}] as const;
    } catch (ex) {
      console.error(
        "rankBot() Exception: Choices were: ",
        JSON.stringify(options, null, 2),
        "\n",
        ex,
      );
      return this.random(params);
    }
  },
};

/// From: https://gist.github.com/scheibo/7c9172f3379bbf795a5e61a802caf2f0
const gen1ou = `
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

// Generated with https://www.pokeaimmd.com/randomizer
const gen2ou = `
=== [g2_standard] New Team ===

Typhlosion @ Leftovers
IVs: 28 atk / 28 def
 - Fire Blast
 - DynamicPunch
 - Hidden Power
 - Earthquake

Zapdos @ Leftovers
IVs: 30 atk / 26 def
 - Thunder
 - Hidden Power
 - Rest
 - Sleep Talk

Entei @ Leftovers
IVs: 24 atk / 24 def
 - Sunny Day
 - Fire Blast
 - SolarBeam
 - Hidden Power

Machamp @ Leftovers
 - Cross Chop
 - Rock Slide
 - Earthquake
 - Fire Blast

Clefable @ Leftovers
 - Belly Drum
 - Moonlight
 - Return
 - Fire Blast

Heracross @ Leftovers
 - Rest
 - Sleep Talk
 - Megahorn
 - Curse

=== [g2_standard] New Team ===

Golem @ Leftovers
 - Earthquake
 - Rapid Spin
 - Explosion
 - Roar

Suicune @ Leftovers
 - Surf
 - Toxic
 - Roar
 - Rest

Kangaskhan @ Leftovers
 - Curse
 - Rest
 - Return
 - Roar

Houndoom @ Leftovers
 - Crunch
 - Fire Blast
 - Pursuit
 - Counter

Lapras @ Leftovers
 - Ice Beam
 - Thunderbolt
 - Rest
 - Sleep Talk

Vaporeon @ Leftovers
 - Surf
 - Growth
 - Rest
 - Sleep Talk

=== [g2_standard] New Team ===

Forretress @ Leftovers
IVs: 28 atk / 24 def
 - Spikes
 - Rapid Spin
 - Toxic
 - Hidden Power

Clefable @ Leftovers
 - Belly Drum
 - Moonlight
 - Return
 - Fire Blast

Scizor @ Leftovers
IVs: 26 atk / 26 def
 - Swords Dance
 - Baton Pass
 - Agility
 - Hidden Power

Tentacruel @ Leftovers
 - Swords Dance
 - Substitute
 - Sludge Bomb
 - Hydro Pump

Kingdra @ Leftovers
 - Rest
 - Sleep Talk
 - Double Edge
 - Surf

Nidoking @ Leftovers
 - Earthquake
 - Lovely Kiss
 - Ice Beam
 - Thunder

=== [g2_standard] New Team ===

Clefable @ Leftovers
 - Return
 - Fire Blast
 - Ice Beam
 - Moonlight

Charizard @ Leftovers
 - Belly Drum
 - Earthquake
 - Rock Slide
 - Fire Blast

Umbreon @ Leftovers
 - Charm
 - Pursuit
 - Toxic
 - Rest

Marowak @ Thick Club
IVs: 26 atk / 26 def
 - Earthquake
 - Rock Slide
 - Hidden Power
 - Swords Dance

Venusaur @ Leftovers
 - Swords Dance
 - Body Slam
 - Giga Drain
 - Sleep Powder

Tauros @ Leftovers
 - Double Edge
 - Earthquake
 - Rest
 - Sleep Talk

=== [g2_standard] New Team ===

Miltank @ Leftovers
 - Heal Bell
 - Milk Drink
 - Growl
 - Body Slam

Muk @ Leftovers
 - Sludge Bomb
 - Fire Blast
 - Explosion
 - Curse

Cloyster @ Leftovers
 - Spikes
 - Surf
 - Toxic
 - Explosion

Dragonite @ Leftovers
 - Haze
 - Reflect
 - Rest
 - Sleep Talk

Heracross @ Leftovers
 - Rest
 - Sleep Talk
 - Megahorn
 - Curse

Rhydon @ Leftovers
 - Earthquake
 - Rock Slide
 - Curse
 - Roar

=== [g2_standard] New Team ===

Heracross @ Leftovers
 - Rest
 - Sleep Talk
 - Megahorn
 - Curse

Umbreon @ Leftovers
 - Charm
 - Pursuit
 - Toxic
 - Rest

Entei @ Leftovers
IVs: 24 atk / 24 def
 - Sunny Day
 - Fire Blast
 - SolarBeam
 - Hidden Power

Raikou @ Leftovers
IVs: 30 atk / 26 def
 - Thunderbolt
 - Hidden Power
 - Rest
 - Sleep Talk

Snorlax @ Leftovers
 - Double Edge
 - Flamethrower
 - Toxic
 - Rest

Alakazam @ Leftovers
 - Recover
 - Thunder Wave
 - Fire Punch
 - Psychic

=== [g2_standard] New Team ===

Scizor @ Leftovers
IVs: 26 atk / 26 def
 - Swords Dance
 - Baton Pass
 - Agility
 - Hidden Power

Articuno @ Leftovers
 - Rest
 - Sleep Talk
 - Ice Beam
 - Toxic

Porygon2 @ Leftovers
 - Curse
 - Double Edge
 - Recover
 - Ice Beam

Exeggutor @ Leftovers
 - Sleep Powder
 - Psychic
 - Giga Drain
 - Explosion

Tyranitar @ Leftovers
 - DynamicPunch
 - Rock Slide
 - Fire Blast
 - Pursuit

Machamp @ Leftovers
 - Cross Chop
 - Rock Slide
 - Earthquake
 - Fire Blast

=== [g2_standard] New Team ===

Vaporeon @ Leftovers
 - Surf
 - Growth
 - Rest
 - Sleep Talk

Blissey @ Leftovers
 - Softboiled
 - Heal Bell
 - Light Screen
 - Sing

Espeon @ Leftovers
 - Psychic
 - Growth
 - Baton Pass
 - Substitute

Cloyster @ Leftovers
 - Spikes
 - Surf
 - Toxic
 - Explosion

Porygon2 @ Leftovers
 - Thunder Wave
 - Double Edge
 - Ice Beam
 - Recover

Ursaring @ Leftovers
 - Curse
 - Return
 - Earthquake
 - Roar
`;

const gen3ou = `
=== [g3_doubles] New Team ===

Metagross @ Choice Band
Ability: Clear Body
EVs: 128 hp / 252 atk / 128 spe
Adamant Nature
 - Meteor Mash
 - Explosion
 - Earthquake
 - Rock Slide

Houndoom @ Leftovers
Ability: Early Bird
EVs: 56 hp / 252 spa / 12 spd / 188 spe
Timid Nature
 - Pursuit
 - Fire Blast
 - Crunch
 - Will-O-Wisp

Regice @ Leftovers
Ability: Clear Body
EVs: 252 hp / 104 atk / 152 spa
Quiet Nature
 - Ice Beam
 - Thunderbolt
 - Explosion
 - Thunder Wave

Exeggutor @ Leftovers
Ability: Chlorophyll
EVs: 96 hp / 252 spa / 96 spd / 60 spe
Modest Nature
 - Psychic
 - Sleep Powder
 - Leech Seed
 - Explosion

Weezing @ Leftovers
Ability: Levitate
EVs: 252 hp / 252 def / 4 spe
Impish Nature
 - Sludge Bomb
 - Haze
 - Will-O-Wisp
 - Pain Split

Espeon @ Leftovers
Ability: Synchronize
EVs: 200 hp / 236 spd / 72 spe
Timid Nature
 - Psychic
 - Calm Mind
 - Substitute
 - Baton Pass

=== [g3_doubles] New Team ===

Gengar @ Leftovers
Ability: Levitate
EVs: 4 hp / 252 spa / 252 spe
Timid Nature
 - Thunderbolt
 - Ice Punch
 - Giga Drain
 - Fire Punch

Smeargle @ Salac Berry
Ability: Own Tempo
EVs: 96 hp / 120 def / 40 spd / 252 spe
Jolly Nature
 - Spore
 - Belly Drum
 - Substitute
 - Baton Pass

Hariyama @ Leftovers
Ability: Guts
EVs: 96 atk / 192 def / 192 spd / 28 spe
IVs: 30 def / 30 spd
Adamant Nature
 - Focus Punch
 - Counter
 - Rock Slide
 - Hidden Power [Ghost]

Medicham @ Leftovers
Ability: Pure Power
EVs: 4 hp / 252 atk / 252 spe
Jolly Nature
 - Brick Break
 - Focus Punch
 - Substitute
 - Shadow Ball

Slaking @ Choice Band
Ability: Truant
EVs: 4 hp / 252 atk / 252 spe
Adamant Nature
 - Return
 - Earthquake
 - Shadow Ball
 - Focus Punch

Celebi @ Leftovers
Ability: Natural Cure
EVs: 252 hp / 220 def / 36 spe
Bold Nature
 - Psychic
 - Leech Seed
 - Heal Bell
 - Recover

=== [g3_doubles] New Team ===

Celebi @ Leftovers
Ability: Natural Cure
EVs: 252 hp / 80 def / 176 spe
Timid Nature
 - Calm Mind
 - Baton Pass
 - Psychic
 - Recover

Dodrio @ Choice Band
Ability: Early Bird
EVs: 4 hp / 252 atk / 252 spe
IVs: 30 spa / 30 spd
Adamant Nature
 - Drill Peck
 - Return
 - Quick Attack
 - Hidden Power [Ground]

Crobat @ Leftovers
Ability: Inner Focus
EVs: 252 hp / 4 def / 252 spe
Jolly Nature
 - Sleep Talk
 - Whirlwind

Aerodactyl @ Choice Band
Ability: Rock Head
EVs: 4 hp / 252 atk / 252 spe
IVs: 30 hp / 30 atk / 30 def / 30 spa / 30 spd
Jolly Nature
 - Rock Slide
 - Double Edge
 - Earthquake
 - Hidden Power [Flying]

Tyranitar @ Leftovers
Ability: Sand Stream
EVs: 252 hp / 240 atk / 16 spe
IVs: 30 atk / 30 def / 30 spd
Adamant Nature
 - Substitute
 - Focus Punch
 - Rock Slide
 - Hidden Power [Bug]

Scizor @ Leftovers
Ability: Swarm
EVs: 108 hp / 252 atk / 148 spe
IVs: 30 def / 30 spd / 30 spe
Adamant Nature
 - Swords Dance
 - Silver Wind
 - Hidden Power [Rock]
 - Agility
`;

const namedTrainers = `
Alder
Benga
Bianca
Blaine
Blue
Brawly
Brock
Brycen-Man
Brycen
Bugsy
Burgh
Byron
Caitlin
Candice
Cheren
Chili
Chuck
Cilan
Clair
Clay
Colress
Crasher_Wake
Cress
Cynthia
Drayden
Elesa
Emmet
Erika
Falkner
Fantina
Flannery
Gardenia
Ghetsis
Giovanni
Grimsley
Hilbert
Hilbert_2
Hilda
Hilda_2
Hugh
Ingo
Iris
Janine
Jasmine
Juan
Lenora
Liza
Lt_Surge
Marlon
Marshal
Maylene
Misty
Morty
N
Nate
Nate_2
Norman
Pryce
Red
Roark
Rood
Rosa
Rosa_2
Roxanne
Roxie
Sabrina
Shauntal
Skyla
Steven
Tate
Volkner
Wallace
Wattson
Whitney
Winona
Zinzolin
`;

const _trainerClasses = `
Ace_Trainer_F
Ace_Trainer_M
Artist
Backers_F
Backers_M
Backpacker_F
Backpacker_M
Baker
Battle_Girl
Beauty
Biker
Black_Belt
Clerk_F
Clerk_M
Clerk_M_B
Cyclist_F
Cyclist_M
Dancer
Depot_Agent
Doctor
Fisherman
Gentleman
Guitarist
Harlequin
Hiker
Hooligans
Hoopster
Infielder
Janitor
Lady
Lance
Lass
Linebacker
Maid
Mecha_Cop
Musician
Nurse
Nursery_Aide
Parasol_Lady
Pilot
Plasma_Grunt_F
Plasma_Grunt_M
Pokéfan_F
Pokéfan_M
Pokémon_Breeder_F
Pokémon_Breeder_M
Pokémon_Ranger_F
Pokémon_Ranger_M
Policeman
Preschooler_F
Preschooler_M
Psychic_F
Psychic_M
Rich_Boy
Roughneck
School_Kid_F
School_Kid_M
Scientist_F
Scientist_M
Shadow_Triad
Smasher
Socialite
Striker
Swimmer_F
Swimmer_M
Twins
Veteran_F
Veteran_M
Waiter
Waitress
Weird_Light
Worker
WorkerIce
Youngster
`;
