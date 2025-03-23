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
import type {MoveId, Move, DamagingMove} from "./moves";
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

type ChosenMove = {move: Move; indexInMoves?: number; user: ActivePokemon; target: ActivePokemon};

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

enum TurnType {
  Lead,
  Switch,
  Normal,
  BatonPass,
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

    if (this.turnType === TurnType.Normal) {
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

    if (this.turnType === TurnType.Lead) {
      this.turnType = TurnType.Switch;
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
    if (target.v.hasFlag(VolatileFlag.foresight)) {
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
    if (target.v.hasFlag(VolatileFlag.lockon)) {
      this.event({type: "sv", volatiles: [target.clearFlag(VolatileFlag.lockon)]});

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
    // eslint-disable-next-line prefer-const
    for (let {move, user, target, indexInMoves} of choices) {
      user.movedThisTurn = true;
      if (user.v.hasFlag(VolatileFlag.destinyBond)) {
        this.event({type: "sv", volatiles: [user.clearFlag(VolatileFlag.destinyBond)]});
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
          break;
        }

        user.v.protectCount = 0;
        continue;
      }

      const faintedBetweenTurns = user.v.faintedBetweenTurns;

      this.callUseMove(move, user, target, indexInMoves);
      if (this.turnType !== TurnType.Switch) {
        if (user.v.inBatonPass) {
          return;
        }

        if (this.checkFaint(user, target)) {
          break;
        }

        this.handleResidualDamage(user);
        if (this.checkFaint(user, target)) {
          break;
        }
      } else {
        if (!faintedBetweenTurns) {
          if (this.checkFaint(user, target)) {
            break;
          }
        } else if (user.base.hp === 0) {
          // https://www.youtube.com/watch?v=1IiPWw5fMf8&t=85s
          // TODO: This implements the bug where spikes does not check if the pokemon it damaged
          // fainted, demonstrated here ()
          // The way we have this set up right now, this bug is also triggered by for example:
          //    - Explosion, then switch into Pokemon that dies from spikes
          //    - Die to recoil, then switch into Pokemon that dies from spikes
          //
          this.event({type: "bug", bug: "bug_gen2_spikes"});
        }
      }
    }

    if (this.turnType !== TurnType.Switch) {
      this.handleBetweenTurns();
    }

    for (const player of this.players) {
      player.active.v.hazed = false;
      player.active.v.flinch = false;
      player.active.v.inPursuit = false;
      player.active.movedThisTurn = false;
      if (
        this.gen.id === 1 &&
        player.active.v.trapped &&
        !this.opponentOf(player).active.v.trapping
      ) {
        player.active.v.trapped = undefined;
      }
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

      if (user.v.lastMoveIndex !== moveIndex) {
        user.v.rage = 1;
        user.v.furyCutter = 0;
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
      thrashing: user.v.thrashing && user.v.thrashing.move.flag !== "rollout" ? true : undefined,
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

  checkFaint(user: ActivePokemon, target: ActivePokemon, betweenTurns = false) {
    let fainted = false;
    if (target.base.hp === 0 && !target.v.fainted) {
      target.faint(this);
      target.v.faintedBetweenTurns = betweenTurns;
      if (!this.victor && target.owner.areAllDead()) {
        this.victor = user.owner;
      }
      fainted = true;
    }

    if (user.base.hp === 0 && !user.v.fainted) {
      user.faint(this);
      user.v.faintedBetweenTurns = betweenTurns;
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

    if (this.checkFaint(this.players[0].active, this.players[1].active, true)) {
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

      if (this.checkFaint(this.players[0].active, this.players[1].active, true)) {
        return;
      }
    }

    // Partial trapping
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

    if (this.checkFaint(this.players[0].active, this.players[1].active, true)) {
      return;
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

    if (this.checkFaint(this.players[0].active, this.players[1].active, true)) {
      return;
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
      move.kind === "status" ||
      move.kind === "phaze"
    );
  }
}

type DamageParams = {
  dmg: number;
  src: ActivePokemon;
  why: DamageReason;
  isCrit?: boolean;
  direct?: boolean;
  eff?: number;
  move?: MoveId;
  volatiles?: ChangedVolatiles;
};

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

  switchTo(next: Pokemon, battle: Battle, why?: "phaze" | "baton_pass") {
    if (this.base.status === "tox" && battle.gen.id <= 2) {
      this.base.status = "psn";
      battle.event({type: "sv", volatiles: [{id: this.owner.id, v: {status: "psn"}}]});
    }

    const old = this.v;
    this.v = new Volatiles(next);
    this.base = next;

    if (why === "baton_pass") {
      this.v.substitute = old.substitute;
      this.v.stages = old.stages;
      this.v.confusion = old.confusion;
      this.v.perishCount = old.perishCount;
      this.v.meanLook = old.meanLook;
      this.v.counter = old.counter;

      const passedFlags =
        VolatileFlag.light_screen |
        VolatileFlag.reflect |
        VolatileFlag.mist |
        VolatileFlag.focus |
        VolatileFlag.seeded |
        VolatileFlag.curse |
        VolatileFlag.foresight |
        VolatileFlag.lockon;
      this.v.setFlag(old.flags & passedFlags);

      // Is trapping passed? Encore? Nightmare?

      for (const stat of stageStatKeys) {
        this.recalculateStat(stat, false);
      }
    }

    this.applyStatusDebuff();

    const v: ChangedVolatiles[number]["v"] = {};

    const {active, id} = battle.opponentOf(this.owner);
    if (active.v.attract === this) {
      active.v.attract = undefined;
      v.flags = active.v.flags;
    }
    if (active.v.meanLook === this) {
      active.v.meanLook = undefined;
      v.flags = active.v.flags;
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
      volatiles: [
        {id: this.owner.id, v: this.v.toClientVolatiles(next, battle)},
        ...(Object.keys(v).length ? [{id, v}] : []),
      ],
    });

    if (active.v.trapped && active.v.trapped.user === this) {
      battle.event({
        type: "trap",
        src: active.owner.id,
        target: active.owner.id,
        kind: "end",
        move: battle.moveIdOf(active.v.trapped.move)!,
        volatiles: [{id, v: {trapped: null}}],
      });
      active.v.trapped = undefined;
    }

    if (this.owner.spikes && !this.v.types.includes("flying")) {
      this.damage(Math.floor(this.base.stats.hp / 8), this, battle, false, "spikes", true);
    }
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
    return this.damage2(battle, {dmg, src, isCrit, why, direct, eff, volatiles});
  }

  damage2(battle: Battle, {dmg, src, isCrit, why, direct, eff, volatiles, move}: DamageParams) {
    if (
      why === "crash" ||
      why === "attacked" ||
      why === "recoil" ||
      why === "ohko" ||
      why === "confusion" ||
      why === "trap"
    ) {
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
        move,
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
    } else if (
      battle.gen.id >= 2 &&
      this.v.lastMove?.kind === "damage" &&
      this.v.lastMove.flag === "rage"
    ) {
      battle.info(this, "rage");
      this.v.rage++;
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
    if (battle.finished || (battle.opponentOf(this.owner).active.v.fainted && !this.v.fainted)) {
      return;
    } else if (battle.turnType === TurnType.Lead) {
      return {canSwitch: true, moves: []};
    } else if (battle.turnType === TurnType.BatonPass) {
      return this.v.inBatonPass ? {canSwitch: true, moves: []} : undefined;
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
    const cantEscape = !!this.v.meanLook || (battle.gen.id >= 2 && !!this.v.trapped);
    return {canSwitch: ((!lockedIn || moveLocked) && !cantEscape) || this.v.fainted, moves};
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
  fainted = false;
  faintedBetweenTurns = false;
  inPursuit = false;
  inBatonPass = false;
  usedDefenseCurl = false;
  usedMinimize = false;
  protectCount = 0;
  perishCount = 0;
  rollout = 0;
  rage = 1;
  furyCutter = 0;
  meanLook?: ActivePokemon;
  attract?: ActivePokemon;
  lastMove?: Move;
  lastMoveIndex?: number;
  charging?: Move;
  recharge?: Move;
  thrashing?: {move: DamagingMove; turns: number; acc?: number};
  bide?: {move: Move; turns: number; dmg: number};
  disabled?: {turns: number; indexInMoves: number};
  encore?: {turns: number; indexInMoves: number};
  mimic?: {move: MoveId; indexInMoves: number};
  trapping?: {move: Move; turns: number};
  trapped?: {user: ActivePokemon; move: Move; turns: number};
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
      trapped: this.trapped ? battle.moveIdOf(this.trapped.move) : undefined,
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
