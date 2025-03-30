import {Random} from "random";
import type {
  BattleEvent,
  DamageReason,
  PlayerId,
  InfoReason,
  VictoryEvent,
  ChangedVolatiles,
  PokeId,
} from "./events";
import {type MoveId, type Move, Range} from "./moves";
import {Pokemon, type ValidatedPokemonDesc} from "./pokemon";
import {
  getEffectiveness,
  playerId,
  idiv,
  screens,
  VF,
  type Type,
  type Weather,
  type Screen,
} from "./utils";
import type {Generation} from "./gen";
import {healBerry, statusBerry} from "./item";
import {ActivePokemon, type ChosenMove, type VolatileStats} from "./active";

export {ActivePokemon, type VolatileStats};

export type MoveOption = {
  move: MoveId;
  valid: boolean;
  display: boolean;
  pp?: number;
  indexInMoves?: number;
  targets: PokeId[];
};

export type Options = NonNullable<ActivePokemon["options"]>;

export type PlayerParams = {readonly id: PlayerId; readonly team: ValidatedPokemonDesc[]};

export type NonEmptyArray<T> = [T, ...T[]];

export class Player {
  readonly id: PlayerId;
  readonly active: NonEmptyArray<ActivePokemon>;
  readonly team: Pokemon[];
  readonly teamDesc: ValidatedPokemonDesc[];
  readonly screens: Partial<Record<Screen, number>> = {};

  sleepClausePoke?: Pokemon;
  spikes = false;

  constructor(gen: Generation, {id, team}: PlayerParams, doubles: bool) {
    this.id = id;
    this.team = team.map(p => new Pokemon(gen, p));
    this.teamDesc = team;
    this.active = [new ActivePokemon(this.team[0], this, 0)];
    if (doubles && this.team.length > 1) {
      this.active.push(new ActivePokemon(this.team[1], this, 1));
    }
  }

  cancel() {
    this.active.forEach(p => p.options && (p.choice = undefined));
  }

  /**
   * @param who The Pokémon being chosen for
   * @param battle The battle
   * @param index The index into the Choice move array
   * @param target The player id and active index of the target, if applicable
   * @returns Is this choice valid
   */
  chooseMove(who: number, battle: Battle, index: number, target?: PokeId) {
    const user = this.active[who];
    const choice = this.active[who]?.options?.moves[index];
    if (!choice?.valid) {
      return false;
    }

    const move = battle.gen.moveList[choice.move];
    const targets: ActivePokemon[] = [];
    // prettier-ignore
    switch (move.range) {
    case Range.AllAdjacent:
    case Range.AllAdjacentFoe: {
      const opponent = battle.opponentOf(this);
      const myIndex = this.active.indexOf(user);
      for (let i = myIndex - 1; i <= myIndex + 1; i++) {
        if (opponent.active[i]) {
          targets.push(opponent.active[i]);
        }
        if (move.range === Range.AllAdjacent && i !== myIndex && this.active[i]) {
          targets.push(this.active[i]);
        }
      }
      break;
    }
    case Range.All:
      targets.push(...battle.allActive);
      break;
    case Range.AllAllies:
      targets.push(...this.active.filter(a => a !== user));
      break;
    case Range.Field:
      break;
    default: {
      if ((choice.targets.length && !target) || !choice.targets.includes(target)) {
        return false;
      }

      const [playerId, pokeIndex] = target.split(":");
      const player = battle.players.find(pl => pl.id === playerId);

      targets.push(player!.active[+pokeIndex]);
    } break;
    }

    user.choice = {indexInMoves: choice.indexInMoves, move, user, targets};
    return true;
  }

  chooseSwitch(who: number, battle: Battle, index: number) {
    const active = this.active[who];
    if (!active?.options?.canSwitch) {
      return false;
    }

    const base = this.team[index];
    if (battle.turnType !== TurnType.Lead) {
      const current = active.base;
      if (!base || base === current || !base.hp || this.active.some(a => a.base.real === base)) {
        return false;
      }
    }

    if (
      this.active.some(
        a => a !== active && a.choice?.move?.kind === "switch" && a.choice.move.poke.real === base,
      )
    ) {
      return false;
    }

    active.choice = {
      move: {
        kind: "switch",
        type: "normal",
        name: "",
        range: Range.Self,
        pp: 0,
        priority: +7,
        poke: base,
        batonPass: this.active[who].v.inBatonPass,
      },
      user: this.active[who],
      targets: [],
    };
    return true;
  }

