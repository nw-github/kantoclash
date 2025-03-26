import {Random} from "random";
import type {
  BattleEvent,
  DamageReason,
  PlayerId,
  InfoReason,
  VictoryEvent,
  ChangedVolatiles,
} from "./events";
import type {MoveId, Move} from "./moves";
import {Pokemon, type ValidatedPokemonDesc} from "./pokemon";
import {getEffectiveness, idiv, screens, VF, type Type, type Weather, type Screen} from "./utils";
import type {Generation} from "./gen";
import {healBerry, statusBerry} from "./item";
import {ActivePokemon, type VolatileStats} from "./active";

export {ActivePokemon, type VolatileStats};

export type MoveOption = {
  move: MoveId;
  valid: boolean;
  display: boolean;
  pp?: number;
  indexInMoves?: number;
};

type ChosenMove = {move: Move; indexInMoves?: number; user: ActivePokemon; target: ActivePokemon};

export type Options = NonNullable<Player["options"]>;

export type Turn = {events: BattleEvent[]; switchTurn: boolean};

export type PlayerParams = {readonly id: PlayerId; readonly team: ValidatedPokemonDesc[]};

export class Player {
  readonly id: PlayerId;
  readonly active: ActivePokemon;
  readonly team: Pokemon[];
  readonly teamDesc: ValidatedPokemonDesc[];
  choice?: ChosenMove;
  options?: {canSwitch: boolean; moves: MoveOption[]};
  sleepClausePoke?: Pokemon;

  screens: Partial<Record<Screen, number>> = {};
  spikes = false;

  constructor(gen: Generation, {id, team}: PlayerParams) {
    this.id = id;
    this.team = team.map(p => new Pokemon(gen, p));
    this.teamDesc = team;
    this.active = new ActivePokemon(this.team[0], this);
  }

  cancel() {
    this.choice = undefined;
  }

  chooseMove(battle: Battle, index: number) {
    const choice = this.options?.moves[index];
    if (!choice?.valid) {
      return false;
    }

    this.choice = {
      indexInMoves: choice.indexInMoves,
      move: battle.gen.moveList[choice.move],
      user: this.active,
      target: battle.opponentOf(this).active,
    };
    return true;
  }

  chooseSwitch(battle: Battle, index: number) {
    if (!this.options?.canSwitch) {
      return false;
    }

    const poke = this.team[index];
    if (battle.turnType !== TurnType.Lead) {
      const current = this.active.base;
      if (!poke || poke === current || !poke.hp || poke === current.real) {
        return false;
      }
    }

    this.choice = {
      move: {
        kind: "switch",
        type: "normal",
        name: "",
        pp: 0,
        priority: +7,
        poke,
        batonPass: this.active.v.inBatonPass,
      },
      user: this.active,
      target: this.active,
    };
    return true;
  }

