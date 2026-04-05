import {Random} from "random";
import type {BattleEvent, PlayerId, InfoReason, EndBattleEvent, PokeId} from "./events";
import type {MoveId, Move} from "./moves";
import type {Pokemon} from "./pokemon";
import {
  Range,
  isSpreadMove,
  playerId,
  VF,
  debugLog,
  type Weather,
  type ScreenId,
  type HazardId,
  type NonEmptyArray,
} from "./utils";
import type {Generation} from "./gen";
import {ActivePokemon} from "./active";
import type {AbilityId} from "./species";
import dirty from "./dirty";

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

type PlayerParams = {readonly id: PlayerId; readonly team: Pokemon[]};

export class Player {
  readonly id: PlayerId;
  readonly active: NonEmptyArray<ActivePokemon>;
  readonly team: Pokemon[];
  readonly screens: Partial<Record<ScreenId, number>> = {};
  readonly hazards: Partial<Record<HazardId, number>> = {};

  sleepClausePoke?: Pokemon;

  constructor({id, team}: PlayerParams, doubles: bool) {
    this.id = id;
    this.team = team;
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
      executed: false,
      spe: 0,
    };
    return true;
  }

  chooseSwitch(who: number, _battle: Battle, index: number) {
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
        poke,
      },
      isReplacement: active.v.fainted,
      executed: false,
      spe: 0,
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

  sideHasAbility(ability: AbilityId) {
    return this.active.some(poke => poke.base.hp && poke.getAbilityId() === ability);
  }
}

export type Mods = {sleepClause?: bool; freezeClause?: bool; endlessBattle?: bool};

export enum TurnType {
  Lead,
  Switch,
  Normal,
}

type BattleParams = {
  readonly gen: Generation;
  readonly player1: PlayerParams;
  readonly player2: PlayerParams;
  doubles?: bool;
  chooseLead?: bool;
  mods?: Mods;
  seed: string;
};