  hasChosen() {
    return this.active.every(p => !p.options || p.choice);
  }

  updateOptions(battle: Battle) {
    this.active.forEach(active => active.updateOptions(battle));
  }

  areAllDead() {
    return this.team.every(poke => poke.hp === 0);
  }
}

export type Mods = {sleepClause?: boolean; freezeClause?: boolean; endlessBattle?: boolean};

export enum TurnType {
  Lead,
  Switch,
  Normal,
  BatonPass,
}

enum BetweenTurns {
  Begin,
  FutureSight,
  Weather,
  PartialTrapping,
  PerishSong,
}

type BattleParams = {
  gen: Generation;
  player1: PlayerParams;
  player2: PlayerParams;
  doubles?: bool;
  chooseLead?: bool;
  mods?: Mods;
  seed?: string;
};

type GetTarget = {allyOnly?: bool; oppOnly?: bool; adjacent?: bool; self?: boolean};

export class Battle {
  readonly players: [Player, Player];
  private readonly events: BattleEvent[] = [];
  private readonly moveListToId = new Map<Move, MoveId>();
  turnType = TurnType.Lead;

  private _victor?: Player;
  private _turn = 0;
  weather?: {kind: Weather; turns: number};
  finished = false;
  gen1LastDamage = 0;
  betweenTurns = BetweenTurns.Begin;
  allActive: ActivePokemon[];
  turnOrder: ChosenMove[] = [];

  private constructor(
    readonly gen: Generation,
    p1: PlayerParams,
    p2: PlayerParams,
    doubles: bool,
    readonly mods: Mods,
    readonly rng: Random,
  ) {
    this.players = [new Player(gen, p1, doubles), new Player(gen, p2, doubles)];
    for (const k in this.gen.moveList) {
      this.moveListToId.set(this.gen.moveList[k as MoveId], k as MoveId);
    }
    this.allActive = this.players.flatMap(pl => pl.active);
  }

  static start({gen, player1, player2, doubles, chooseLead, mods, seed}: BattleParams) {
    seed ??= crypto.randomUUID();
    console.log("new battle, seed: " + seed);

    const self = new Battle(gen, player1, player2, doubles ?? false, mods ?? {}, new Random(seed));
    self.players[0].updateOptions(self);
    self.players[1].updateOptions(self);
    if (chooseLead) {
      return [self, [] as BattleEvent[]] as const;
    }

    for (let i = 0; i < self.players[0].active.length; i++) {
      self.players[0].chooseSwitch(i, self, i);
      self.players[1].chooseSwitch(i, self, i);
    }
    return [self, self.nextTurn()!] as const;
  }

  get victor(): Player | undefined {
    return this._victor;
  }

  get turn() {
    return this._turn;
  }

  private set victor(value: Player) {
    this._victor = value;
    this.finished = true;
  }

  event<T extends BattleEvent = BattleEvent>(event: BattleEvent) {
    this.events.push(event);
    return event as T;
  }

  info(src: ActivePokemon, why: InfoReason, volatiles?: ChangedVolatiles) {
    return this.event({type: "info", src: src.id, why, volatiles});
  }

  opponentOf(player: Player): Player {
    return this.players[0] === player ? this.players[1] : this.players[0];
  }

  moveIdOf(move: Move) {
    return this.moveListToId.get(move);
  }

  findPlayer(id: string) {
    return this.players.find(pl => pl.id === id);
  }

  forfeit(player: Player, timer: boolean) {
    this.victor = this.opponentOf(player);
    this.event({type: "forfeit", user: player.id, timer});
    this.event({type: "end", victor: this.victor.id});
    for (const player of this.players) {
      player.updateOptions(this);
    }
    return this.events.splice(0);
  }

  draw(why: VictoryEvent["why"]) {
    this.finished = true;
    for (const player of this.players) {
      if (why === "timer") {
        this.event({type: "forfeit", user: player.id, timer: true});
      }
      player.updateOptions(this);
    }

    this.event({type: "end", why});
    return this.events.splice(0);
  }

