import {Random} from "random";
import type {
  BattleEvent,
  PlayerId,
  InfoReason,
  VictoryEvent,
  ChangedVolatiles,
  PokeId,
} from "./events";
import {type MoveId, type Move, Range, isSpreadMove} from "./moves";
import {Pokemon, type ValidatedPokemonDesc} from "./pokemon";
import {getEffectiveness, playerId, VF, type Type, type Weather, type Screen} from "./utils";
import type {Generation} from "./gen";
import {ActivePokemon, type ChosenMove, type VolatileStats} from "./active";
import {abilityList} from "./species";

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
    if (choice.targets.length && (!target || !choice.targets.includes(target))) {
      return false;
    }

    let singleTarget = undefined;
    if (target) {
      const [playerId, pokeIndex] = target.split(":");
      singleTarget = battle.players.find(pl => pl.id === playerId)!.active[+pokeIndex];
    }
    user.choice = {
      indexInMoves: choice.indexInMoves,
      move,
      user,
      target: singleTarget,
      isReplacement: false,
    };
    return true;
  }

  chooseSwitch(who: number, index: number) {
    const active = this.active[who];
    if (!active?.options?.switches.includes(index)) {
      return false;
    }

    const poke = this.team[index];
    if (
      this.active.some(a => a.choice?.move?.kind === "switch" && a.choice.move.poke.real === poke)
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
        poke: poke,
        batonPass: this.active[who].v.inBatonPass,
      },
      user: this.active[who],
      isReplacement: active.v.fainted,
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
  readonly events: BattleEvent[] = [];
  private readonly moveListToId = new Map<Move, MoveId>();
  turnType = TurnType.Lead;

  private _victor?: Player;
  private _turn = 0;
  weather?: {kind: Weather; turns: number};
  finished = false;
  gen1LastDamage = 0;
  betweenTurns = 0;
  allActive: ActivePokemon[];
  turnOrder: ChosenMove[] = [];

  private constructor(
    readonly gen: Generation,
    p1: PlayerParams,
    p2: PlayerParams,
    private readonly doubles: bool,
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
      self.players[0].chooseSwitch(i, i);
      self.players[1].chooseSwitch(i, i);
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

  ability(src: ActivePokemon, volatiles?: ChangedVolatiles) {
    return this.event({type: "proc_ability", src: src.id, ability: src.v.ability!, volatiles});
  }

  miss(user: ActivePokemon, target: ActivePokemon) {
    this.event({type: "miss", src: user.id, target: target.id});
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
      .map(p => p.choice)
      .filter(choice => !!choice)
      .sort((a, b) => {
        if (b.move.priority !== a.move.priority) {
          return (b.move.priority ?? 0) - (a.move.priority ?? 0);
        } else if (this.turnType === TurnType.Lead) {
          // First turn switch order is not affected by speed
          const foo = this.players.indexOf(b.user.owner) - this.players.indexOf(a.user.owner);
          if (foo === 0) {
            return a.user.owner.active.indexOf(a.user) - b.user.owner.active.indexOf(b.user);
          }
          return foo;
        } else if (a.move.kind === "switch" && this.gen.id < 3) {
          // Randomize choices to avoid leaking speed. The player always sees their pokemon switch
          // in first in a link battle on console.
          return +this.rng.bool() || -1;
        }

        const aSpe = this.gen.getStat(this, a.user, "spe");
        const bSpe = this.gen.getStat(this, b.user, "spe");
        if (aSpe === bSpe) {
          return +this.rng.bool() || -1;
        }
        return bSpe - aSpe;
      });
    let startBracket = 0;
    for (let i = 0; i < choices.length; i++) {
      // prettier-ignore
      const {move, user, target} = choices[i];
      if ((move.priority ?? 0) !== (choices[startBracket].move.priority ?? 0)) {
        startBracket = i;
      }

      if (move.kind !== "protect") {
        user.v.protectCount = 0;
      }
      user.movedThisTurn = false;

      if (
        move.kind !== "switch" &&
        user.base.item === "quickclaw" &&
        this.gen.rng.tryQuickClaw(this)
      ) {
        // quick claw activates silently until gen iv
        console.log("proc quick claw: ", user.base.name);
        choices.splice(startBracket, 0, ...choices.splice(i, 1));
      }

      if (move === this.gen.moveList.pursuit) {
        if (target?.choice?.move?.kind === "switch" && target.owner !== user.owner) {
          console.log(user.base.name + " is pursuing ", target.base.name);
          choices.splice(choices.indexOf(target.choice), 0, ...choices.splice(i, 1));
          user.v.inPursuit = true;
        }
      }
    }

    if (
      (this.turnType === TurnType.Switch && this.doubles) ||
      this.turnType === TurnType.BatonPass
    ) {
      this.turnOrder.unshift(...choices);
    } else {
      this.turnOrder = choices;
    }

    this.runTurn(this.turnOrder);

    if (this.allActive.some(poke => poke.v.inBatonPass)) {
      this.turnOrder = this.turnOrder.filter(c => !c.user.movedThisTurn && !c.user.v.fainted);
      this.turnType = TurnType.BatonPass;
    } else {
      if (this.victor) {
        this.event({type: "end", victor: this.victor.id});
      } else if (this._turn >= 1000 && this.mods.endlessBattle) {
        return this.draw("too_long");
      }

      if (this.allActive.some(p => p.v.fainted && p.canBeReplaced(this))) {
        this.turnOrder = this.turnOrder.filter(c => !c.user.movedThisTurn && !c.user.v.fainted);
        this.turnType = TurnType.Switch;
      } else {
        this.turnOrder = [];
        this.turnType = TurnType.Normal;
      }
    }

    for (const poke of this.allActive) {
      poke.updateOptions(this);
    }

    return this.events.splice(0);
  }

  getTargets(user: ActivePokemon, params: GetTarget): ActivePokemon[];
  getTargets(user: ActivePokemon, params: Range, spread: boolean): ActivePokemon[];
  getTargets(user: ActivePokemon, params: GetTarget | Range, spread?: bool) {
    const pl = user.owner;
    const opp = this.opponentOf(pl);

    const targets: ActivePokemon[] = [];
    if (typeof params === "number") {
      // prettier-ignore
      switch (params) {
      case Range.AllAdjacent:
      case Range.AllAdjacentFoe: {
        if (!spread) {
          return [];
        }

        const targets = [];
        const me = user.owner.active.indexOf(user);
        const p0 = this.players.indexOf(user.owner) === 0;
        for (let i = p0 ? me - 1 : me + 1; p0 ? (i <= me + 1) : (i >= me - 1); p0 ? i++ : i--) {
          if (opp.active[i] && !opp.active[i].v.fainted) {
            targets.push(opp.active[i]);
          }
          if (params === Range.AllAdjacent && i !== me && pl.active[i] && !pl.active[i].v.fainted) {
            targets.push(pl.active[i]);
          }
        }
        return targets;
      }
      case Range.All:
        return spread ? [...this.allActive.filter(a => !a.v.fainted)] : [];
      case Range.AllAllies:
        if (!spread) {
          return [];
        }
        return user.owner.active.filter(a => a !== user && !a.v.fainted);
      case Range.Field:
      case Range.Self:
      case Range.Random:
        return [user];
      case Range.Adjacent:
        params = {adjacent: true};
        break;
      case Range.AdjacentFoe:
        params = {oppOnly: true, adjacent: true};
        break;
      case Range.AdjacentAlly:
        params = {allyOnly: true, adjacent: true};
        break;
      case Range.SelfOrAdjacentAlly:
        params = {allyOnly: true, adjacent: true, self: true};
        break;
      case Range.Any:
        params = {};
        break;
      }
    }

    const {allyOnly, oppOnly, adjacent, self} = params;
    if (adjacent) {
      const me = pl.active.indexOf(user);
      // Priority: Trainer's left, Opposing trainer's left, Trainer's right, Opposing trainer's right
      const p0 = this.players.indexOf(user.owner) === 0;
      for (let i = p0 ? me - 1 : me + 1; p0 ? i <= me + 1 : i >= me - 1; p0 ? i++ : i--) {
        if (!allyOnly && opp.active[i] && !opp.active[i].v.fainted) {
          targets.push(opp.active[i]);
        }
        if (!oppOnly && (self || i !== me) && pl.active[i] && !pl.active[i].v.fainted) {
          targets.push(pl.active[i]);
        }
      }
    } else {
      targets.push(...pl.active.filter(a => !a.v.fainted));
      targets.push(...opp.active.filter(a => !a.v.fainted));
      const idx = targets.indexOf(user);
      if (!self && idx !== -1) {
        targets.splice(idx, 1);
      }
    }
    return targets;
  }

  // --

  getEffectiveness(atk: Type, target: ActivePokemon) {
    if (target.v.hasFlag(VF.identified)) {
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

  checkAccuracy(move: Move, user: ActivePokemon, target: ActivePokemon, physical?: bool) {
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

    return this.gen.checkAccuracy(move, this, user, target, physical);
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

  hasWeather(weather: Weather) {
    return this.getWeather() === weather;
  }

  getWeather() {
    if (this.allActive.some(p => p.v.ability && abilityList[p.v.ability].negatesWeather)) {
      return;
    }
    return this.weather?.kind;
  }

  // --

  private runTurn(choices: ChosenMove[]) {
    // eslint-disable-next-line prefer-const
    for (let {move, user, target, indexInMoves, isReplacement} of choices) {
      user.movedThisTurn = true;
      if (user.v.fainted && !isReplacement) {
        continue;
      } else if (this.finished) {
        break;
      }

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
        this.info(target!, "withdraw");
      }

      if (move.kind !== "switch" && !this.gen.beforeUseMove(this, move, user)) {
        if (this.gen.afterBeforeUseMove(this, user)) {
          return;
        }

        user.v.protectCount = 0;
        continue;
      }

      this.useMove(move, user, target ? [target] : [], indexInMoves);
      if (this.gen.afterAttack(this, user, isReplacement)) {
        return;
      }
    }

    if (this.turnType !== TurnType.Lead) {
      this.gen.betweenTurns(this);
    }
  }

  useMove(move: Move, user: ActivePokemon, targets: ActivePokemon[], moveIndex?: number) {
    targets = targets.filter(t => !t.v.fainted);
    if (!targets.length) {
      targets = this.getTargets(user, move.range, true);
      if (!isSpreadMove(move.range)) {
        targets = targets.slice(0, 1);
      }
    }

    if (move.kind === "damage") {
      const damp = this.allActive.find(p => p.v.ability === "damp");
      const moveId = this.moveIdOf(move)!;
      if (damp && move.damp) {
        this.ability(damp);
        this.event({type: "cantuse", src: damp.id, move: moveId});
      }

      if (user.v.trapping && targets[0].v.trapped) {
        const dead = targets[0].damage(this.gen1LastDamage, user, this, false, "trap").dead;
        if (dead || --user.v.trapping.turns === 0) {
          user.v.trapping = undefined;
        }
        return;
      }

      if (move.charge && user.v.charging?.move !== move) {
        this.event({type: "charge", src: user.id, move: moveId});
        if (Array.isArray(move.charge)) {
          user.modStages(move.charge, this);
        }

        if (move.charge !== "sun" || !this.hasWeather("sun")) {
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
      // TODO: does choice band lock you in if your move was disabled?
      if (moveIndex !== undefined && user.base.item === "choiceband") {
        user.v.choiceLock = moveIndex;
      }

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

        const tr = move.range === Range.Field ? this.allActive : targets;
        for (const poke of tr) {
          if (poke.v.ability === "pressure" && poke !== user) {
            user.base.pp[moveIndex] = Math.max(0, user.base.pp[moveIndex] - 1);
          }
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
        return this.info(user, "fail_generic");
      }

      if (!targets.length) {
        // Not sure if this is right in gen3, but this should only happen on the last turn if both
        // opponents faint to a
        return this.info(user, "fail_notarget");
      }

      for (let i = 0; i < targets.length; i++) {
        if (targets[i].v.hasFlag(VF.protect) && this.affectedByProtect(move)) {
          this.info(targets[i], "protect");
          targets.splice(i--, 1);
        }
      }

      if (!targets.length) {
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

  callMove(move: Move, user: ActivePokemon) {
    let targets = this.getTargets(user, move.range, true);
    if (!isSpreadMove(move.range) && targets.length) {
      targets = [this.rng.choice(targets)!];
    }
    return this.useMove(move, user, targets);
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
