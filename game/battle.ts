import {Random} from "random";
import type {
  HitSubstituteEvent,
  BattleEvent,
  DamageEvent,
  DamageReason,
  PlayerId,
  RecoveryReason,
  InfoReason,
  VictoryEvent,
  ChangedVolatiles,
} from "./events";
import type {MoveId, Move} from "./moves";
import {Pokemon, type Status, type ValidatedPokemonDesc} from "./pokemon";
import {
  arraysEqual,
  clamp,
  getEffectiveness,
  hpPercent,
  idiv,
  stageMultipliers,
  stageStatKeys,
  VolatileFlag,
  type Stages,
  type StatStages,
  type Type,
  type Weather,
} from "./utils";
import type {Generation} from "./gen";

export type MoveOption = {
  move: MoveId;
  valid: boolean;
  display: boolean;
  pp?: number;
  indexInMoves?: number;
};

type ChosenMove = {move: Move; indexInMoves?: number; user: ActivePokemon};

export type Options = NonNullable<Player["options"]>;

export type Turn = {events: BattleEvent[]; switchTurn: boolean};

export type PlayerParams = {readonly id: PlayerId; readonly team: ValidatedPokemonDesc[]};

export type Screen = "light_screen" | "reflect" | "safeguard";

class Player {
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
    };
    return true;
  }

  chooseSwitch(battle: Battle, index: number) {
    if (!this.options?.canSwitch) {
      return false;
    }

    const poke = this.team[index];
    if (!battle.leadTurn) {
      const current = this.active.base;
      if (!poke || poke === current || !poke.hp || poke === current.real) {
        return false;
      }
    }

    this.choice = {
      move: {kind: "switch", type: "normal", name: "", pp: 0, priority: +7, poke},
      user: this.active,
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

export class Battle {
  readonly players: [Player, Player];
  private readonly events: BattleEvent[] = [];
  private readonly moveListToId = new Map<Move, MoveId>();
  private switchTurn = true;
  private _victor?: Player;
  weather?: {kind: Weather; turns: number};
  finished = false;
  leadTurn = true;
  turn = 0;

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
    this.event({type: "info", src: player.id, why: timer ? "ff_timer" : "ff"});
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
        this.event({type: "info", src: player.id, why: "ff_timer"});
      }
      player.options = undefined;
    }

    this.event({type: "end", why});
    return {events: this.events.splice(0), switchTurn: false};
  }

  nextTurn() {
    if (!this.players.every(player => !player.options || player.choice)) {
      return;
    }

    if (!this.switchTurn) {
      this.turn++;
    }

    const choices = this.players
      .flatMap(({choice}) => (choice ? [choice] : []))
      .sort((a, b) => {
        const aPri = a.move.priority ?? 0,
          bPri = b.move.priority ?? 0;
        if (aPri !== bPri) {
          return bPri - aPri;
        }

        const aSpe = a.user.owner.active.getStat("spe");
        const bSpe = b.user.owner.active.getStat("spe");
        if (aSpe === bSpe) {
          return this.rng.bool() ? -1 : 1;
        }

        return bSpe - aSpe;
      });

    this.leadTurn = false;
    if (choices.every(choice => choice.move.kind === "switch")) {
      // Randomize choices to avoid leaking speed. The player always sees their pokemon switch in
      // first in a link battle on console.
      choices.sort(() => (this.rng.bool() ? -1 : 1));
    }

    this.runTurn(choices);

    if (this.victor) {
      this.event({type: "end", victor: this.victor.id});
    } else if (this.turn >= 1000 && this.mods.endlessBattle) {
      return this.draw("too_long");
    }

    const switchTurn = this.switchTurn;
    this.switchTurn = this.players.some(pl => pl.active.v.fainted);
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

  getEffectiveness(atk: Type, def: readonly Type[]) {
    return getEffectiveness(this.gen.typeChart, atk, def);
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
      }

      if (e.volatiles) {
        result[i] = {
          ...e,
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
    choices.forEach(({move, user}) => {
      if (move.kind !== "protect") {
        user.v.protectCount = 0;
      }
    });

    // eslint-disable-next-line prefer-const
    for (let {user, move, indexInMoves} of choices) {
      user.movedThisTurn = true;
      if (user.v.hasFlag(VolatileFlag.destinyBond)) {
        this.event({type: "sv", volatiles: [user.clearFlag(VolatileFlag.destinyBond)]});
      }

      if (move.kind !== "switch" && user.v.encore) {
        indexInMoves = user.v.encore.indexInMoves;
        move = this.gen.moveList[user.base.moves[user.v.encore.indexInMoves]];
      }

      const target = this.opponentOf(user.owner).active;
      if (move.kind !== "switch" && !this.gen.beforeUseMove(this, move, user, target)) {
        this.handleResidualDamage(user);
        if (this.checkFaint(user, target)) {
          break;
        }

        user.v.protectCount = 0;
        continue;
      }

      this.callUseMove(move, user, target, indexInMoves);
      if (!this.switchTurn) {
        if (this.checkFaint(user, target)) {
          break;
        }

        this.handleResidualDamage(user);
        if (this.checkFaint(user, target)) {
          break;
        }
      }
    }

    if (!this.switchTurn) {
      this.handleBetweenTurns();
    }

    for (const player of this.players) {
      player.choice = undefined;
      player.active.v.hazed = false;
      player.active.v.flinch = false;
      player.active.movedThisTurn = false;
      if (player.active.v.trapped && !this.opponentOf(player).active.v.trapping) {
        player.active.v.trapped = false;
      }
      player.updateOptions(this);
    }
  }

  defaultUseMove(move: Move, user: ActivePokemon, target: ActivePokemon, moveIndex?: number) {
    const moveId = this.moveIdOf(move)!;
    if (moveId === user.base.moves[user.v.disabled?.indexInMoves ?? -1]) {
      this.event({move: moveId, type: "move", src: user.owner.id, disabled: true});
      user.v.charging = undefined;
      return;
    }

    if (moveIndex !== undefined && !user.v.thrashing) {
      user.base.pp[moveIndex]--;
      if (user.base.pp[moveIndex] < 0) {
        user.base.pp[moveIndex] = 63;
      }
      user.v.lastMoveIndex = moveIndex;
    }

    if (move.selfThaw && user.base.status === "frz") {
      user.unstatus(this, "thaw");
    }

    this.event({
      move: moveId,
      type: "move",
      src: user.owner.id,
      thrashing: user.v.thrashing ? true : undefined,
    });
    user.v.lastMove = move;

    if (move.sleepOnly && user.base.status !== "slp") {
      this.info(target, "fail_generic");
      return false;
    }

    if (target.v.hasFlag(VolatileFlag.protect) && this.affectedByProtect(move)) {
      this.info(target, "protect");
      return false;
    }

    return this.callExecMove(move, user, target, moveIndex);
  }

  checkFaint(user: ActivePokemon, target: ActivePokemon) {
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
    return fainted;
  }

  private handleResidualDamage(user: ActivePokemon) {
    const tickCounter = (why: DamageReason) => {
      const multiplier = user.base.status === "psn" && why === "psn" ? 1 : user.v.counter;
      const dmg = Math.max(Math.floor((multiplier * user.base.stats.hp) / 16), 1);
      const {dead} = user.damage(dmg, user, this, false, why, true);
      const opponent = this.opponentOf(user.owner).active;
      if (why === "seeded" && opponent.base.hp < opponent.base.stats.hp) {
        opponent.recover(dmg, user, this, "seeder");
      }

      if (user.base.status === "tox") {
        user.v.counter++;
      }
      return dead;
    };

    if (user.base.hp === 0) {
      return;
    } else if ((user.base.status === "tox" || user.base.status === "psn") && tickCounter("psn")) {
      return;
    } else if (user.base.status === "brn" && tickCounter("brn")) {
      return;
    } else if (user.v.hasFlag(VolatileFlag.seeded) && tickCounter("seeded")) {
      return;
    }

    if (user.v.hasFlag(VolatileFlag.nightmare)) {
      if (user.damage(idiv(user.base.stats.hp, 4), user, this, false, "nightmare", true).dead) {
        return;
      }
    }

    if (user.v.hasFlag(VolatileFlag.curse)) {
      if (user.damage(idiv(user.base.stats.hp, 4), user, this, false, "curse", true).dead) {
        return;
      }
    }
  }

  private handleBetweenTurns() {
    const handleScreen = (player: Player, screen: Screen) => {
      if (player.screens[screen] && --player.screens[screen] === 0) {
        this.event({type: "screen", src: player.id, screen, kind: "end"});
      }
    };

    // Future Sight
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

    if (this.checkFaint(this.players[0].active, this.players[1].active)) {
      return;
    }

    // Weather
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

      if (this.checkFaint(this.players[0].active, this.players[1].active)) {
        return;
      }
    }

    // Perish song
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

    if (this.checkFaint(this.players[0].active, this.players[1].active)) {
      return;
    }

    // Defrost
    for (const {active} of this.players) {
      if (!active.v.fainted && active.base.status === "frz" && this.rand100((25 / 256) * 100)) {
        active.unstatus(this, "thaw");
      }
    }

    // Screens
    for (const player of this.players) {
      handleScreen(player, "safeguard");
    }

    for (const player of this.players) {
      handleScreen(player, "light_screen");
      handleScreen(player, "reflect");
    }

    //
    for (const {active} of this.players) {
      if (active.v.hasFlag(VolatileFlag.protect)) {
        this.event({type: "sv", volatiles: [active.clearFlag(VolatileFlag.protect)]});
      }
      if (active.v.hasFlag(VolatileFlag.endure)) {
        this.event({type: "sv", volatiles: [active.clearFlag(VolatileFlag.endure)]});
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
        this.info(active, "encore_end", [{id: active.owner.id, v: {flags: active.v.flags}}]);
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
      move.kind === "damage" ||
      move.kind === "status" ||
      move.kind === "phaze"
    );
  }
}

export class ActivePokemon {
  v: Volatiles;
  lastChosenMove?: Move;
  lastDamage = 0;
  movedThisTurn = false;
  futureSight?: {damage: number; turns: number};

  constructor(public base: Pokemon, public readonly owner: Player) {
    this.base = base;
    this.owner = owner;
    this.v = new Volatiles(base);
  }

  switchTo(next: Pokemon, battle: Battle, why?: "phaze") {
    if (this.base.status === "tox" && battle.gen.id === 1) {
      this.base.status = "psn";
      battle.event({type: "sv", volatiles: [{id: this.owner.id, v: {status: "psn"}}]});
    }

    this.v = new Volatiles(next);
    this.base = next;
    this.applyStatusDebuff();

    const volatiles: ChangedVolatiles = [
      {id: this.owner.id, v: this.v.toClientVolatiles(next, battle)},
    ];
    const {active, id} = battle.opponentOf(this.owner);
    if (active.v.attract === this) {
      active.v.attract = undefined;
      volatiles.push({id, v: {flags: active.v.flags}});
    }
    if (active.v.meanLook === this) {
      active.v.meanLook = undefined;
      volatiles.push({id, v: {flags: active.v.flags}});
    }

    battle.event({
      type: "switch",
      speciesId: next.speciesId,
      hpPercent: hpPercent(next.hp, next.stats.hp),
      hp: next.hp,
      src: this.owner.id,
      name: next.name,
      level: next.level,
      gender: next.gender,
      shiny: next.shiny || undefined,
      indexInTeam: this.owner.team.indexOf(next),
      why,
      volatiles,
    });
  }

  getStat(stat: keyof VolatileStats, isCrit?: boolean, def?: boolean, screen?: boolean) {
    if (!def && isCrit && this.base.transformed) {
      return this.base.real.stats[stat];
    } else if (isCrit) {
      return this.base.stats[stat];
    } else if (screen) {
      return this.v.stats[stat] * 2;
    }
    return this.v.stats[stat];
  }

  faint(battle: Battle) {
    battle.info(this, "faint");
    this.v.fainted = true;
  }

  damage(
    dmg: number,
    src: ActivePokemon,
    battle: Battle,
    isCrit: boolean,
    why: DamageReason,
    direct?: boolean,
    eff?: number,
    volatiles?: ChangedVolatiles,
  ) {
    if (why !== "brn" && why !== "psn" && why !== "seeded" && why !== "substitute") {
      // Counter uses the damage it would've done ignoring substitutes
      this.lastDamage = Math.min(this.base.hp, dmg);
    }

    const shouldRage = why === "attacked" || why === "trap";
    if (this.v.substitute !== 0 && !direct) {
      const hpBefore = this.v.substitute;
      this.v.substitute = Math.max(this.v.substitute - dmg, 0);
      if (this.v.substitute === 0) {
        volatiles ??= [];
        volatiles.push({id: this.owner.id, v: {flags: this.v.flags}});
      }

      const event = battle.event<HitSubstituteEvent>({
        type: "hit_sub",
        src: src.owner.id,
        target: this.owner.id,
        broken: this.v.substitute === 0,
        confusion: why === "confusion",
        eff,
        volatiles,
      });
      if (shouldRage) {
        this.handleRage(battle);
      }
      return {
        event,
        dealt: hpBefore - this.v.substitute,
        brokeSub: this.v.substitute === 0,
        dead: false,
      };
    } else {
      const hpBefore = this.base.hp;
      this.base.hp = Math.max(this.base.hp - dmg, 0);
      const event = battle.event<DamageEvent>({
        type: "damage",
        src: src.owner.id,
        target: this.owner.id,
        hpPercentBefore: hpPercent(hpBefore, this.base.stats.hp),
        hpPercentAfter: hpPercent(this.base.hp, this.base.stats.hp),
        hpBefore,
        hpAfter: this.base.hp,
        why,
        eff,
        isCrit,
        volatiles,
      });

      if (shouldRage) {
        this.handleRage(battle);
      }

      return {event, dealt: hpBefore - this.base.hp, brokeSub: false, dead: this.base.hp === 0};
    }
  }

  recover(amount: number, src: ActivePokemon, battle: Battle, why: RecoveryReason, v = false) {
    const hpBefore = this.base.hp;
    this.base.hp = Math.min(this.base.hp + amount, this.base.stats.hp);
    if (this.base.hp === hpBefore) {
      return;
    }

    const volatiles: ChangedVolatiles = [];
    if (v) {
      volatiles.push({
        id: this.owner.id,
        v: {status: this.base.status || null, stats: {...this.v.stats}},
      });
    }

    battle.event({
      type: "recover",
      src: src.owner.id,
      target: this.owner.id,
      hpPercentBefore: hpPercent(hpBefore, this.base.stats.hp),
      hpPercentAfter: hpPercent(this.base.hp, this.base.stats.hp),
      hpBefore,
      hpAfter: this.base.hp,
      why,
      volatiles,
    });
  }

  clearStatusAndRecalculate() {
    this.base.status = undefined;

    for (const key of stageStatKeys) {
      this.recalculateStat(key, false);
    }
  }

  status(status: Status, battle: Battle, override = false) {
    if (!override && this.base.status) {
      return false;
    }

    if (status === "slp") {
      const opp = battle.opponentOf(this.owner);
      if (opp.sleepClausePoke?.hp && battle.mods.sleepClause) {
        battle.info(this, "fail_sleep_clause");
        return true;
      }

      this.v.recharge = undefined;
      this.base.sleepTurns = battle.gen.getSleepTurns(battle);
      opp.sleepClausePoke = this.base;
    } else if (status === "tox") {
      this.v.counter = 1;
    } else if (status === "frz") {
      if (battle.weather?.kind === "sun") {
        return false;
      } else if (battle.mods.freezeClause && this.owner.team.some(poke => poke.status === "frz")) {
        return true;
      }
    }

    this.base.status = status;
    this.applyStatusDebuff();
    battle.event({
      type: "status",
      src: this.owner.id,
      status,
      volatiles: [{id: this.owner.id, v: {stats: {...this.v.stats}, status}}],
    });

    return true;
  }

  unstatus(battle: Battle, why: InfoReason) {
    this.base.status = undefined;
    if (battle.gen.id === 1 && why === "thaw") {
      this.v.hazed = true;
    }
    this.v.clearFlag(VolatileFlag.nightmare);
    return battle.info(this, why, [{id: this.owner.id, v: {status: null, flags: this.v.flags}}]);
  }

  setStage(
    stat: Stages,
    value: number,
    battle: Battle,
    negative: boolean,
    opponent?: ActivePokemon,
  ) {
    this.v.stages[stat] = value;

    opponent ??= battle.opponentOf(this.owner).active;
    if (stageStatKeys.includes(stat)) {
      this.recalculateStat(stat, negative);

      if (battle.gen.id !== 1) {
        this.applyStatusDebuff();
      }
    }

    const v: ChangedVolatiles = [
      {id: this.owner.id, v: {stats: {...this.v.stats}, stages: {...this.v.stages}}},
    ];
    if (battle.gen.id === 1) {
      // https://bulbapedia.bulbagarden.net/wiki/List_of_battle_glitches_(Generation_I)#Stat_modification_errors
      opponent.applyStatusDebuff();
      v.push({id: opponent.owner.id, v: {stats: {...opponent.v.stats}}});
    }

    return v;
  }

  modStages(mods: [Stages, number][], battle: Battle, opponent?: ActivePokemon) {
    mods = mods.filter(([stat]) => Math.abs(this.v.stages[stat]) !== 6);
    for (const [stat, count] of mods) {
      battle.event({
        type: "stages",
        src: this.owner.id,
        stat,
        count,
        volatiles: this.setStage(
          stat,
          clamp(this.v.stages[stat] + count, -6, 6),
          battle,
          count < 0,
          opponent,
        ),
      });
    }
    return mods.length !== 0;
  }

  confuse(battle: Battle, thrashing?: true) {
    if (!thrashing && this.v.confusion) {
      return false;
    }

    this.v.confusion = battle.rng.int(2, 5);
    if (!thrashing) {
      battle.info(this, "became_confused", [{id: this.owner.id, v: {flags: this.v.flags}}]);
    }
    return true;
  }

  handleRage(battle: Battle) {
    if (
      this.base.hp &&
      this.v.thrashing?.move === battle.gen.moveList.rage &&
      this.v.stages.atk < 6
    ) {
      battle.info(this, "rage");
      this.modStages([["atk", +1]], battle);
    }
  }

  applyStatusDebuff() {
    if (this.base.status === "brn") {
      this.v.stats.atk = Math.max(Math.floor(this.v.stats.atk / 2), 1);
    } else if (this.base.status === "par") {
      this.v.stats.spe = Math.max(Math.floor(this.v.stats.spe / 4), 1);
    }
  }

  recalculateStat(stat: keyof VolatileStats, negative: boolean) {
    this.v.stats[stat] = Math.floor(
      (this.base.stats[stat] * stageMultipliers[this.v.stages[stat]]) / 100,
    );
    // https://www.smogon.com/rb/articles/rby_mechanics_guide#stat-mechanics
    if (negative) {
      this.v.stats[stat] %= 1024;
    } else {
      this.v.stats[stat] = clamp(this.v.stats[stat], 1, 999);
    }
  }

  getOptions(battle: Battle): Options | undefined {
    if (battle.finished || (!battle.opponentOf(this.owner).active.base.hp && this.base.hp)) {
      return;
    }

    if (battle.leadTurn) {
      return {canSwitch: true, moves: []};
    }

    // send all moves so PP can be updated
    const moves = this.base.moves.map((m, i) => {
      const move = this.v.mimic?.indexInMoves === i ? this.v.mimic?.move : m;
      return {
        move,
        pp: this.base.pp[i],
        valid: battle.gen.isValidMove(battle, this, move, i),
        indexInMoves: i,
        display: true,
      } as MoveOption;
    });

    const lockedIn = this.v.lockedIn();
    if (this.v.fainted) {
      moves.forEach(move => (move.valid = false));
    } else if (moves.every(move => !move.valid)) {
      // Two-turn moves, thrashing moves, and recharging skip the normal move selection menu
      moves.forEach(move => (move.display = false));
      moves.push({
        move: lockedIn ? battle.moveIdOf(lockedIn)! : "struggle",
        valid: true,
        display: true,
      });
    }

    if (this.base.transformed) {
      const original = this.base.real;
      original.moves.forEach((move, i) => {
        moves.push({move, pp: original.pp[i], valid: false, display: false, indexInMoves: i});
      });
    }

    const moveLocked = !!(this.v.bide || this.v.trapping);
    const meanLook = !!this.v.meanLook;
    return {canSwitch: ((!lockedIn || moveLocked) && !meanLook) || this.v.fainted, moves};
  }

  setVolatile<T extends keyof Volatiles>(key: T, val: Volatiles[T]) {
    this.v[key] = val;
    if (key === "types" && arraysEqual(this.v.types, this.base.species.types)) {
      return {id: this.owner.id, v: {[key]: null}} as const;
    } else {
      return {id: this.owner.id, v: {[key]: structuredClone(val)}} as const;
    }
  }

  setFlag(flag: VolatileFlag) {
    this.v.setFlag(flag);
    return {id: this.owner.id, v: {flags: this.v.flags}};
  }

  clearFlag(flag: VolatileFlag) {
    this.v.clearFlag(flag);
    return {id: this.owner.id, v: {flags: this.v.flags}};
  }
}

export type VolatileStats = Volatiles["stats"];

class Volatiles {
  stages = {atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0};
  stats: Record<StatStages, number>;
  types: Type[];
  substitute = 0;
  confusion = 0;
  counter = 1;
  flinch = false;
  invuln = false;
  hazed = false;
  trapped = false;
  fainted = false;
  protectCount = 0;
  perishCount = 0;
  meanLook?: ActivePokemon;
  attract?: ActivePokemon;
  lastMove?: Move;
  lastMoveIndex?: number;
  charging?: Move;
  recharge?: Move;
  thrashing?: {move: Move; turns: number; acc?: number};
  bide?: {move: Move; turns: number; dmg: number};
  disabled?: {turns: number; indexInMoves: number};
  encore?: {turns: number; indexInMoves: number};
  mimic?: {move: MoveId; indexInMoves: number};
  trapping?: {move: Move; turns: number};
  private _flags = VolatileFlag.none;

  constructor(base: Pokemon) {
    this.types = [...base.species.types];
    this.stats = {
      atk: base.stats.atk,
      def: base.stats.def,
      spa: base.stats.spa,
      spd: base.stats.spd,
      spe: base.stats.spe,
    };
  }

  lockedIn() {
    return (
      this.recharge ||
      this.charging ||
      this.thrashing?.move ||
      this.bide?.move ||
      this.trapping?.move
    );
  }

  setFlag(flag: VolatileFlag) {
    this._flags |= flag;
  }

  clearFlag(flag: VolatileFlag) {
    this._flags &= ~flag;
  }

  hasFlag(flag: VolatileFlag) {
    return (this.flags & flag) !== 0;
  }

  toClientVolatiles(base: Pokemon, battle: Battle): ChangedVolatiles[number]["v"] {
    return {
      status: base.status || null,
      stages: {...this.stages},
      stats: {...this.stats},
      charging: this.charging ? battle.moveIdOf(this.charging) : undefined,
      types: !arraysEqual(this.types, base.species.types) ? [...this.types] : undefined,
      flags: this.flags,
      perishCount: this.perishCount,
    };
  }

  get flags() {
    let flags = this._flags;
    if (this.disabled) {
      flags |= VolatileFlag.disabled;
    }
    if (this.attract) {
      flags |= VolatileFlag.attract;
    }
    if (this.confusion) {
      flags |= VolatileFlag.confused;
    }
    if (this.substitute) {
      flags |= VolatileFlag.substitute;
    }
    if (this.encore) {
      flags |= VolatileFlag.encore;
    }
    if (this.meanLook) {
      flags |= VolatileFlag.meanLook;
    }
    return flags;
  }
}