  nextTurn() {
    if (!this.allActive.every(poke => !poke.options || poke.choice)) {
      return;
    }

    if (this.turnType === TurnType.Normal) {
      this._turn++;
      this.event({type: "next_turn", turn: this._turn});
    }

    const choices = this.allActive
      .flatMap(({choice}) => (choice ? [choice] : []))
      .sort((a, b) => {
        if (b.move.priority !== a.move.priority) {
          return (b.move.priority ?? 0) - (a.move.priority ?? 0);
        }

        if (a.move.kind === "switch" && this.gen.id < 3) {
          // Randomize choices to avoid leaking speed. The player always sees their pokemon switch
          // in first in a link battle on console.
          return +this.rng.bool() || -1;
        }

        // First turn switch order is not affected by speed
        if (this.turnType === TurnType.Lead) {
          const foo = this.players.indexOf(b.user.owner) - this.players.indexOf(a.user.owner);
          if (foo === 0) {
            return b.user.owner.active.indexOf(b.user) - a.user.owner.active.indexOf(a.user);
          }
          return foo;
        }

        const aSpe = this.gen.getStat(a.user, "spe");
        const bSpe = this.gen.getStat(b.user, "spe");
        if (aSpe === bSpe) {
          return +this.rng.bool() || -1;
        }
        return bSpe - aSpe;
      });
    let startBracket = 0;
    for (let i = 0; i < choices.length; i++) {
      // prettier-ignore
      const {move, user, targets: [target]} = choices[i];
      if ((move.priority ?? 0) !== (choices[startBracket].move.priority ?? 0)) {
        startBracket = i;
      }

      if (move.kind !== "protect") {
        user.v.protectCount = 0;
      }
      user.movedThisTurn = false;

      if (user.base.item === "quickclaw" && this.gen.rng.tryQuickClaw(this)) {
        // quick claw activates silently until gen iv
        console.log("proc quick claw: ", user.base.name);
        choices.splice(startBracket, 0, ...choices.splice(i, 1));
      }

      if (move !== this.gen.moveList.pursuit || this.turnType === TurnType.BatonPass) {
        continue;
      }

      if (target?.choice?.move?.kind === "switch" && target.owner !== user.owner) {
        console.log(user.base.name + " is pursuing ", target.base.name);
        choices.splice(choices.indexOf(target.choice), 0, ...choices.splice(i, 1));
        user.v.inPursuit = true;
      }
    }

    this.turnOrder = choices;
    this.runTurn(choices);

    if (this.allActive.some(poke => poke.v.inBatonPass)) {
      this.turnType = TurnType.BatonPass;
    } else {
      if (this.victor) {
        this.event({type: "end", victor: this.victor.id});
      } else if (this._turn >= 1000 && this.mods.endlessBattle) {
        return this.draw("too_long");
      }

      this.turnType = this.allActive.some(poke => poke.v.fainted)
        ? TurnType.Switch
        : TurnType.Normal;
    }

    for (const poke of this.allActive) {
      if (this.turnType !== TurnType.BatonPass || poke.v.inBatonPass || poke.movedThisTurn) {
        poke.choice = undefined;
      }
      poke.updateOptions(this);
    }
    return this.events.splice(0);
  }

  getTargets(user: ActivePokemon, {allyOnly, oppOnly, adjacent, self}: GetTarget) {
    const targets: ActivePokemon[] = [];
    const opp = this.opponentOf(user.owner);
    const userIndex = user.owner.active.indexOf(user);
    if (adjacent) {
      for (let i = userIndex - 1; i <= userIndex + 1; i++) {
        if (!allyOnly && opp.active[i] && !opp.active[i].v.fainted) {
          targets.push(opp.active[i]);
        }
        if (!oppOnly && user.owner.active[i] && !user.owner.active[i].v.fainted) {
          targets.push(user.owner.active[i]);
        }
      }
    } else {
      targets.push(...user.owner.active.filter(a => !a.v.fainted));
      targets.push(...opp.active.filter(a => !a.v.fainted));
    }

    const idx = targets.indexOf(user);
    if (!self && idx !== -1) {
      targets.splice(idx, 1);
    }
    return targets;
  }

  // --

  getEffectiveness(atk: Type, target: ActivePokemon) {
    if (target.v.hasFlag(VF.foresight)) {
      // FIXME: this is lazy
      const chart = structuredClone(this.gen.typeChart);
      chart.normal.ghost = 1;
      chart.fight.ghost = 1;
      return getEffectiveness(chart, atk, target.v.types);
    }
    return getEffectiveness(this.gen.typeChart, atk, target.v.types);
  }

