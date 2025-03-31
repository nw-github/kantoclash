import type {
  HitSubstituteEvent,
  DamageEvent,
  DamageReason,
  RecoveryReason,
  InfoReason,
  ChangedVolatiles,
} from "./events";
import type {MoveId, Move, DamagingMove} from "./moves";
import type {Pokemon, Status} from "./pokemon";
import {
  arraysEqual,
  clamp,
  hpPercent,
  stageMultipliers,
  stageStatKeys,
  VF,
  type Stages,
  type StatStages,
  type Type,
} from "./utils";
import {TurnType, type Battle, type MoveOption, type Options, type Player} from "./battle";

export type DamageParams = {
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
        VF.lightScreen |
        VF.reflect |
        VF.mist |
        VF.focus |
        VF.seeded |
        VF.curse |
        VF.foresight |
        VF.lockon;
      this.v.setFlag(old.cflags & passedFlags);

      // Is trapping passed? Encore? Nightmare?

      for (const stat of stageStatKeys) {
        this.recalculateStat(battle, stat, false, false);
      }
    }

    this.applyStatusDebuff();

    const v: ChangedVolatiles[number]["v"] = {};

    const {active: opp, id} = battle.opponentOf(this.owner);
    if (opp.v.attract === this) {
      opp.v.attract = undefined;
      v.flags = opp.v.cflags;
    }
    if (opp.v.meanLook === this) {
      opp.v.meanLook = undefined;
      v.flags = opp.v.cflags;
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
        {id: this.owner.id, v: this.getClientVolatiles(next, battle)},
        ...(Object.keys(v).length ? [{id, v}] : []),
      ],
    });

    if (
      opp.v.trapped &&
      opp.v.trapped.turns !== -1 &&
      opp.v.trapped.user === this &&
      !opp.v.fainted
    ) {
      battle.event({
        type: "trap",
        src: opp.owner.id,
        target: opp.owner.id,
        kind: "end",
        move: battle.moveIdOf(opp.v.trapped.move)!,
        volatiles: [{id: opp.owner.id, v: {trapped: null}}],
      });
      opp.v.trapped = undefined;
    }

    if (this.base.item === "berserkgene") {
      battle.event({type: "item", item: "berserkgene", src: this.owner.id});
      this.modStages([["atk", +2]], battle);
      // BUG GEN2: If you baton pass into a pokemon with a berserk gene, the confusion value
      // is not updated.
      this.confuse(battle, undefined, 256);
      this.base.item = undefined;
    }

    if (this.owner.spikes && !this.v.types.includes("flying")) {
      this.damage(Math.floor(this.base.stats.hp / 8), this, battle, false, "spikes", true);
    }
  }

  faint(battle: Battle) {
    battle.info(this, "faint", [
      this.clearFlag(VF.protect | VF.mist | VF.lightScreen | VF.reflect),
    ]);
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
      battle.gen1LastDamage = Math.min(this.base.hp, dmg);
    }

    const shouldRage = why === "attacked" || why === "trap";
    if (this.v.substitute !== 0 && !direct) {
      const hpBefore = this.v.substitute;
      this.v.substitute = Math.max(this.v.substitute - dmg, 0);
      if (this.v.substitute === 0) {
        volatiles ??= [];
        volatiles.push({id: this.owner.id, v: {flags: this.v.cflags}});
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

      const dealt = hpBefore - this.base.hp;
      if (shouldRage) {
        this.handleRage(battle);
        this.v.retaliateDamage = dealt;
      }

      return {event, dealt, brokeSub: false, dead: this.base.hp === 0};
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
        v: {status: this.base.status || null, stats: this.clientStats(battle)},
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

  clearStatusAndRecalculate(battle: Battle) {
    this.base.status = undefined;

    for (const key of stageStatKeys) {
      this.recalculateStat(battle, key, false, true);
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

      if (battle.gen.id === 1) {
        this.v.recharge = undefined;
      }
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
      volatiles: [{id: this.owner.id, v: {stats: this.clientStats(battle), status}}],
    });

    return true;
  }

  unstatus(battle: Battle, why: InfoReason) {
    this.base.status = undefined;
    this.v.hazed = this.v.hazed || why === "thaw";
    this.v.clearFlag(VF.nightmare);
    return battle.info(this, why, [{id: this.owner.id, v: {status: null, flags: this.v.cflags}}]);
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
      this.recalculateStat(battle, stat, negative);
    }

    const v: ChangedVolatiles = [
      {id: this.owner.id, v: {stats: this.clientStats(battle), stages: {...this.v.stages}}},
    ];
    if (battle.gen.id === 1) {
      // https://bulbapedia.bulbagarden.net/wiki/List_of_battle_glitches_(Generation_I)#Stat_modification_errors
      opponent.applyStatusDebuff();
      v.push({id: opponent.owner.id, v: {stats: opponent.clientStats(battle)}});
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

  confuse(battle: Battle, reason?: InfoReason, turns?: number) {
    if (reason !== "cConfusedFatigue" && reason !== "cConfusedFatigueMax" && this.v.confusion) {
      return false;
    }

    this.v.confusion = turns ?? battle.rng.int(2, 5) + 1;
    battle.info(this, reason ?? "cConfused", [{id: this.owner.id, v: {flags: this.v.cflags}}]);
    return true;
  }

  handleRage(battle: Battle) {
    if (
      !this.v.fainted &&
      this.v.thrashing?.move === battle.gen.moveList.rage &&
      this.v.stages.atk < 6
    ) {
      battle.info(this, "rage");
      this.modStages([["atk", +1]], battle);
    } else if (
      battle.gen.id >= 2 &&
      !this.v.fainted &&
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

  recalculateStat(battle: Battle, stat: StatStages, negative: boolean, status?: boolean) {
    this.v.stats[stat] = Math.floor(
      (this.base.stats[stat] * stageMultipliers[this.v.stages[stat]]) / 100,
    );

    if (status ?? battle.gen.id !== 1) {
      if (this.base.status === "brn" && stat === "atk") {
        this.v.stats.atk = Math.max(Math.floor(this.v.stats.atk / 2), 1);
      } else if (this.base.status === "par" && stat === "spe") {
        this.v.stats.spe = Math.max(Math.floor(this.v.stats.spe / 4), 1);
      }
    }

    // https://www.smogon.com/rb/articles/rby_mechanics_guide#stat-mechanics
    if (negative && battle.gen.id === 1) {
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

  setFlag(flag: VF) {
    this.v.setFlag(flag);
    return {id: this.owner.id, v: {flags: this.v.cflags}};
  }

  clearFlag(flag: VF) {
    this.v.clearFlag(flag);
    return {id: this.owner.id, v: {flags: this.v.cflags}};
  }

  clientStats(battle: Battle) {
    if (!this.base.transformed) {
      return Object.fromEntries(
        stageStatKeys.map(key => [key, battle.gen.getStat(this, key)]),
      ) as VolatileStats;
    }
  }

  getClientVolatiles(base: Pokemon, battle: Battle): ChangedVolatiles[number]["v"] {
    return {
      status: base.status || null,
      stages: {...this.v.stages},
      stats: this.clientStats(battle),
      charging: this.v.charging ? battle.moveIdOf(this.v.charging) : undefined,
      trapped: this.v.trapped ? battle.moveIdOf(this.v.trapped.move) : undefined,
      types: !arraysEqual(this.v.types, base.species.types) ? [...this.v.types] : undefined,
      flags: this.v.cflags,
      perishCount: this.v.perishCount,
    };
  }
}

export type VolatileStats = Volatiles["stats"];

class Volatiles {
  stages = {atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0};
  stats: Record<StatStages, number>;
  types: Type[];
  substitute = 0;
  confusion = 0;
  counter = 0;
  flinch = false;
  invuln = false;
  hazed = false;
  fainted = false;
  inPursuit = false;
  inBatonPass = false;
  usedDefenseCurl = false;
  usedMinimize = false;
  protectCount = 0;
  perishCount = 0;
  rollout = 0;
  rage = 1;
  furyCutter = 0;
  retaliateDamage = 0;
  meanLook?: ActivePokemon;
  attract?: ActivePokemon;
  lastHitBy?: Move;
  lastMove?: Move;
  lastMoveIndex?: number;
  charging?: Move;
  recharge?: Move;
  thrashing?: {move: DamagingMove; turns: number; max: boolean; acc?: number};
  bide?: {move: Move; turns: number; dmg: number};
  disabled?: {turns: number; indexInMoves: number};
  encore?: {turns: number; indexInMoves: number};
  mimic?: {move: MoveId; indexInMoves: number};
  trapping?: {move: Move; turns: number};
  trapped?: {user: ActivePokemon; move: Move; turns: number};
  private _flags = VF.none;

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

  setFlag(flag: VF) {
    this._flags |= flag;
  }

  clearFlag(flag: VF) {
    this._flags &= ~flag;
  }

  hasFlag(flag: VF) {
    return (this.cflags & flag) !== 0;
  }

  get cflags() {
    let flags = this._flags;
    if (this.disabled) {
      flags |= VF.cDisabled;
    }
    if (this.attract) {
      flags |= VF.cAttract;
    }
    if (this.confusion) {
      flags |= VF.cConfused;
    }
    if (this.substitute) {
      flags |= VF.cSubstitute;
    }
    if (this.encore) {
      flags |= VF.cEncore;
    }
    if (this.meanLook) {
      flags |= VF.cMeanLook;
    }
    return flags;
  }
}