export class Battle {
  readonly events: BattleEvent[] = [];
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
    readonly players: readonly [Player, Player],
    private readonly doubles: bool,
    readonly mods: Mods,
    readonly rng: Random,
  ) {
    this.allActive = this.players.flatMap(pl => pl.active);
  }

  static start({gen, player1, player2, doubles, chooseLead, mods, seed}: BattleParams) {
    doubles ??= false;
    const players = [new Player(player1, doubles), new Player(player2, doubles)] as const;
    const self = new Battle(gen, players, doubles, mods ?? {}, new Random(seed));
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

  /** Should only be set by ActivePokemon::faintIfNeeded */
  set victor(value: Player) {
    this._victor = value;
    this.finished = true;
  }

  event<T extends BattleEvent>(event: T): T & BattleEvent {
    const volatiles = this.allActive
      .filter(poke => poke.initialized && dirty.isDirty(poke.v))
      .map(poke => ({id: poke.id, v: poke.changedVolatiles()}));
    if (volatiles.length) {
      event.volatiles = volatiles;
    } else if (event.type === "sv") {
      return event;
    }
    this.events.push(event);
    return event;
  }

  info(src: ActivePokemon, why: InfoReason) {
    return this.event({type: "info", src: src.id, why});
  }

  syncVolatiles() {
    return this.event({type: "sv"});
  }

  ability(src: ActivePokemon) {
    return this.event({type: "proc_ability", src: src.id, ability: src.v.ability!});
  }

  miss(user: ActivePokemon, target: ActivePokemon) {
    this.event({type: "miss", src: user.id, target: target.id});
  }

  opponentOf(player: Player): Player {
    return this.players[0] === player ? this.players[1] : this.players[0];
  }

  findPlayer(id: string) {
    return this.players.find(pl => pl.id === id);
  }

  forfeit(player: Player, timer: bool) {
    if (this.finished) {
      return [];
    }

    this.victor = this.opponentOf(player);
    this.event({type: "forfeit", user: player.id, timer});
    this.event({type: "end", victor: this.victor.id});
    for (const player of this.players) {
      player.updateOptions(this);
    }
    return this.events.splice(0);
  }

  forceEnd(why: EndBattleEvent["why"]) {
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

  private calcTurnOrder() {
    for (const poke of this.allActive) {
      if (poke.choice && !poke.choice.executed) {
        const isLead = this.turnType === TurnType.Lead;
        // Roll quick claw for lead turn in Gen 3 only
        if (
          poke.base.itemId === "quickclaw" &&
          this.gen.rng.tryQuickClaw(this) &&
          (poke.choice.move.kind !== "switch" || (this.gen.id <= 3 && isLead))
        ) {
          if (this.gen.id >= 4) {
            this.info(poke, "quickclaw");
          } else {
            debugLog("proc quick claw: ", poke.base.name);
          }
          poke.choice.spe = 65535;
        } else {
          // Ensure switch-in abilities activate in turn order on the lead turn including item
          // effects like choice scarf
          if (poke.choice.move.kind === "switch" && !poke.initialized) {
            poke.base = poke.choice.move.poke;
            poke.v.stats = {...poke.choice.move.poke.stats};
          }
          poke.choice.spe = this.gen.getSpeed(this, poke);
          debugLog(`[${poke.base.name}] speed is ${poke.choice.spe}`);
        }
      }
    }

    if (this.gen.id <= 3 || this.turnType !== TurnType.Normal) {
      const switches = this.switchOrder().filter(p => p.choice?.move?.kind === "switch");
      return switches.concat(this.inTurnOrder().filter(p => p.choice?.move?.kind !== "switch"));
    } else {
      return this.inTurnOrder();
    }
  }

  nextTurn() {
    if (!this.allActive.every(poke => !poke.options || poke.choice) || this.finished) {
      return;
    }

    const normal = this.turnType === TurnType.Normal && !this.allActive.some(p => p.v.inBatonPass);
    if (normal) {
      this._turn++;
      this.event({type: "next_turn", turn: this._turn});
      this.turnOrder = this.calcTurnOrder();
      for (let i = 0; i < this.turnOrder.length; i++) {
        const user = this.turnOrder[i];
        if (user.choice?.move.kind !== "protect") {
          user.v.protectCount = 0;
        }
      }
    } else if (this.turnType !== TurnType.Normal) {
      this.turnOrder = this.calcTurnOrder();
    }

    this.runTurn(normal);

    if (this.allActive.some(poke => poke.v.inBatonPass)) {
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
        return this.forceEnd("too_long");
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
      target.v.clearFlag(VF.lockon);
      this.syncVolatiles();
      if (this.gen.id === 2) {
        const moveId = move.id;
        if (moveId === "earthquake" || moveId === "fissure" || moveId === "magnitude") {
          if (target.v.charging && target.v.charging.move.id === "fly") {
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
      !user.hasAbility("soundproof") &&
      this.allActive.some(p => p.v.thrashing?.move?.id === "uproar")
    );
  }

  static censorEvents(events: BattleEvent[], player?: Player) {
    const result = [...events];
    for (let i = 0; i < result.length; i++) {
      const e = result[i];
      if ((e.type === "damage" || e.type === "recover") && playerId(e.target) !== player?.id) {
        result[i] = {...e, hpBefore: e.hpPercentBefore, hpAfter: e.hpPercentAfter};
      } else if (e.type === "switch" && playerId(e.src) !== player?.id) {
        result[i] = {...e, hp: e.hpPercent, indexInTeam: -1};
      } else if (
        e.type === "info" &&
        e.why === "fatigue_confuse" &&
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
    if (this.allActive.some(p => p.base.hp && p.getAbility()?.negatesWeather)) {
      return;
    }
    return this.weather?.kind;
  }

  setWeather(weather: Weather, turns: number) {
    this.weather = {turns, kind: weather};
    this.event({type: "weather", kind: "start", weather});

    // TODO: not sure if this is the right order
    for (const poke of this.switchOrder()) {
      poke.handleForecast(this);
    }
  }

  endWeather() {
    if (this.weather) {
      this.event({type: "weather", kind: "end", weather: this.weather.kind});
      delete this.weather;
      // TODO: order?
      for (const poke of this.inTurnOrder()) {
        poke.handleForecast(this);
      }
    }
  }

  // --

  private runTurn(normal: bool) {
    const execChoice = (user: ActivePokemon) => {
      // eslint-disable-next-line prefer-const
      let {move, target, indexInMoves, isReplacement} = user.choice!;

      user.choice!.executed = true;
      if (user.v.fainted && move.kind !== "switch") {
        return;
      }

      if (user.v.hasFlag(VF.destinyBond | VF.grudge)) {
        user.v.clearFlag(VF.destinyBond | VF.grudge);
        this.syncVolatiles();
      }

      if (move.kind !== "switch" && user.v.encore && indexInMoves !== undefined) {
        indexInMoves = user.v.encore.indexInMoves;
        move = this.gen.moveList[user.base.moves[user.v.encore.indexInMoves]];
      }

      if (move.kind !== "switch" && !this.gen.beforeUseMove(this, move, user)) {
        if (this.gen.afterBeforeUseMove(this, user)) {
          return true;
        }

        user.v.protectCount = 0;
        return;
      }

      if (user.v.encore) {
        this.callMove(move, user, indexInMoves);
      } else {
        this.useMove(move, user, target ? [target] : [], indexInMoves);
      }

      if (this.gen.afterUseMove(this, user, isReplacement)) {
        return true;
      }
    };

    const checkPursuit = (user: ActivePokemon) => {
      const pursuers = this.turnOrder.filter(pursuer => {
        return (
          !pursuer.v.fainted &&
          user.owner !== pursuer.owner &&
          pursuer.choice &&
          !pursuer.choice.executed &&
          pursuer.choice.move === this.gen.moveList.pursuit &&
          (pursuer.choice.target === user || this.gen.id >= 4) // In Gen 4+, pursuit will retarget itself to hit a switching opponent
        );
      });
      if (pursuers.length) {
        this.info(user, "withdraw");
      }

      for (const pursuer of pursuers) {
        debugLog(`${pursuer.base.name} is pursuing ${user.base.name}`);
        pursuer.v.inPursuit = true;
        pursuer.choice!.target = user;
        if (execChoice(pursuer)) {
          return "exit";
        } else if (user.v.fainted && (this.gen.id >= 5 || user.v.inBatonPass)) {
          // Before Gen 5, switches continue even if the pursuited pokemon faints
          return "next";
        }
      }
    };

    if (normal) {
      for (const poke of this.switchOrder()) {
        if (poke.choice?.move === this.gen.moveList.focuspunch) {
          this.info(poke, "begin_focuspunch");
        }
      }
    }

    for (const user of this.turnOrder) {
      if (this.finished) {
        return;
      } else if (!user.choice || user.choice.executed) {
        continue;
      }

      if (user.choice.move.kind === "switch" && !user.v.inBatonPass) {
        const res = checkPursuit(user);
        if (res === "exit") {
          return;
        } else if (res === "next") {
          continue;
        }
      }

      if (execChoice(user)) {
        if (!user.v.fainted && user.v.inBatonPass === "uturn") {
          const res = checkPursuit(user);
          if (res === "next") {
            continue;
          } else if (!res) {
            this.info(user, "uturn");
          }
        }

        return;
      }
    }

    if (!this.finished) {
      this.gen.betweenTurns(this);
    }
  }

  useMove(
    move: Move,
    user: ActivePokemon,
    targets: ActivePokemon[],
    moveIndex?: number,
    quiet?: bool,
    called?: bool,
  ) {
    const result = this.doUseMove(move, user, targets, moveIndex, quiet, called);
    // TODO: does choice band lock you in if your move was disabled?
    if (moveIndex !== undefined && user.base.item?.choice) {
      user.v.choiceLock = moveIndex;
    }
    return result;
  }

  doUseMove(
    move: Move,
    user: ActivePokemon,
    targets: ActivePokemon[],
    moveIndex?: number,
    quiet?: bool,
    called?: bool,
  ) {
    if (move.kind !== "switch") {
      const originalTargets = targets;
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
        (target = availableTargets.find(t => t.hasAbility("lightningrod")))
      ) {
        targets = [target];
      } else if (!targets.length) {
        targets = availableTargets.slice(0, 1);
      }

      const moveId = move.id!;
      if (move.kind === "damage") {
        const damp = this.allActive.find(p => p.hasAbility("damp"));
        if (damp && move.damp) {
          this.ability(damp);
          return this.event({type: "cantuse", src: user.id, move: moveId});
        }

        if (user.v.trapping && targets[0].v.trapped) {
          const dead = targets[0].damage(this.gen1LastDamage, user, this, false, "trap").dead;
          if (dead || --user.v.trapping.turns === 0) {
            user.v.trapping = undefined;
          }
          return;
        }

        if (move.charge && user.v.charging?.move !== move) {
          this.event({type: "charge", src: user.id, move: moveId, called});
          if (Array.isArray(move.charge)) {
            user.modStages(move.charge, this);
          }

          if (move.charge !== "sun" || !this.hasWeather("sun")) {
            user.v.charging = {move, targets: originalTargets};
            user.v.invuln = move.charge === "invuln" || user.v.invuln;
            user.v.clearFlag(VF.charge);
            this.syncVolatiles();
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
        user.v.clearFlag(VF.charge);
        this.syncVolatiles();
      }

      if (moveId === user.base.moves[user.v.disabled?.indexInMoves ?? -1]) {
        this.event({move: moveId, type: "move", src: user.id, disabled: true});
        user.v.charging = undefined;
        user.v.clearFlag(VF.charge);
        this.syncVolatiles();
        return;
      }

      if (moveIndex !== undefined && !user.v.thrashing && !user.v.bide) {
        user.base.pp[moveIndex]--;
        if (user.base.pp[moveIndex] < 0) {
          user.base.pp[moveIndex] = 63;
        }

        const tr = move.range === Range.Field ? this.allActive : targets;
        for (const poke of tr) {
          if (poke.hasAbility("pressure") && poke !== user) {
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
          called,
        });
      }
      user.v.lastMove = move;

      if (move.snatch) {
        for (const snatcher of this.turnOrder) {
          if (!snatcher.v.fainted && snatcher.v.hasFlag(VF.snatch)) {
            snatcher.v.clearFlag(VF.snatch);
            this.event({type: "snatch", src: snatcher.id, target: user.id});
            // psych up targets the pokémon snatch stole from, even if its another snatch user
            // a snatched acupressure (only possible in gen 4) always targets the snatcher
            targets = move.range === Range.Adjacent ? [user] : [snatcher];
            user = snatcher;
            moveIndex = undefined;
          }
        }
      }

      if (move.sleepOnly && user.base.status !== "slp") {
        return this.info(user, "fail_generic");
      } else if (!targets.length) {
        user.v.charging = undefined;
        user.v.clearFlag(VF.charge);
        this.syncVolatiles();
        return this.info(user, "fail_notarget");
      }

      const leftmost = targets[0];
      if (this.affectedByProtect(move)) {
        for (let i = 0; i < targets.length; i++) {
          if (targets[i].v.hasFlag(VF.protect)) {
            this.info(targets[i], "protect");
            targets.splice(i--, 1);
          } else if (targets[i].hasAbility("soundproof") && move.sound) {
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
        this.useMove(move, leftmost, newTargets, undefined, true, true);
        return;
      }
    }

    return (this.gen.move.scripts[move.kind] as any).call(move, this, user, targets, moveIndex);
  }

  callMove(move: Move, user: ActivePokemon, moveIndex?: number) {
    let targets = this.getTargets(user, move.range);
    if (!isSpreadMove(move.range) && targets.length) {
      targets = [this.rng.choice(targets)!];
    }
    return this.useMove(move, user, targets, moveIndex, false, true);
  }

  tryMagicBounce(move: Move, user: ActivePokemon, target: ActivePokemon) {
    if (target.v.hasFlag(VF.magicCoat) && move.magicCoat) {
      this.event({type: "bounce", src: target.id, move: move.id!});
      this.useMove(move, target, [user], undefined, true, true);
      return true;
    }
    return false;
  }

  checkFaint(user: ActivePokemon, causedFaint = false) {
    const targets = this.opponentOf(user.owner).active;
    let fainted = false;
    for (const poke of targets) {
      if (poke.faintIfNeeded(this)) {
        fainted = true;
      }
    }

    for (const poke of user.owner.active) {
      if (poke.faintIfNeeded(this)) {
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