  rand255(num: number) {
    return this.rng.int(0, 255) < Math.min(num, 255);
  }

  rand255Good(num: number) {
    return this.rng.int(0, 255) <= Math.min(num, 255);
  }

  rand100(num: number) {
    return this.rng.int(1, 256) <= Math.floor((num / 100) * 256);
  }

  checkAccuracy(move: Move, user: ActivePokemon, target: ActivePokemon) {
    if (target.v.hasFlag(VF.lockon)) {
      this.event({type: "sv", volatiles: [target.clearFlag(VF.lockon)]});

      const moveId = this.moveIdOf(move);
      if (moveId === "earthquake" || moveId === "fissure" || moveId === "magnitude") {
        if (target.v.charging && this.moveIdOf(target.v.charging.move) === "fly") {
          return false;
        }
      }

      return true;
    }

    return this.gen.checkAccuracy(move, this, user, target);
  }

  static censorEvents(events: BattleEvent[], player?: Player) {
    const result = [...events];
    for (let i = 0; i < result.length; i++) {
      const e = result[i];
      if ((e.type === "damage" || e.type === "recover") && playerId(e.target) !== player?.id) {
        result[i] = {...e, hpBefore: undefined, hpAfter: undefined};
      } else if (e.type === "switch" && playerId(e.src) !== player?.id) {
        result[i] = {...e, hp: undefined, indexInTeam: -1};
      } else if (
        e.type === "info" &&
        e.why === "cConfusedFatigue" &&
        playerId(e.src) !== player?.id
      ) {
        // don't leak short outrage/petal dance/thrash/etc. to the opponent
        result[i] = {type: "sv"};
        continue;
      }

      if (e.volatiles) {
        result[i] = {
          ...result[i],
          volatiles: e.volatiles.map(foo => {
            const result = structuredClone(foo);
            if (playerId(foo.id) !== player?.id) {
              result.v.stats = undefined;
            }
            return result;
          }),
        };
      }
    }
    return result;
  }

  // --

  private runTurn(choices: ChosenMove[]) {
    // eslint-disable-next-line prefer-const
    for (let {move, user, targets, indexInMoves} of choices) {
      user.movedThisTurn = true;
      if (user.v.hasFlag(VF.destinyBond)) {
        this.event({type: "sv", volatiles: [user.clearFlag(VF.destinyBond)]});
      }

      if (move.kind !== "switch" && user.v.encore) {
        indexInMoves = user.v.encore.indexInMoves;
        move = this.gen.moveList[user.base.moves[user.v.encore.indexInMoves]];
      }

      if (user.v.inPursuit) {
        // This isnt present in the original games, but showdown has it and it's cool without giving
        // any advantage
        this.info(targets[0], "withdraw");
      }

      if (move.kind !== "switch" && !this.gen.beforeUseMove(this, move, user)) {
        this.handleResidualDamage(user);
        if (this.checkFaint(user)) {
          return;
        }

        user.v.protectCount = 0;
        continue;
      }

      this.useMove(move, user, targets, indexInMoves);
      if (this.turnType !== TurnType.Switch && this.turnType !== TurnType.Lead) {
        if (user.v.inBatonPass || this.checkFaint(user)) {
          return;
        }

        this.handleResidualDamage(user);
        if (this.checkFaint(user)) {
          return;
        }
      }
    }

    if (this.turnType !== TurnType.Lead) {
      this.handleBetweenTurns();
    }
  }

