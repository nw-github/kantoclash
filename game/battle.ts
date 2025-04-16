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
import {getEffectiveness, playerId, VF, type Type, type Weather, type ScreenId} from "./utils";
import type {Generation} from "./gen";
import {ActivePokemon} from "./active";
import {abilityList} from "./species";

export {ActivePokemon};

export type MoveOption = {
  move: MoveId;
  valid: bool;
  display: bool;
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
  readonly screens: Partial<Record<ScreenId, number>> = {};

  sleepClausePoke?: Pokemon;
  spikes = 0;

  constructor(gen: Generation, {id, team}: PlayerParams, doubles: bool) {
    this.id = id;
    this.team = team.map(p => {
      const poke = new Pokemon(gen, p);
      p.gender = poke.gender;
      p.form = poke.form;
      p.shiny = poke.shiny;
      return poke;
    });
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
      target: singleTarget,
      isReplacement: false,
      spe: battle.getSpe(user),
      executed: false,
    };
    return true;
  }

  chooseSwitch(who: number, battle: Battle, index: number) {
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

    const user = this.active[who];
    active.choice = {
      move: {
        kind: "switch",
        type: "normal",
        name: "",
        range: Range.Self,
        pp: 0,
        priority: +7,
        poke,
        batonPass: user.v.inBatonPass,
      },
      isReplacement: active.v.fainted,
      // This is only relevant for the order of weather abilities on the first turn, which are
      // called in turn order and affected by quick claw in Gen 3
      spe: battle.getSpe(user) === 65535 ? 65535 : poke.stats.spe,
      executed: false,
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

export type Mods = {sleepClause?: bool; freezeClause?: bool; endlessBattle?: bool};

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
  turnOrder: ActivePokemon[] = [];

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

  getSpe(poke: ActivePokemon) {
    if (poke.base.item === "quickclaw" && this.gen.rng.tryQuickClaw(this)) {
      console.log("proc quick claw: ", poke.base.name);
      return 65535;
    }
    return this.gen.getStat(this, poke, "spe");
  }

  event<T extends BattleEvent = BattleEvent>(event: BattleEvent) {
    this.events.push(event);
    return event as T;
  }

  info(src: ActivePokemon, why: InfoReason, volatiles?: ChangedVolatiles) {
    return this.event({type: "info", src: src.id, why, volatiles});
  }

  sv(volatiles?: ChangedVolatiles) {
    this.event({type: "sv", volatiles});
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

  forfeit(player: Player, timer: bool) {
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

  switchOrder() {
    // Gen 3 switch order is Host first, Guest first, Host second, Guest second
    const result = [
      this.players[0].active[0],
      this.players[1].active[0],
      this.players[0].active[1],
      this.players[1].active[1],
    ];

    return result.filter(p => !!p);
  }

  inTurnOrder() {
    return this.allActive
      .filter(p => p.choice)
      .sort((a, b) => {
        if (b.choice!.move.priority !== a.choice!.move.priority) {
          return (b.choice!.move.priority ?? 0) - (a.choice!.move.priority ?? 0);
        } else if (a.choice!.spe !== b.choice!.spe) {
          return b.choice!.spe - a.choice!.spe;
        }
        return this.rng.bool() ? 1 : -1;
      });
  }

  calcTurnOrder() {
    const switches = this.switchOrder().filter(p => p.choice?.move?.kind === "switch");
    return switches.concat(this.inTurnOrder().filter(p => p.choice?.move?.kind !== "switch"));
  }

  nextTurn() {
    if (!this.allActive.every(poke => !poke.options || poke.choice)) {
      return;
    }

    if (this.turnType === TurnType.Normal) {
      this._turn++;
      this.event({type: "next_turn", turn: this._turn});
    }

    // TODO: don't recalculate speed ties?
    this.turnOrder = this.calcTurnOrder();
    for (let i = 0; i < this.turnOrder.length; i++) {
      const user = this.turnOrder[i];
      const {move, target, executed} = user.choice!;
      if (executed) {
        continue;
      }

      if (move.kind !== "protect") {
        user.v.protectCount = 0;
      }

      if (move === this.gen.moveList.pursuit) {
        if (target?.choice?.move?.kind === "switch" && target.owner !== user.owner) {
          console.log(user.base.name + " is pursuing ", target.base.name);
          this.turnOrder.splice(this.turnOrder.indexOf(target), 0, ...this.turnOrder.splice(i, 1));
          user.v.inPursuit = true;
        }
      }
    }

    this.runTurn();

    if (this.allActive.some(poke => poke.v.inBatonPass)) {
      this.turnType = TurnType.BatonPass;

      for (const poke of this.allActive) {
        if (poke.v.inBatonPass) {
          poke.updateOptions(this);
        } else {
          poke.options = undefined;
        }
      }
    } else {
      if (this.victor) {
        this.event({type: "end", victor: this.victor.id});
      } else if (this._turn >= 1000 && this.mods.endlessBattle) {
        return this.draw("too_long");
      }

      if (this.allActive.some(p => p.v.fainted && p.canBeReplaced(this))) {
        this.turnType = TurnType.Switch;

        for (const poke of this.allActive) {
          if (poke.v.fainted && poke.canBeReplaced(this)) {
            poke.updateOptions(this);
          } else {
            poke.options = undefined;
            if (!this.doubles && poke.choice) {
              poke.choice.executed = true;
            }
          }
        }
      } else {
        this.turnType = TurnType.Normal;

        for (const poke of this.allActive) {
          poke.updateOptions(this);
        }
      }
    }

    return this.events.splice(0);
  }

  getTargets(user: ActivePokemon, params: Range, forUser?: bool) {
    const pl = user.owner;
    const opp = this.opponentOf(pl);

    let allyOnly = false,
      oppOnly = false,
      self = false;
    // prettier-ignore
    switch (params) {
    case Range.AllAdjacent:
    case Range.AllAdjacentFoe: {
      if (forUser) {
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
      return !forUser ? [...this.allActive.filter(a => !a.v.fainted)] : [];
    case Range.AllAllies:
      return !forUser ? user.owner.active.filter(a => a !== user && !a.v.fainted) : [];
    case Range.Field:
    case Range.Self:
    case Range.Random:
      return [user];
    case Range.Adjacent:
      break;
    case Range.AdjacentFoe:
      oppOnly = true;
      break;
    case Range.AdjacentAlly:
      allyOnly = true;
      break;
    case Range.SelfOrAdjacentAlly:
      allyOnly = true;
      self = true;
      break;
    case Range.Any: {
      const targets = [];
      if (forUser) {
        targets.push(...pl.active.filter(a => !a.v.fainted));
      }
      targets.push(...opp.active.filter(a => !a.v.fainted));
      const idx = targets.indexOf(user);
      if (!self && idx !== -1) {
        targets.splice(idx, 1);
      }
      return targets;
    }
    }

    const targets: ActivePokemon[] = [];
    const me = pl.active.indexOf(user);
    const p0 = this.players.indexOf(user.owner) === 0;
    if (!allyOnly) {
      for (let i = p0 ? me - 1 : me + 1; p0 ? i <= me + 1 : i >= me - 1; p0 ? i++ : i--) {
        if (opp.active[i] && !opp.active[i].v.fainted) {
          targets.push(opp.active[i]);
        }
      }
    }

    // don't pick teammate for metronome/sleep talk target
    if (!oppOnly && (forUser || allyOnly)) {
      for (let i = p0 ? me - 1 : me + 1; p0 ? i <= me + 1 : i >= me - 1; p0 ? i++ : i--) {
        if ((self || i !== me) && pl.active[i] && !pl.active[i].v.fainted) {
          targets.push(pl.active[i]);
        }
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

      if (this.gen.id === 2) {
        const moveId = this.moveIdOf(move);
        if (moveId === "earthquake" || moveId === "fissure" || moveId === "magnitude") {
          if (target.v.charging && this.moveIdOf(target.v.charging.move) === "fly") {
            return false;
          }
        }
      }

      return true;
    }

    return this.gen.checkAccuracy(move, this, user, target, physical);
  }

  hasUproar(user: ActivePokemon) {
    return (
      user.v.ability !== "soundproof" &&
      this.allActive.some(p => p.v.thrashing?.move?.flag === "uproar")
    );
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

  setWeather(weather: Weather, turns: number) {
    this.weather = {turns, kind: weather};
    this.event({
      type: "weather",
      kind: "start",
      weather,
      volatiles: this.allActive.map(a => ({id: a.id, v: {stats: a.clientStats(this)}})),
    });

    // not sure if this is the right order but doesn't really matter
    for (const poke of this.switchOrder()) {
      poke.handleForecast(this);
    }
  }

  // --

  private runTurn() {
    if (this.turnType === TurnType.Normal) {
      for (const poke of this.switchOrder()) {
        if (poke.choice?.move === this.gen.moveList.focuspunch) {
          this.info(poke, "begin_focuspunch");
        }
      }
    }

    for (const user of this.turnOrder) {
      if (!user.choice || user.choice.executed) {
        continue;
      }

      // eslint-disable-next-line prefer-const
      let {move, target, indexInMoves, isReplacement} = user.choice;

      user.choice.executed = true;
      if (user.v.fainted && move.kind !== "switch") {
        continue;
      } else if (this.finished) {
        break;
      }

      if (user.v.hasFlag(VF.destinyBond | VF.grudge)) {
        this.event({type: "sv", volatiles: [user.clearFlag(VF.destinyBond | VF.grudge)]});
      }

      if (move.kind !== "switch" && user.v.encore && indexInMoves !== undefined) {
        indexInMoves = user.v.encore.indexInMoves;
        move = this.gen.moveList[user.base.moves[user.v.encore.indexInMoves]];
      }

      if (user.v.inPursuit && target && !target.v.fainted) {
        this.info(target, "withdraw");
      }

      if (move.kind !== "switch" && !this.gen.beforeUseMove(this, move, user)) {
        if (this.gen.afterBeforeUseMove(this, user)) {
          return;
        }

        user.v.protectCount = 0;
        continue;
      }

      if (user.v.encore) {
        this.callMove(move, user, indexInMoves);
      } else {
        this.useMove(move, user, target ? [target] : [], indexInMoves);
      }
      if (this.gen.afterUseMove(this, user, isReplacement)) {
        return;
      }
    }

    this.gen.betweenTurns(this);
    if (this.turnType === TurnType.Lead) {
      for (const poke of this.inTurnOrder()) {
        poke.handleWeatherAbility(this);
      }

      for (const user of this.turnOrder) {
        user.handleSwitchInAbility(this);
      }
    }
  }

  useMove(
    move: Move,
    user: ActivePokemon,
    targets: ActivePokemon[],
    moveIndex?: number,
    quiet?: bool,
  ) {
    if (move.kind !== "switch") {
      targets = targets.filter(t => !t.v.fainted);
      const availableTargets = this.getTargets(user, move.range);

      let target;
      if (isSpreadMove(move.range)) {
        if (!targets.length) {
          targets = availableTargets;
        }
      } else if ((target = availableTargets.find(t => t.v.hasFlag(VF.followMe)))) {
        targets = [target];
      } else if (
        move.type === "electric" &&
        (target = availableTargets.find(t => t.v.ability === "lightningrod"))
      ) {
        targets = [target];
      } else if (!targets.length) {
        targets = availableTargets.slice(0, 1);
      }

      const moveId = this.moveIdOf(move)!;
      if (move.kind === "damage") {
        const damp = this.allActive.find(p => p.v.ability === "damp");
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
            this.sv([user.clearFlag(VF.charge)]);
            return;
          }
        }

        user.v.charging = undefined;
        user.v.trapping = undefined;
        if (move.charge === "invuln") {
          user.v.invuln = false;
        }

        if (move.range === Range.Random) {
          targets = [this.rng.choice(this.getTargets(user, Range.AllAdjacentFoe))!];
        }
      } else {
        this.sv([user.clearFlag(VF.charge)]);
      }

      // TODO: does choice band lock you in if your move was disabled?
      if (moveIndex !== undefined && user.base.item === "choiceband") {
        user.v.choiceLock = moveIndex;
      }

      if (moveId === user.base.moves[user.v.disabled?.indexInMoves ?? -1]) {
        this.event({move: moveId, type: "move", src: user.id, disabled: true});
        user.v.charging = undefined;
        this.sv([user.clearFlag(VF.charge)]);
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

      if (!user.v.bide && !quiet) {
        this.event({
          type: "move",
          move: moveId,
          src: user.id,
          thrashing: user.v.thrashing && this.gen.id === 1 ? true : undefined,
        });
      }
      user.v.lastMove = move;

      if (move.snatch) {
        for (const poke of this.turnOrder) {
          if (!poke.v.fainted && poke.v.hasFlag(VF.snatch)) {
            this.event({
              type: "snatch",
              src: poke.id,
              target: user.id,
              volatiles: [poke.clearFlag(VF.snatch)],
            });
            // psych up targets the pokémon snatch was stolen from, even if its another snatch user
            user = poke;
            targets = move.range === Range.Adjacent ? [user] : [poke];
            moveIndex = undefined;
          }
        }
      }

      if (move.sleepOnly && user.base.status !== "slp") {
        return this.info(user, "fail_generic");
      } else if (!targets.length) {
        user.v.charging = undefined;
        this.sv([user.clearFlag(VF.charge)]);
        return this.info(user, "fail_notarget");
      } else if (
        move.kind === "damage" &&
        move.checkSuccess &&
        !move.checkSuccess(this, user, targets)
      ) {
        user.v.charging = undefined;
        return this.sv([user.clearFlag(VF.charge)]);
      }

      const leftmost = targets[0];
      if (this.affectedByProtect(move)) {
        for (let i = 0; i < targets.length; i++) {
          if (targets[i].v.hasFlag(VF.protect)) {
            this.info(targets[i], "protect");
            targets.splice(i--, 1);
          } else if (targets[i].v.ability === "soundproof" && move.sound) {
            this.ability(targets[i]);
            this.info(targets[i], "immune");
            targets.splice(i--, 1);
          }
        }

        if (!targets.length) {
          return;
        }
      }

      if (targets.includes(leftmost) && leftmost.v.hasFlag(VF.magicCoat) && move.magicCoat) {
        const newTargets = isSpreadMove(move.range)
          ? this.getTargets(leftmost, move.range)
          : [user];
        this.event({type: "bounce", src: leftmost.id, move: moveId});
        this.useMove(move, leftmost, newTargets, undefined, true);
        return;
      }
    }

    if (!move.kind) {
      return move.exec(this, user, targets, moveIndex);
    }

    const func = (this as any).gen.moveFunctions[move.kind];
    return func.call(move, this, user, targets, moveIndex);
  }

  callMove(move: Move, user: ActivePokemon, moveIndex?: number) {
    let targets = this.getTargets(user, move.range);
    if (!isSpreadMove(move.range) && targets.length) {
      targets = [this.rng.choice(targets)!];
    }
    return this.useMove(move, user, targets, moveIndex);
  }

  tryMagicBounce(move: Move, user: ActivePokemon, target: ActivePokemon) {
    if (target.v.hasFlag(VF.magicCoat) && move.magicCoat) {
      this.event({type: "bounce", src: target.id, move: this.moveIdOf(move)!});
      this.useMove(move, target, [user], undefined, true);
      return true;
    }
    return false;
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
      (move.kind === "stage" && move.range !== Range.Self) ||
      move.kind === "confuse" ||
      move.kind === "status" ||
      move.kind === "phaze"
    );
  }
}