  updateOptions(battle: Battle) {
    this.options = this.active.getOptions(battle);
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

export class Battle {
  readonly players: [Player, Player];
  private readonly events: BattleEvent[] = [];
  private readonly moveListToId = new Map<Move, MoveId>();
  turnType = TurnType.Lead;

  private _victor?: Player;
  weather?: {kind: Weather; turns: number};
  finished = false;
  private turn = 0;
  gen1LastDamage = 0;
  betweenTurns = BetweenTurns.Begin;

  private constructor(
    readonly gen: Generation,
    p1: PlayerParams,
    p2: PlayerParams,
    readonly mods: Mods,
    readonly rng: Random,
  ) {
    this.players = [new Player(gen, p1), new Player(gen, p2)];
    for (const k in this.gen.moveList) {
      this.moveListToId.set(this.gen.moveList[k as MoveId], k as MoveId);
    }
  }

  static start(
    gen: Generation,
    player1: PlayerParams,
    player2: PlayerParams,
    chooseLead?: boolean,
    mods: Mods = {},
    seed: string = crypto.randomUUID(),
  ) {
    console.log("new battle, seed: " + seed);

    const self = new Battle(gen, player1, player2, mods, new Random(seed));
    self.players[0].updateOptions(self);
    self.players[1].updateOptions(self);
    if (chooseLead) {
      return [self, {events: [], switchTurn: true} satisfies Turn] as const;
    }

    self.players[0].chooseSwitch(self, 0);
    self.players[1].chooseSwitch(self, 0);
    return [self, self.nextTurn()!] as const;
  }

  get victor(): Player | undefined {
    return this._victor;
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
    return this.event({type: "info", src: src.owner.id, why, volatiles});
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
      player.options = undefined;
    }
    return {events: this.events.splice(0), switchTurn: false};
  }

  draw(why: VictoryEvent["why"]) {
    this.finished = true;
    for (const player of this.players) {
      if (why === "timer") {
        this.event({type: "forfeit", user: player.id, timer: true});
      }
      player.options = undefined;
    }

    this.event({type: "end", why});
    return {events: this.events.splice(0), switchTurn: false};
  }

  nextTurn() {
    const priorityBrackets = (choices: ChosenMove[]) => {
      const brackets = [];
      let start = 0;
      for (let i = 0; i < choices.length; i++) {
        if (i === choices.length - 1 || choices[i].move.priority !== choices[i + 1].move.priority) {
          brackets.push([start, i] as const);
          start = i + 1;
        }
      }
      return brackets;
    };

    if (!this.players.every(player => !player.options || player.choice)) {
      return;
    }

    if (this.turnType === TurnType.Normal) {
      this.turn++;
    }

    const tmp = this.players
      .flatMap(({choice}) => (choice ? [choice] : []))
      .sort((a, b) => (b.move.priority ?? 0) - (a.move.priority ?? 0));
    const choices = [];
    for (const [start, end] of priorityBrackets(tmp)) {
      const bracket = tmp.slice(start, end + 1).sort((a, b) => {
        const aSpe = this.gen.getStat(a.user.owner.active, "spe");
        const bSpe = this.gen.getStat(b.user.owner.active, "spe");
        // TODO: in gen 2, host checks quick claw first and if it procs the second one isnt checked
        if (a.user.base.item === "quickclaw" && this.gen.rng.tryQuickClaw(this)) {
          console.log("proc quick claw: ", a.user.base.name);
          // quick claw activates silently until gen iv
          return -1;
        } else if (b.user.base.item === "quickclaw" && this.gen.rng.tryQuickClaw(this)) {
          console.log("proc quick claw: ", b.user.base.name);
          // quick claw activates silently until gen iv
          return 1;
        } else if (aSpe === bSpe) {
          return +this.rng.bool() || -1;
        }

        return bSpe - aSpe;
      });

      choices.push(...bracket);
    }

    if (choices.every(choice => choice.move.kind === "switch")) {
      // Randomize choices to avoid leaking speed. The player always sees their pokemon switch in
      // first in a link battle on console.
      choices.sort(() => (this.rng.bool() ? -1 : 1));
    }

    for (let i = 0; i < choices.length; i++) {
      const {move, user, target} = choices[i];
      if (move.kind !== "protect") {
        user.v.protectCount = 0;
      }

      user.movedThisTurn = false;
      if (move !== this.gen.moveList.pursuit || this.turnType === TurnType.BatonPass) {
        continue;
      }

      const ti = choices.findIndex(choice => choice.user === target);
      if (choices[ti].move.kind === "switch") {
        console.log(user.base.name + " is pursuing ", target.base.name);
        [choices[i], choices[ti]] = [choices[ti], choices[i]];
        user.v.inPursuit = true;
      }
    }

    this.runTurn(choices);

    const switchTurn = this.turnType === TurnType.Switch || this.turnType === TurnType.BatonPass;
    if (this.players.some(pl => pl.active.v.inBatonPass)) {
      this.turnType = TurnType.BatonPass;
    } else {
      if (this.victor) {
        this.event({type: "end", victor: this.victor.id});
      } else if (this.turn >= 1000 && this.mods.endlessBattle) {
        return this.draw("too_long");
      }

      this.turnType = this.players.some(pl => pl.active.v.fainted)
        ? TurnType.Switch
        : TurnType.Normal;
    }

    for (const player of this.players) {
      if (
        this.turnType !== TurnType.BatonPass ||
        player.active.v.inBatonPass ||
        player.active.movedThisTurn
      ) {
        player.choice = undefined;
      }
      player.updateOptions(this);
    }
    return {events: this.events.splice(0), switchTurn};
  }

  // --

  callUseMove(move: Move, user: ActivePokemon, target: ActivePokemon, moveIndex?: number) {
    if (!move.kind && move.use) {
      return move.use.call(move, this, user, target, moveIndex);
    } else {
      const func = move.kind && (this as any).gen.moveFunctions[move.kind].use;
      if (typeof func === "function") {
        return func.call(move, this, user, target, moveIndex);
      }
      return this.defaultUseMove(move, user, target, moveIndex);
    }
  }

  callExecMove(move: Move, user: ActivePokemon, target: ActivePokemon, moveIndex?: number) {
    if (!move.kind) {
      return move.exec.call(move, this, user, target, moveIndex);
    } else {
      const func = (this as any).gen.moveFunctions[move.kind];
      return func.exec.call(move, this, user, target, moveIndex);
    }
  }

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
        if (target.v.charging && this.moveIdOf(target.v.charging) === "fly") {
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
      if ((e.type === "damage" || e.type === "recover") && e.target !== player?.id) {
        result[i] = {...e, hpBefore: undefined, hpAfter: undefined};
      } else if (e.type === "switch" && e.src !== player?.id) {
        result[i] = {...e, hp: undefined, indexInTeam: -1};
      } else if (e.type === "info" && e.why === "cConfusedFatigue" && e.src !== player?.id) {
        // don't leak short outrage/petal dance/thrash/etc. to the opponent
        result[i] = {type: "sv"};
        continue;
      }

      if (e.volatiles) {
        result[i] = {
          ...result[i],
          volatiles: e.volatiles.map(foo => {
            const result = structuredClone(foo);
            if (foo.id !== player?.id) {
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
    for (let {move, user, target, indexInMoves} of choices) {
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
        this.info(target, "withdraw");
      }

      if (move.kind !== "switch" && !this.gen.beforeUseMove(this, move, user, target)) {
        this.handleResidualDamage(user);
        if (this.checkFaint(user, target)) {
          return;
        }

        user.v.protectCount = 0;
        continue;
      }

      this.callUseMove(move, user, target, indexInMoves);
      if (this.turnType !== TurnType.Switch && this.turnType !== TurnType.Lead) {
        if (user.v.inBatonPass || this.checkFaint(user, target)) {
          return;
        }

        this.handleResidualDamage(user);
        if (this.checkFaint(user, target)) {
          return;
        }
      }
    }

    if (this.turnType !== TurnType.Lead) {
      this.handleBetweenTurns();
    }
  }

  defaultUseMove(move: Move, user: ActivePokemon, target: ActivePokemon, moveIndex?: number) {
    const moveId = this.moveIdOf(move)!;
    if (moveId === user.base.moves[user.v.disabled?.indexInMoves ?? -1]) {
      this.event({move: moveId, type: "move", src: user.owner.id, disabled: true});
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
        src: user.owner.id,
        thrashing: user.v.thrashing && this.gen.id === 1 ? true : undefined,
      });
    }
    user.v.lastMove = move;

    if (move.sleepOnly && user.base.status !== "slp") {
      this.info(target, "fail_generic");
      return;
    }

    if (target.v.hasFlag(VF.protect) && this.affectedByProtect(move)) {
      this.info(target, "protect");
      return;
    }

    return this.callExecMove(move, user, target, moveIndex);
  }

  checkFaint(user: ActivePokemon, target: ActivePokemon, betweenTurns = false) {
    let fainted = false;
    if (target.base.hp === 0 && !target.v.fainted) {
      target.faint(this);
      if (!this.victor && target.owner.areAllDead()) {
        this.victor = user.owner;
      }
      fainted = true;
    }

    if (user.base.hp === 0 && !user.v.fainted) {
      user.faint(this);
      if (!this.victor && user.owner.areAllDead()) {
        this.victor = target.owner;
      }
      fainted = true;
    }

    if (!betweenTurns) {
      return user.base.hp === 0 || target.base.hp === 0;
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
      const opponent = this.opponentOf(poke.owner).active;
      if (why === "seeded" && opponent.base.hp < opponent.base.stats.hp) {
        opponent.recover(dmg, poke, this, "seeder");
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
    } else if (poke.v.hasFlag(VF.seeded) && tickCounter("seeded")) {
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
    if (this.betweenTurns < BetweenTurns.FutureSight) {
      for (const {active} of this.players) {
        if (active.futureSight && --active.futureSight.turns === 0) {
          if (!active.v.fainted) {
            this.info(active, "future_sight_release");
            if (!this.checkAccuracy(this.gen.moveList.futuresight, active, active)) {
              // FIXME: this is lazy
              this.events.splice(-1, 1);
              this.info(active, "fail_generic");
            } else {
              active.damage(active.futureSight.damage, active, this, false, "future_sight");
            }
          }

          active.futureSight = undefined;
        }
      }

      this.betweenTurns = BetweenTurns.FutureSight;
      if (this.checkFaint(this.players[0].active, this.players[1].active, true)) {
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
        for (const {active} of this.players) {
          if (active.v.charging === this.gen.moveList.dig || active.v.fainted) {
            continue;
          } else if (active.v.types.some(t => t === "steel" || t === "ground" || t === "rock")) {
            continue;
          }

          const dmg = Math.max(idiv(active.base.stats.hp, 8), 1);
          active.damage(dmg, active, this, false, "sandstorm", true);
        }

        this.betweenTurns = BetweenTurns.Weather;
        if (this.checkFaint(this.players[0].active, this.players[1].active, true)) {
          return;
        }
      }
    }

    if (this.betweenTurns < BetweenTurns.PartialTrapping) {
      for (const {active} of this.players) {
        if (!active.v.trapped || active.v.trapped.turns === -1 || active.v.fainted) {
          continue;
        }

        const move = this.moveIdOf(active.v.trapped.move)!;
        if (--active.v.trapped.turns === 0) {
          this.event({
            type: "trap",
            src: active.owner.id,
            target: active.owner.id,
            kind: "end",
            move,
            volatiles: [{id: active.owner.id, v: {trapped: null}}],
          });
          active.v.trapped = undefined;
        } else {
          const dmg = Math.max(idiv(active.base.stats.hp, 16), 1);
          active.damage2(this, {dmg, src: active, why: "trap_eot", move, direct: true});
        }
      }

      this.betweenTurns = BetweenTurns.PartialTrapping;
      if (this.checkFaint(this.players[0].active, this.players[1].active, true)) {
        return;
      }
    }

    if (this.betweenTurns < BetweenTurns.PerishSong) {
      for (const {active, id} of this.players) {
        if (active.v.fainted) {
          continue;
        }

        if (active.v.perishCount) {
          --active.v.perishCount;

          const volatiles = [{id, v: {perishCount: active.v.perishCount}}];
          if (active.v.perishCount !== 3) {
            this.event({type: "perish", src: id, turns: active.v.perishCount, volatiles});
          } else {
            this.event({type: "sv", volatiles});
          }
          if (!active.v.perishCount) {
            active.damage(active.base.hp, active, this, false, "perish_song", true);
          }
        }
      }

      this.betweenTurns = BetweenTurns.PerishSong;
      if (this.checkFaint(this.players[0].active, this.players[1].active, true)) {
        return;
      }

      // BUG: https://www.youtube.com/watch?v=1IiPWw5fMf8&t=85s
      // This is the last faint check performed between turns. The pokemon that switches in here
      // can take spikes damage and end up on 0 HP without fainting.
    }

    this.betweenTurns = BetweenTurns.Begin;
    for (const {active} of this.players) {
      if (active.v.fainted) {
        continue;
      }

      if (active.base.item === "leftovers") {
        active.recover(Math.max(1, idiv(active.base.stats.hp, 16)), active, this, "leftovers");
      } else if (active.base.item === "mysteryberry") {
        const slot = active.base.pp.findIndex(pp => pp === 0);
        if (slot !== -1) {
          active.base.pp[slot] = 5;
          this.event({type: "item", src: active.owner.id, item: "mysteryberry"});
          this.event({type: "pp", src: active.owner.id, move: active.base.moves[slot]});
          active.base.item = undefined;
        }
      }
    }

    // Defrost
    if (this.gen.id >= 2) {
      for (const {active} of this.players) {
        if (!active.v.fainted && active.base.status === "frz" && this.rand100((25 / 256) * 100)) {
          active.unstatus(this, "thaw");
        }
      }
    }

    // Screens
    for (const player of this.players) {
      // technically should be safeguard, then light screen and reflect but who cares
      for (const screen of screens) {
        if (player.screens[screen] && --player.screens[screen] === 0) {
          this.event({type: "screen", src: player.id, screen, kind: "end"});
        }
      }
    }

    const cureStatus = (poke: ActivePokemon) => {
      const status = poke.base.status!;
      poke.clearStatusAndRecalculate(this);
      this.event({type: "item", src: poke.owner.id, item: poke.base.item!});
      this.event({
        type: "cure",
        src: poke.owner.id,
        status,
        volatiles: [{id: poke.owner.id, v: {status: null, stats: poke.clientStats(this)}}],
      });
      poke.base.item = undefined;
    };

    const cureConfuse = (poke: ActivePokemon) => {
      poke.v.confusion = 0;
      const v = [{id: poke.owner.id, v: {flags: poke.v.cflags}}];
      this.info(poke, "confused_end", v);
      poke.base.item = undefined;
    };

    //
    for (const {active} of this.players) {
      if (active.v.fainted) {
        continue;
      }

      if (statusBerry[active.base.item!] && statusBerry[active.base.item!] === active.base.status) {
        cureStatus(active);
      } else if (active.base.item === "miracleberry") {
        if (active.base.status) {
          cureStatus(active);
        }

        if (active.v.confusion) {
          if (active.base.item) {
            this.event({type: "item", src: active.owner.id, item: active.base.item!});
          }
          cureConfuse(active);
        }
      } else if (active.base.item === "bitterberry" && active.v.confusion) {
        this.event({type: "item", src: active.owner.id, item: active.base.item!});
        cureConfuse(active);
      } else if (healBerry[active.base.item!] && active.base.hp < idiv(active.base.stats.hp, 2)) {
        this.event({type: "item", src: active.owner.id, item: active.base.item!});
        active.recover(healBerry[active.base.item!]!, active, this, "item");
        active.base.item = undefined;
      }
    }

    // Encore
    for (const {active} of this.players) {
      if (
        !active.v.fainted &&
        active.v.encore &&
        (--active.v.encore.turns === 0 || !active.base.pp[active.v.encore.indexInMoves])
      ) {
        active.v.encore = undefined;
        this.info(active, "encore_end", [{id: active.owner.id, v: {flags: active.v.cflags}}]);
      }
    }

    for (const {active} of this.players) {
      if (!active.base.hp) {
        this.event({type: "bug", bug: "bug_gen2_spikes"});
      }
    }

    for (const {active: poke} of this.players) {
      poke.v.hazed = false;
      poke.v.flinch = false;
      poke.v.inPursuit = false;
      poke.v.retaliateDamage = 0;
      if (this.gen.id === 1 && poke.v.trapped && !this.opponentOf(poke.owner).active.v.trapping) {
        poke.v.trapped = undefined;
      }
      if (poke.v.hasFlag(VF.protect | VF.endure)) {
        this.event({
          type: "sv",
          volatiles: [poke.clearFlag(VF.protect | VF.endure)],
        });
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