  useMove(move: Move, user: ActivePokemon, targets: ActivePokemon[], moveIndex?: number) {
    if (move.kind === "damage") {
      if (user.v.trapping && targets[0].v.trapped) {
        const dead = targets[0].damage(this.gen1LastDamage, user, this, false, "trap").dead;
        if (dead || --user.v.trapping.turns === 0) {
          user.v.trapping = undefined;
        }
        return;
      }

      if (move.charge && user.v.charging?.move !== move) {
        this.event({type: "charge", src: user.id, move: this.moveIdOf(move)!});
        if (Array.isArray(move.charge)) {
          user.modStages(move.charge, this);
        }

        if (move.charge !== "sun" || this.weather?.kind !== "sun") {
          user.v.charging = {move: move, target: targets[0]};
          user.v.invuln = move.charge === "invuln" || user.v.invuln;
          return;
        }
      }

      user.v.charging = undefined;
      user.v.trapping = undefined;
      if (move.charge === "invuln") {
        user.v.invuln = false;
      }

      if (move.range === Range.Random) {
        targets = [this.rng.choice(this.getTargets(user, {adjacent: true, oppOnly: true}))!];
      }
    }

    if (move.kind !== "switch") {
      const moveId = this.moveIdOf(move)!;
      if (moveId === user.base.moves[user.v.disabled?.indexInMoves ?? -1]) {
        this.event({move: moveId, type: "move", src: user.id, disabled: true});
        user.v.charging = undefined;
        return;
      }

      if (moveIndex !== undefined && !user.v.thrashing && !user.v.bide) {
        user.base.pp[moveIndex]--;
        if (user.base.pp[moveIndex] < 0) {
          user.base.pp[moveIndex] = 63;
        }

        if (user.v.lastMoveIndex !== moveIndex) {
          user.v.rage = 1;
          user.v.furyCutter = 0;
        }

        user.v.lastMoveIndex = moveIndex;
      }

      if (move.selfThaw && user.base.status === "frz") {
        user.unstatus(this, "thaw");
      }

      if (!user.v.bide) {
        this.event({
          type: "move",
          move: moveId,
          src: user.id,
          thrashing: user.v.thrashing && this.gen.id === 1 ? true : undefined,
        });
      }
      user.v.lastMove = move;

      if (move.sleepOnly && user.base.status !== "slp") {
        this.info(user, "fail_generic");
        return;
      }

      let removed = false;
      for (let i = 0; i < targets.length; i++) {
        if (targets[i].v.hasFlag(VF.protect) && this.affectedByProtect(move)) {
          this.info(targets[i], "protect");
          targets.splice(i--, 1);
          removed = true;
        }
      }

      if (removed && !targets.length) {
        return;
      }
    }

    if (!move.kind) {
      return move.exec.call(move, this, user, targets, moveIndex);
    } else {
      const func = (this as any).gen.moveFunctions[move.kind];
      return func.call(move, this, user, targets, moveIndex);
    }
  }

  checkFaint(user: ActivePokemon, causedFaint = false) {
    const targets = this.opponentOf(user.owner).active;
    let fainted = false;
    for (const poke of targets) {
      if (poke.base.hp === 0 && !poke.v.fainted) {
        poke.faint(this);
        if (!this.victor && poke.owner.areAllDead()) {
          this.victor = user.owner;
        }
        fainted = true;
      }
    }

    for (const poke of user.owner.active) {
      if (poke.base.hp === 0 && !poke.v.fainted) {
        poke.faint(this);
        if (!this.victor && poke.owner.areAllDead()) {
          this.victor = this.opponentOf(poke.owner);
        }
        fainted = true;
      }
    }

    if (!causedFaint) {
      return user.owner.active.some(t => t.base.hp === 0) || targets.some(t => t.base.hp === 0);
    }

    return fainted;
  }

  private handleResidualDamage(poke: ActivePokemon) {
    const tickCounter = (why: DamageReason) => {
      // BUG GEN1: Toxic, Leech Seed, and brn/psn share the same routine. If a Pokemon rests, its
      // toxic counter will not be reset and brn, poison, and leech seed will use and update it.

      // BUG GEN2: Same as above, but Leech Seed is fixed and Rest resets the counter. Heal Bell
      // and Baton Pass don't though, so the same bug can happen.
      let m = poke.v.counter || 1;
      let d = 16;
      if (this.gen.id >= 2) {
        m =
          why !== "seeded" && (this.gen.id === 2 || poke.base.status === "tox")
            ? poke.v.counter || 1
            : 1;
        d = why === "seeded" ? 8 : 16;
      }

      const dmg = Math.max(Math.floor((m * poke.base.stats.hp) / d), 1);
      const {dead} = poke.damage(dmg, poke, this, false, why, true);
      if (
        why === "seeded" &&
        poke.v.seededBy &&
        poke.v.seededBy.base.hp < poke.v.seededBy.base.stats.hp
      ) {
        poke.v.seededBy.recover(dmg, poke, this, "seeder");
      }

      if (poke.v.counter) {
        poke.v.counter++;
      }
      return dead;
    };

    if (poke.base.hp === 0) {
      return;
    } else if ((poke.base.status === "tox" || poke.base.status === "psn") && tickCounter("psn")) {
      return;
    } else if (poke.base.status === "brn" && tickCounter("brn")) {
      return;
    } else if (poke.v.seededBy && tickCounter("seeded")) {
      return;
    } else if (
      poke.v.hasFlag(VF.nightmare) &&
      poke.damage(Math.max(1, idiv(poke.base.stats.hp, 4)), poke, this, false, "nightmare", true)
        .dead
    ) {
      return;
    } else if (
      poke.v.hasFlag(VF.curse) &&
      poke.damage(Math.max(1, idiv(poke.base.stats.hp, 4)), poke, this, false, "curse", true).dead
    ) {
      return;
    }
  }

  private handleBetweenTurns() {
    for (const poke of this.allActive) {
      poke.v.hazed = false;
      poke.v.flinch = false;
      poke.v.inPursuit = false;
      poke.v.retaliateDamage = 0;
      if (poke.v.trapped && !poke.v.trapped.user.v.trapping) {
        poke.v.trapped = undefined;
      }
      if (poke.v.hasFlag(VF.protect | VF.endure)) {
        this.event({
          type: "sv",
          volatiles: [poke.clearFlag(VF.protect | VF.endure)],
        });
      }
    }

    // FIXME: in gen 3 should be based on speed
    if (this.betweenTurns < BetweenTurns.FutureSight) {
      for (const poke of this.allActive) {
        if (poke.futureSight && --poke.futureSight.turns === 0) {
          if (!poke.v.fainted) {
            this.info(poke, "future_sight_release");
            if (!this.checkAccuracy(this.gen.moveList.futuresight, poke, poke)) {
              // FIXME: this is lazy
              this.events.splice(-1, 1);
              this.info(poke, "fail_generic");
            } else {
              poke.damage(poke.futureSight.damage, poke, this, false, "future_sight");
            }
          }

          poke.futureSight = undefined;
        }
      }

      this.betweenTurns = BetweenTurns.FutureSight;
      if (this.checkFaint(this.players[0].active[0], true)) {
        return;
      }
    }

    if (this.betweenTurns < BetweenTurns.Weather) {
      weather: if (this.weather) {
        if (--this.weather.turns === 0) {
          this.event({type: "weather", kind: "end", weather: this.weather.kind});
          delete this.weather;
          break weather;
        } else if (this.weather.kind !== "sand") {
          break weather;
        }

        this.event({type: "weather", kind: "continue", weather: this.weather.kind});
        for (const active of this.allActive) {
          if (active.v.charging?.move === this.gen.moveList.dig || active.v.fainted) {
            continue;
          } else if (active.v.types.some(t => t === "steel" || t === "ground" || t === "rock")) {
            continue;
          }

          const dmg = Math.max(idiv(active.base.stats.hp, 8), 1);
          active.damage(dmg, active, this, false, "sandstorm", true);
        }

        this.betweenTurns = BetweenTurns.Weather;
        if (this.checkFaint(this.players[0].active[0], true)) {
          return;
        }
      }
    }

    if (this.betweenTurns < BetweenTurns.PartialTrapping) {
      for (const poke of this.allActive) {
        if (!poke.v.trapped || poke.v.trapped.turns === -1 || poke.v.fainted) {
          continue;
        }

        const move = this.moveIdOf(poke.v.trapped.move)!;
        if (--poke.v.trapped.turns === 0) {
          this.event({
            type: "trap",
            src: poke.id,
            target: poke.id,
            kind: "end",
            move,
            volatiles: [{id: poke.id, v: {trapped: null}}],
          });
          poke.v.trapped = undefined;
        } else {
          const dmg = Math.max(idiv(poke.base.stats.hp, 16), 1);
          poke.damage2(this, {dmg, src: poke, why: "trap_eot", move, direct: true});
        }
      }

      this.betweenTurns = BetweenTurns.PartialTrapping;
      if (this.checkFaint(this.players[0].active[0], true)) {
        return;
      }
    }

    if (this.betweenTurns < BetweenTurns.PerishSong) {
      for (const poke of this.allActive) {
        if (poke.v.fainted) {
          continue;
        }

        if (poke.v.perishCount) {
          --poke.v.perishCount;

          const volatiles = [{id: poke.id, v: {perishCount: poke.v.perishCount}}];
          if (poke.v.perishCount !== 3) {
            this.event({type: "perish", src: poke.id, turns: poke.v.perishCount, volatiles});
          } else {
            this.event({type: "sv", volatiles});
          }
          if (!poke.v.perishCount) {
            poke.damage(poke.base.hp, poke, this, false, "perish_song", true);
          }
        }
      }

      this.betweenTurns = BetweenTurns.PerishSong;
      if (this.checkFaint(this.players[0].active[0], true)) {
        return;
      }

      // BUG: https://www.youtube.com/watch?v=1IiPWw5fMf8&t=85s
      // This is the last faint check performed between turns. The pokemon that switches in here
      // can take spikes damage and end up on 0 HP without fainting.
    }

    this.betweenTurns = BetweenTurns.Begin;
    for (const poke of this.allActive) {
      if (poke.v.fainted) {
        continue;
      }

      if (poke.base.item === "leftovers") {
        poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, this, "leftovers");
      } else if (poke.base.item === "mysteryberry") {
        const slot = poke.base.pp.findIndex(pp => pp === 0);
        if (slot !== -1) {
          poke.base.pp[slot] = 5;
          this.event({type: "item", src: poke.id, item: "mysteryberry"});
          this.event({type: "pp", src: poke.id, move: poke.base.moves[slot]});
          poke.base.item = undefined;
        }
      }
    }

    // Defrost
    if (this.gen.id >= 2) {
      for (const poke of this.allActive) {
        if (!poke.v.fainted && poke.base.status === "frz" && this.rand100((25 / 256) * 100)) {
          poke.unstatus(this, "thaw");
        }
      }
    }

    // Screens
    for (const player of this.players) {
      // technically should be safeguard, then light screen and reflect but who cares
      for (const screen of screens) {
        if (player.screens[screen] && --player.screens[screen] === 0) {
          this.event({type: "screen", user: player.id, screen, kind: "end"});
        }
      }
    }

    const cureStatus = (poke: ActivePokemon) => {
      const status = poke.base.status!;
      poke.clearStatusAndRecalculate(this);
      this.event({type: "item", src: poke.id, item: poke.base.item!});
      this.event({
        type: "cure",
        src: poke.id,
        status,
        volatiles: [{id: poke.id, v: {status: null, stats: poke.clientStats(this)}}],
      });
      poke.base.item = undefined;
    };

    const cureConfuse = (poke: ActivePokemon) => {
      poke.v.confusion = 0;
      const v = [{id: poke.id, v: {flags: poke.v.cflags}}];
      this.info(poke, "confused_end", v);
      poke.base.item = undefined;
    };

    //
    for (const poke of this.allActive) {
      if (poke.v.fainted) {
        continue;
      }

      if (statusBerry[poke.base.item!] && statusBerry[poke.base.item!] === poke.base.status) {
        cureStatus(poke);
      } else if (poke.base.item === "miracleberry") {
        if (poke.base.status) {
          cureStatus(poke);
        }

        if (poke.v.confusion) {
          if (poke.base.item) {
            this.event({type: "item", src: poke.id, item: poke.base.item!});
          }
          cureConfuse(poke);
        }
      } else if (poke.base.item === "bitterberry" && poke.v.confusion) {
        this.event({type: "item", src: poke.id, item: poke.base.item!});
        cureConfuse(poke);
      } else if (healBerry[poke.base.item!] && poke.base.hp < idiv(poke.base.stats.hp, 2)) {
        this.event({type: "item", src: poke.id, item: poke.base.item!});
        poke.recover(healBerry[poke.base.item!]!, poke, this, "item");
        poke.base.item = undefined;
      }
    }

    // Encore
    for (const poke of this.allActive) {
      if (
        !poke.v.fainted &&
        poke.v.encore &&
        (--poke.v.encore.turns === 0 || !poke.base.pp[poke.v.encore.indexInMoves])
      ) {
        poke.v.encore = undefined;
        this.info(poke, "encore_end", [{id: poke.id, v: {flags: poke.v.cflags}}]);
      }

      if (!poke.base.hp) {
        this.event({type: "bug", bug: "bug_gen2_spikes"});
      }
    }
  }

  private affectedByProtect(move: Move) {
    if (move.protect !== undefined) {
      return move.protect;
    }

    return (
      (move.kind === "stage" && move.acc) ||
      move.kind === "confuse" ||
      move.kind === "status" ||
      move.kind === "phaze"
    );
  }
}
