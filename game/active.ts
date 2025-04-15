import type {
  HitSubstituteEvent,
  DamageEvent,
  DamageReason,
  RecoveryReason,
  InfoReason,
  ChangedVolatiles,
  PokeId,
} from "./events";
import {type MoveId, type Move, type DamagingMove, Range, type FutureSightMove} from "./moves";
import {
  natureTable,
  transform,
  type CastformForm,
  type FormId,
  type Pokemon,
  type Status,
} from "./pokemon";
import {
  arraysEqual,
  clamp,
  hpPercent,
  idiv,
  stageKeys,
  stageStatKeys,
  VF,
  type StageId,
  type StageStats,
  type StatStageId,
  type Type,
  type Weather,
} from "./utils";
import {TurnType, type Battle, type MoveOption, type Options, type Player} from "./battle";
import {abilityList, type AbilityId} from "./species";
import {healBerry, healPinchBerry, ppBerry, statPinchBerry, statusBerry, type ItemId} from "./item";

export type DamageParams = {
  dmg: number;
  src: ActivePokemon;
  why: DamageReason;
  isCrit?: bool;
  direct?: bool;
  eff?: number;
  move?: MoveId;
  volatiles?: ChangedVolatiles;
};

export type ChosenMove = {
  move: Move;
  indexInMoves?: number;
  target?: ActivePokemon;
  isReplacement: bool;
  spe: number;
  executed: bool;
};

export class ActivePokemon {
  v: Volatiles;
  lastChosenMove?: Move;
  futureSight?: {move: FutureSightMove; damage: number; turns: number};
  wish?: {user: Pokemon; turns: number};
  choice?: ChosenMove;
  options?: {switches: number[]; moves: MoveOption[]; id: PokeId};
  consumed?: ItemId;
  id: PokeId;

  constructor(public base: Pokemon, public readonly owner: Player, idx: number) {
    this.v = new Volatiles(base);
    this.id = `${this.owner.id}:${idx}`;
  }

  switchTo(next: Pokemon, battle: Battle, why?: "phaze" | "baton_pass") {
    if (this.choice) {
      this.choice.executed = true;
    }

    if (this.base.status === "tox" && battle.gen.id <= 2) {
      this.base.status = "psn";
      battle.event({type: "sv", volatiles: [{id: this.id, v: {status: "psn"}}]});
    }

    if (this.base.status && this.v.ability === "naturalcure" && !this.v.fainted) {
      battle.ability(this);
      this.unstatus(battle);
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
      this.v.seededBy = old.seededBy;

      let passedFlags =
        VF.lightScreen |
        VF.reflect |
        VF.mist |
        VF.focusEnergy |
        VF.curse |
        VF.identified |
        VF.lockon |
        VF.ingrain;
      if (battle.gen.id >= 3) {
        passedFlags &= ~VF.identified;
      }

      this.v.setFlag(old.cflags & passedFlags);

      // Is trapping passed? Encore? Nightmare?

      for (const stat of stageStatKeys) {
        this.recalculateStat(battle, stat, false);
      }
    }

    this.applyStatusDebuff();

    battle.event({
      type: "switch",
      speciesId: next.speciesId,
      hpPercent: hpPercent(next.hp, next.stats.hp),
      hp: next.hp,
      src: this.id,
      name: next.name,
      level: next.level,
      gender: next.gender,
      shiny: next.shiny || undefined,
      form: next.form,
      indexInTeam: this.owner.team.indexOf(next),
      why,
      volatiles: [{id: this.id, v: this.getClientVolatiles(next, battle)}],
    });

    this.freeOpponents(battle);

    if (this.base.item === "berserkgene") {
      battle.event({type: "item", item: "berserkgene", src: this.id});
      this.modStages([["atk", +2]], battle);
      // BUG GEN2: If you baton pass into a pokemon with a berserk gene, the confusion value
      // is not updated.
      this.confuse(battle, undefined, 256);
      this.consumeItem();
    }

    if (this.owner.spikes && this.isGrounded()) {
      const mod = 8 - (this.owner.spikes - 1) * 2;
      this.damage(Math.floor(this.base.stats.hp / mod), this, battle, false, "spikes", true);
      if (this.base.hp === 0) {
        return;
      }
    }

    if (battle.turnType !== TurnType.Lead) {
      this.handleWeatherAbility(battle);
      this.handleSwitchInAbility(battle);
    }
  }

  consumeItem() {
    this.consumed = this.base.item;
    this.base.item = undefined;
  }

  faint(battle: Battle) {
    this.v.fainted = true;
    this.v.clearFlag(VF.protect | VF.mist | VF.lightScreen | VF.reflect);
    battle.info(
      this,
      "faint",
      battle.allActive.map(p => ({
        id: p.id,
        v: {stats: p.clientStats(battle), flags: p === this ? p.v.cflags : undefined},
      })),
    );

    this.freeOpponents(battle);
  }

  freeOpponents(battle: Battle) {
    const {active: oppActive} = battle.opponentOf(this.owner);
    for (const opp of oppActive) {
      let changed = false;
      if (opp.v.attract === this) {
        opp.v.attract = undefined;
        changed = true;
      }
      if (opp.v.meanLook === this) {
        opp.v.meanLook = undefined;
        changed = true;
      }
      if (changed) {
        battle.event({type: "sv", volatiles: [{id: opp.id, v: {flags: opp.v.cflags}}]});
      }

      if (
        opp.v.trapped &&
        opp.v.trapped.turns !== -1 &&
        opp.v.trapped.user === this &&
        !opp.v.fainted
      ) {
        battle.event({
          type: "trap",
          src: opp.id,
          target: opp.id,
          kind: "end",
          move: battle.moveIdOf(opp.v.trapped.move)!,
          volatiles: [{id: opp.id, v: {trapped: null}}],
        });
        opp.v.trapped = undefined;
      }
    }
  }

  transform(battle: Battle, target: ActivePokemon) {
    this.base = transform(this.base.real, target.base);
    // TODO: is this right? or should you continue to be locked into the move if the transform
    // moveset has it?
    this.v.choiceLock = undefined;

    for (const k of stageKeys) {
      this.v.stages[k] = target.v.stages[k];
      if (stageStatKeys.includes(k)) {
        this.recalculateStat(battle, k, false);
      }
    }

    this.v.types = [...target.v.types];
    this.v.form = target.v.form;
    battle.event({
      type: "transform",
      src: this.id,
      target: target.id,
      speciesId: this.base.speciesId,
      shiny: this.base.shiny,
      gender: this.base.gender,
      form: this.v.form,
      volatiles: [{id: this.id, v: this.getClientVolatiles(this.base, battle)}],
    });
  }

  damage(
    dmg: number,
    src: ActivePokemon,
    battle: Battle,
    isCrit: bool,
    why: DamageReason,
    direct?: bool,
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
        volatiles.push({id: this.id, v: {flags: this.v.cflags}});
      }

      const event = battle.event<HitSubstituteEvent>({
        type: "hit_sub",
        src: src.id,
        target: this.id,
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
        src: src.id,
        target: this.id,
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
    if ((why === "seeder" || why === "drain") && src !== this && src.v.ability === "liquidooze") {
      battle.ability(src);
      return this.damage2(battle, {dmg: amount, src, why: "roughskin"});
    }

    const hpBefore = this.base.hp;
    this.base.hp = Math.min(this.base.hp + amount, this.base.stats.hp);
    if (this.base.hp === hpBefore) {
      return;
    }

    const volatiles: ChangedVolatiles = [];
    if (v) {
      volatiles.push({
        id: this.id,
        v: {status: this.base.status || null, stats: this.clientStats(battle)},
      });
    }

    battle.event({
      type: "recover",
      src: src.id,
      target: this.id,
      hpPercentBefore: hpPercent(hpBefore, this.base.stats.hp),
      hpPercentAfter: hpPercent(this.base.hp, this.base.stats.hp),
      hpBefore,
      hpAfter: this.base.hp,
      why,
      volatiles,
    });
  }

  status(
    status: Status,
    battle: Battle,
    src: ActivePokemon,
    {override, loud, ignoreSafeguard}: {override?: bool; loud?: bool; ignoreSafeguard?: bool},
  ) {
    if (!override && this.base.status) {
      if (loud) {
        battle.info(this, "fail_generic");
      }
      return;
    }

    if (this.owner.screens.safeguard && !ignoreSafeguard) {
      if (loud) {
        battle.info(this, "safeguard_protect");
      }
      return;
    }

    const statusNoTox = status === "tox" ? "psn" : status;
    if (abilityList[this.v.ability!]?.preventsStatus === statusNoTox) {
      if (loud) {
        battle.ability(this);
        battle.info(this, "immune");
      }
      return;
    }

    if (status === "slp") {
      const opp = battle.opponentOf(this.owner);
      if (opp.sleepClausePoke?.hp && battle.mods.sleepClause) {
        return battle.info(this, "fail_sleep_clause");
      }

      if (battle.gen.id === 1) {
        this.v.recharge = undefined;
      }
      this.base.sleepTurns = battle.gen.rng.sleepTurns(battle);
      if (this.v.ability === "earlybird") {
        this.base.sleepTurns = Math.floor(this.base.sleepTurns / 2);
      }

      opp.sleepClausePoke = this.base;
    } else if (status === "tox") {
      this.v.counter = 1;
    } else if (status === "frz") {
      if (battle.hasWeather("sun")) {
        return;
      } else if (battle.mods.freezeClause && this.owner.team.some(poke => poke.status === "frz")) {
        return;
      }
    }

    this.base.status = status;
    this.applyStatusDebuff();
    battle.event({
      type: "status",
      src: this.id,
      status,
      volatiles: [{id: this.id, v: {stats: this.clientStats(battle), status}}],
    });

    if (
      this.v.ability === "synchronize" &&
      src !== this &&
      (statusNoTox === "psn" || statusNoTox === "par" || statusNoTox === "brn")
    ) {
      // Bad poison causes synchronize of regular poison
      battle.ability(this);

      if (
        (status === "brn" && src.v.types.includes("fire")) ||
        ((status === "psn" || status === "tox") && src.v.hasAnyType("poison", "steel"))
      ) {
        battle.info(src, "immune");
      } else {
        src.status(statusNoTox, battle, this, {override: false, loud: true});
      }
    }
  }

  unstatus(battle: Battle, why?: InfoReason) {
    if (!this.base.status) {
      return;
    }

    const opp = battle.opponentOf(this.owner);
    if (opp.sleepClausePoke === this.base) {
      opp.sleepClausePoke = undefined;
    }

    const status = this.base.status;
    this.base.status = undefined;
    this.v.hazed = this.v.hazed || why === "thaw";
    this.v.clearFlag(VF.nightmare);

    const v = [
      {id: this.id, v: {status: null, flags: this.v.cflags, stats: this.clientStats(battle)}},
    ];
    if (why) {
      return battle.info(this, why, v);
    } else {
      return battle.event({type: "cure", src: this.id, status, volatiles: v});
    }
  }

  setStage(stat: StageId, value: number, battle: Battle, negative: bool) {
    this.v.stages[stat] = value;

    if (stageStatKeys.includes(stat)) {
      this.recalculateStat(battle, stat, negative);
    }

    const v: ChangedVolatiles = [
      {id: this.id, v: {stats: this.clientStats(battle), stages: {...this.v.stages}}},
    ];
    if (battle.gen.id === 1) {
      for (const other of battle.allActive) {
        if (other !== this) {
          // https://bulbapedia.bulbagarden.net/wiki/List_of_battle_glitches_(Generation_I)#Stat_modification_errors
          other.applyStatusDebuff();
          v.push({id: other.id, v: {stats: other.clientStats(battle)}});
        }
      }
    }
    return v;
  }

  modStages(mods: [StageId, number][], battle: Battle, src?: ActivePokemon, quiet?: bool) {
    let failed = true;
    for (const [stat, count] of mods) {
      const prevented = abilityList[this.v.ability!]?.preventsStatDrop;
      if (src && src !== this && count < 0 && (prevented === stat || prevented === "all")) {
        failed = false;
        if (!quiet) {
          battle.ability(this);
          battle.event({type: "stages", src: this.id, stat, count: 0});
        }
        continue;
      } else if (count > 0 && this.v.stages[stat] === 6) {
        if (!quiet) {
          battle.event({type: "stages", src: this.id, stat, count: +6});
        }
        continue;
      } else if (count < 0 && this.v.stages[stat] === -6) {
        if (!quiet) {
          battle.event({type: "stages", src: this.id, stat, count: -6});
        }
        continue;
      }

      battle.event({
        type: "stages",
        src: this.id,
        stat,
        count,
        volatiles: this.setStage(
          stat,
          clamp(this.v.stages[stat] + count, -6, 6),
          battle,
          count < 0,
        ),
      });
      failed = false;
    }
    return !failed;
  }

  confuse(battle: Battle, reason?: InfoReason, turns?: number) {
    if (reason !== "cConfusedFatigue" && reason !== "cConfusedFatigueMax" && this.v.confusion) {
      return false;
    }

    this.v.confusion = turns ?? battle.rng.int(2, 5) + 1;
    battle.info(this, reason ?? "cConfused", [{id: this.id, v: {flags: this.v.cflags}}]);
    return true;
  }

  applyAbilityStatBoost(battle: Battle, stat: StatStageId, value: number) {
    if ((this.v.ability === "hugepower" || this.v.ability === "purepower") && stat === "atk") {
      value *= 2;
    }

    if (
      battle.getWeather() &&
      abilityList[this.v.ability!]?.weatherSpeedBoost === battle.getWeather() &&
      stat === "spe"
    ) {
      value *= 2;
    }

    // TODO: the attack boost from guts should activate if the pokemon uses a move that thaws it
    // out
    if (this.v.ability === "guts" && stat === "atk" && this.base.status) {
      value += Math.floor(value / 2);
    }

    if (this.v.ability === "hustle" && stat === "atk") {
      value += Math.floor(value / 2);
    }

    if (this.v.ability === "marvelscale" && stat === "def" && this.base.status) {
      value += Math.floor(value / 2);
    }

    if (stat === "spa" && (this.v.ability === "plus" || this.v.ability === "minus")) {
      let minus = false,
        plus = false;
      for (const poke of battle.allActive) {
        // pre Gen V, plus and minus activate for opponents
        if (!poke.v.fainted) {
          minus = minus || poke.v.ability === "minus";
          plus = plus || poke.v.ability === "plus";
        }
      }

      if ((minus && this.v.ability === "plus") || (plus && this.v.ability === "minus")) {
        value += Math.floor(value / 2);
      }
    }

    return value;
  }

  handleWeatherAbility(battle: Battle) {
    const weather = abilityList[this.v.ability!]?.startsWeather;
    if (weather) {
      battle.ability(this);
      battle.setWeather(weather, -1);
    }
  }

  handleSwitchInAbility(battle: Battle) {
    if (this.v.ability === "intimidate" && !this.v.usedIntimidate) {
      this.v.usedIntimidate = true;
      let procd = false;
      for (const poke of battle.getTargets(this, Range.AllAdjacentFoe)) {
        if (!poke.v.fainted && !poke.v.substitute) {
          if (!procd) {
            battle.ability(this);
            procd = true;
          }

          if (poke.owner.screens.mist) {
            battle.info(poke, "mist_protect");
          }
          poke.modStages([["atk", -1]], battle, this);
        }
      }
    }

    if (this.v.ability === "trace" && !this.v.usedTrace) {
      const target = battle.rng.choice(battle.getTargets(this, Range.AllAdjacentFoe));
      if (target) {
        battle.ability(this);
        this.v.ability = target.v.ability;
        battle.ability(this);
        battle.event({
          type: "trace",
          src: this.id,
          target: target.id,
          ability: this.v.ability!,
          volatiles: [{id: this.id, v: {ability: this.v.ability}}],
        });
      }
    }

    this.handleForecast(battle);

    battle.sv(battle.allActive.map(p => ({id: p.id, v: {stats: p.clientStats(battle)}})));
  }

  handleForecast(battle: Battle) {
    if (this.v.ability !== "forecast" || this.base.speciesId !== "castform") {
      return;
    }

    const types: Record<Weather, Type> = {
      sand: "normal",
      hail: "ice",
      sun: "fire",
      rain: "water",
    };
    const forms: Partial<Record<Weather, CastformForm>> = {
      sun: "sunny",
      rain: "rainy",
      hail: "snowy",
    };

    const type = types[battle.getWeather() ?? "sand"];
    if (!arraysEqual([type], this.v.types)) {
      this.v.form = forms[battle.getWeather() ?? "sand"];
      battle.ability(this);
      battle.event({
        type: "transform",
        src: this.id,
        speciesId: this.base.speciesId,
        shiny: this.base.shiny,
        gender: this.base.gender,
        form: this.v.form,
        volatiles: [this.setVolatile("types", [type])],
      });
    }
  }

  handleConfusion(battle: Battle) {
    if (!this.v.confusion) {
      return false;
    }

    const done = --this.v.confusion === 0;
    const v = [{id: this.id, v: {flags: this.v.cflags}}];
    battle.info(this, done ? "confused_end" : "confused", v);
    if (!done && battle.rng.bool()) {
      const move = this.choice?.move;
      const explosion = move?.kind === "damage" && move.flag === "explosion" ? 2 : 1;
      const [atk, def] = battle.gen.getDamageVariables(false, battle, this, this, false);
      const dmg = battle.gen.calcDamage({
        lvl: this.base.level,
        pow: 40,
        def: Math.max(Math.floor(def / explosion), 1),
        atk,
        eff: 1,
        rand: false,
        isCrit: false,
        hasStab: false,
      });

      this.damage2(battle, {dmg, src: this, why: "confusion", direct: true});
      return true;
    }

    return false;
  }

  handleRage(battle: Battle) {
    if (this.v.fainted) {
      return;
    }

    if (battle.gen.id === 1) {
      if (this.v.thrashing?.move === battle.gen.moveList.rage && this.v.stages.atk < 6) {
        battle.info(this, "rage");
        this.modStages([["atk", +1]], battle);
      }
    } else if (battle.gen.id === 2) {
      if (this.v.lastMove?.kind === "damage" && this.v.lastMove.flag === "rage") {
        battle.info(this, "rage");
        this.v.rage++;
      }
    } else if (battle.gen.id === 3) {
      if (this.v.lastMove?.kind === "damage" && this.v.lastMove.flag === "rage") {
        battle.info(this, "rage");
        this.modStages([["atk", +1]], battle);
      }
    }
  }

  handleShellBell(battle: Battle, dmg: number) {
    if (dmg !== 0 && !this.v.fainted && this.base.item === "shellbell") {
      this.recover(Math.max(1, Math.floor(dmg / 8)), this, battle, "shellbell", false);
    }
  }

  handleLeftovers(battle: Battle) {
    if (!this.v.fainted && this.base.item === "leftovers") {
      this.recover(Math.max(1, idiv(this.base.stats.hp, 16)), this, battle, "leftovers");
    }
  }

  handleBerry(
    battle: Battle,
    {pp, pinch, status, heal}: {pp?: bool; pinch?: bool; status?: bool; heal?: bool},
  ) {
    const cureStatus = (poke: ActivePokemon) => {
      battle.event({type: "item", src: poke.id, item: poke.base.item!});
      poke.unstatus(battle);
      this.consumeItem();
    };

    const cureConfuse = (poke: ActivePokemon) => {
      poke.v.confusion = 0;
      const v = [{id: poke.id, v: {flags: poke.v.cflags}}];
      battle.info(poke, "confused_end", v);
      this.consumeItem();
    };

    if (this.v.fainted) {
      return;
    }

    if (pp) {
      if (ppBerry[this.base.item!]) {
        const slot = this.base.pp.findIndex(pp => pp === 0);
        if (slot !== -1) {
          const move = battle.gen.moveList[this.base.moves[slot]];
          this.base.pp[slot] = Math.min(ppBerry[this.base.item!]!, battle.gen.getMaxPP(move));
          battle.event({type: "item", src: this.id, item: this.base.item!});
          battle.event({type: "pp", src: this.id, move: this.base.moves[slot]});
          this.consumeItem();
        }
      }
    }

    if (status) {
      const status = this.base.status === "tox" ? "psn" : this.base.status;
      if (status && abilityList[this.v.ability!]?.preventsStatus === status) {
        battle.ability(this);
        this.unstatus(battle);
      }

      if (this.v.attract && this.v.ability === "oblivious") {
        this.v.attract = undefined;
        // is this silent?
        battle.ability(this);
        battle.info(this, "cure_attract", [{id: this.id, v: {flags: this.v.cflags}}]);
      }

      if (this.v.confusion && this.v.ability === "owntempo") {
        this.v.confusion = 0;
        battle.ability(this);
        battle.info(this, "confused_end", [{id: this.id, v: {flags: this.v.cflags}}]);
      }

      if (statusBerry[this.base.item!] && statusBerry[this.base.item!] === status) {
        cureStatus(this);
      } else if (statusBerry[this.base.item!] === "any") {
        if (this.base.status) {
          cureStatus(this);
        }

        if (this.v.confusion) {
          if (this.base.item) {
            battle.event({type: "item", src: this.id, item: this.base.item!});
          }
          cureConfuse(this);
        }
      } else if (statusBerry[this.base.item!] === "confuse" && this.v.confusion) {
        battle.event({type: "item", src: this.id, item: this.base.item!});
        cureConfuse(this);
      } else if (this.v.attract && this.base.item === "mentalherb") {
        this.v.attract = undefined;
        battle.event({
          type: "item",
          src: this.id,
          item: this.base.item,
          volatiles: [{id: this.id, v: {flags: this.v.cflags}}],
        });
        battle.info(this, "cure_attract");
        this.consumeItem();
      } else if (Object.values(this.v.stages).some(v => v < 0) && this.base.item === "whiteherb") {
        for (const stage in this.v.stages) {
          if (this.v.stages[stage as StageId] < 0) {
            this.setStage(stage as StageId, 0, battle, false);
          }
        }

        battle.event({
          type: "item",
          src: this.id,
          item: this.base.item,
          volatiles: [
            {id: this.id, v: {stages: {...this.v.stages}, stats: this.clientStats(battle)}},
          ],
        });
        this.consumeItem();
      }
    }

    if (heal) {
      if (healBerry[this.base.item!] && this.base.belowHp(2)) {
        battle.event({type: "item", src: this.id, item: this.base.item!});
        this.recover(healBerry[this.base.item!]!, this, battle, "item");
        this.consumeItem();
      }
    }

    if (pinch) {
      if (healPinchBerry[this.base.item!] && this.base.belowHp(2)) {
        battle.event({type: "item", src: this.id, item: this.base.item!});
        this.recover(Math.max(1, Math.floor(this.base.stats.hp / 8)), this, battle, "item");
        if (this.base.nature !== undefined) {
          const [, minus] = Object.keys(natureTable[this.base.nature]);
          if (minus === healPinchBerry[this.base.item!] && this.v.ability !== "owntempo") {
            this.confuse(battle, "cConfused");
          }
        }
        this.consumeItem();
      } else if (statPinchBerry[this.base.item!] && this.base.belowHp(4)) {
        battle.event({type: "item", src: this.id, item: this.base.item!});
        const stage = statPinchBerry[this.base.item!]!;
        if (stage === "crit") {
          battle.info(this, "focusEnergy", [this.setFlag(VF.focusEnergy)]);
        } else {
          if (stage === "random") {
            this.modStages([[battle.rng.choice([...stageStatKeys])!, +2]], battle);
          } else {
            this.modStages([[stage, +1]], battle);
          }
        }
        this.consumeItem();
      }
    }
  }

  handleWeather(battle: Battle, weather: Weather) {
    if (
      this.v.charging?.move === battle.gen.moveList.dig ||
      this.v.charging?.move === battle.gen.moveList.dive ||
      this.v.fainted
    ) {
      return;
    } else if (
      weather === "sand" &&
      (this.v.types.some(t => t === "steel" || t === "ground" || t === "rock") ||
        this.v.ability === "sandveil")
    ) {
      return;
    } else if (weather === "hail" && this.v.types.includes("ice")) {
      return;
    }

    const d = battle.gen.id <= 2 ? 8 : 16;
    const dmg = Math.max(idiv(this.base.stats.hp, d), 1);
    this.damage(dmg, this, battle, false, weather as "hail" | "sand", true);
  }

  handlePartialTrapping(battle: Battle) {
    if (!this.v.trapped || this.v.trapped.turns === -1 || this.v.fainted) {
      return;
    }

    const move = battle.moveIdOf(this.v.trapped.move)!;
    if (--this.v.trapped.turns === 0) {
      battle.event({
        type: "trap",
        src: this.id,
        target: this.id,
        kind: "end",
        move,
        volatiles: [{id: this.id, v: {trapped: null}}],
      });
      this.v.trapped = undefined;
    } else {
      const dmg = Math.max(idiv(this.base.stats.hp, 16), 1);
      this.damage2(battle, {dmg, src: this, why: "trap_eot", move, direct: true});
    }
  }

  handleEncore(battle: Battle) {
    if (
      !this.v.fainted &&
      this.v.encore &&
      (--this.v.encore.turns === 0 || !this.base.pp[this.v.encore.indexInMoves])
    ) {
      this.v.encore = undefined;
      battle.info(this, "encore_end", [{id: this.id, v: {flags: this.v.cflags}}]);
    }
  }

  handleFutureSight(battle: Battle) {
    if (this.futureSight && --this.futureSight.turns === 0) {
      if (!this.v.fainted) {
        battle.info(this, this.futureSight.move.release);
        if (!battle.checkAccuracy(battle.gen.moveList.futuresight, this, this)) {
          // FIXME: this is lazy
          battle.events.splice(-1, 1);
          battle.info(this, "fail_generic");
        } else {
          this.damage(this.futureSight.damage, this, battle, false, "future_sight");
        }
      }

      this.futureSight = undefined;
    }
  }

  handlePerishSong(battle: Battle) {
    if (this.v.fainted) {
      return;
    }

    if (this.v.perishCount) {
      --this.v.perishCount;

      const volatiles = [{id: this.id, v: {perishCount: this.v.perishCount}}];
      if (this.v.perishCount !== 3) {
        battle.event({type: "perish", src: this.id, turns: this.v.perishCount, volatiles});
      } else {
        battle.event({type: "sv", volatiles});
      }
      if (!this.v.perishCount) {
        this.damage(this.base.hp, this, battle, false, "perish_song", true);
      }
    }
  }

  applyStatusDebuff() {
    if (this.base.status === "brn") {
      this.v.stats.atk = Math.max(Math.floor(this.v.stats.atk / 2), 1);
    } else if (this.base.status === "par") {
      this.v.stats.spe = Math.max(Math.floor(this.v.stats.spe / 4), 1);
    }
  }

  recalculateStat(battle: Battle, stat: StatStageId, negative: bool) {
    this.v.stats[stat] = Math.floor(
      this.base.stats[stat] * battle.gen.stageMultipliers[this.v.stages[stat]],
    );

    // https://www.smogon.com/rb/articles/rby_mechanics_guide#stat-mechanics
    if (negative && battle.gen.id === 1) {
      this.v.stats[stat] %= 1024;
    } else {
      this.v.stats[stat] = clamp(this.v.stats[stat], 1, 999);
    }
  }

  getSwitches(battle: Battle) {
    const switches: number[] = [];
    for (let i = 0; i < this.owner.team.length; i++) {
      const poke = this.owner.team[i];
      if (
        poke.hp !== 0 &&
        (battle.turnType === TurnType.Lead || !this.owner.active.some(a => a.base.real === poke))
      ) {
        switches.push(i);
      }
    }
    return switches;
  }

  canBeReplaced(switches: number[] | Battle) {
    const myPos = this.owner.active.filter(a => a.v.fainted).indexOf(this);
    return myPos < (Array.isArray(switches) ? switches : this.getSwitches(switches)).length;
  }

  getOptions(battle: Battle): Options | undefined {
    const switches = this.getSwitches(battle);
    if (this.v.fainted && !this.canBeReplaced(switches)) {
      return;
    } else if (
      !this.v.fainted &&
      battle.allActive.some(p => p.v.fainted && p.canBeReplaced(battle))
    ) {
      return;
    } else if (battle.turnType === TurnType.Lead) {
      return {switches, moves: [], id: this.id};
    } else if (battle.turnType === TurnType.BatonPass) {
      return this.v.inBatonPass ? {switches, moves: [], id: this.id} : undefined;
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
        targets: getValidTargets(battle, battle.gen.moveList[move], this),
      } as MoveOption;
    });

    const lockedIn = this.v.lockedIn();
    if (this.v.fainted) {
      moves.forEach(move => (move.valid = false));
    } else if (moves.every(move => !move.valid)) {
      // Two-turn moves, thrashing moves, and recharging skip the normal move selection menu
      moves.forEach(move => (move.display = false));

      const move = lockedIn ? battle.moveIdOf(lockedIn)! : "struggle";
      moves.push({
        move,
        valid: true,
        display: true,
        targets: getValidTargets(battle, battle.gen.moveList[move], this),
      });
    }

    if (this.base.transformed) {
      const original = this.base.real;
      original.moves.forEach((move, i) => {
        moves.push({
          move,
          pp: original.pp[i],
          valid: false,
          display: false,
          indexInMoves: i,
          targets: [],
        });
      });
    }

    const moveLocked = !!((this.v.bide && battle.gen.id <= 2) || this.v.trapping);
    const cantEscape = this.cantEscape(battle);
    return {
      switches: ((!lockedIn || moveLocked) && !cantEscape) || this.v.fainted ? switches : [],
      moves,
      id: this.id,
    };
  }

  moveset() {
    if (this.v.mimic) {
      const moves = [...this.base.moves];
      moves[this.v.mimic.indexInMoves] = this.v.mimic.move;
      return moves;
    }
    return this.base.moves;
  }

  isImprisoning(target: ActivePokemon, move: MoveId) {
    return (
      !this.v.fainted &&
      this.owner !== target.owner &&
      this.v.hasFlag(VF.imprisoning) &&
      this.moveset().includes(move)
    );
  }

  isGrounded() {
    return !this.v.types.includes("flying") && this.v.ability !== "levitate";
  }

  cantEscape(battle: Battle) {
    if (
      !!this.v.meanLook ||
      (battle.gen.id >= 2 && !!this.v.trapped) ||
      this.v.hasFlag(VF.ingrain)
    ) {
      return true;
    }

    // FIXME: sending this to the client leaks the pokemon's ability
    for (const poke of battle.getTargets(this, Range.AllAdjacent)) {
      if (poke.v.ability === "magnetpull" && this.v.types.includes("steel")) {
        return true;
      } else if (poke.v.ability === "arenatrap" && poke.owner !== this.owner && this.isGrounded()) {
        return true;
      } else if (poke.v.ability === "shadowtag" && poke.owner !== this.owner) {
        return true;
      }
    }
    return false;
  }

  updateOptions(battle: Battle) {
    this.choice = undefined;
    this.options = this.getOptions(battle);
  }

  setVolatile<T extends keyof Volatiles>(key: T, val: Volatiles[T]) {
    this.v[key] = val;
    if (key === "types" && arraysEqual(this.v.types, this.base.species.types)) {
      return {id: this.id, v: {[key]: null}} as const;
    } else {
      return {id: this.id, v: {[key]: structuredClone(val)}} as const;
    }
  }

  setFlag(flag: VF) {
    this.v.setFlag(flag);
    return {id: this.id, v: {flags: this.v.cflags}};
  }

  clearFlag(flag: VF) {
    this.v.clearFlag(flag);
    return {id: this.id, v: {flags: this.v.cflags}};
  }

  clientStats(battle: Battle) {
    if (!this.base.transformed) {
      return Object.fromEntries(
        stageStatKeys.map(key => [key, battle.gen.getStat(battle, this, key)]),
      ) as StageStats;
    }
  }

  getClientVolatiles(base: Pokemon, battle: Battle): ChangedVolatiles[number]["v"] {
    return {
      status: base.status || null,
      stages: {...this.v.stages},
      stats: this.clientStats(battle),
      charging: this.v.charging ? battle.moveIdOf(this.v.charging.move) : undefined,
      trapped: this.v.trapped ? battle.moveIdOf(this.v.trapped.move) : undefined,
      types: !arraysEqual(this.v.types, base.species.types) ? [...this.v.types] : undefined,
      flags: this.v.cflags,
      perishCount: this.v.perishCount,
      ability: this.v.ability,
    };
  }
}

class Volatiles {
  stages = {atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0};
  /** Gen 1 only */
  stats: StageStats;
  types: Type[];
  form?: FormId;
  substitute = 0;
  confusion = 0;
  counter = 0;
  stockpile = 0;
  flinch = false;
  invuln = false;
  hazed = false;
  fainted = false;
  inPursuit = false;
  inBatonPass = false;
  usedDefenseCurl = false;
  usedMinimize = false;
  usedIntimidate = false;
  usedTrace = false;
  canSpeedBoost = false;
  canFakeOut = true;
  justSwitched = true;
  hasFocus = true;
  protectCount = 0;
  perishCount = 0;
  tauntTurns = 0;
  drowsy = 0;
  rage = 1;
  furyCutter = 0;
  retaliateDamage = 0;
  ability?: AbilityId;
  meanLook?: ActivePokemon;
  attract?: ActivePokemon;
  seededBy?: ActivePokemon;
  choiceLock?: number;
  lastHitBy?: {move: Move; poke: ActivePokemon; special: bool};
  lastMove?: Move;
  lastMoveIndex?: number;
  charging?: {move: Move; target: ActivePokemon};
  recharge?: Move;
  thrashing?: {move: DamagingMove; turns: number; max: bool; acc?: number};
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
    this.ability = base.ability;
    this.counter = base.status === "tox" ? 1 : 0;
    this.form = base.form;
  }

  hasAnyType(...types: Type[]) {
    return this.types.some(t => types.includes(t));
  }

  lockedIn() {
    return (
      this.recharge ||
      this.charging?.move ||
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
    if (this.encore) {
      flags |= VF.cEncore;
    }
    if (this.meanLook) {
      flags |= VF.cMeanLook;
    }
    if (this.seededBy) {
      flags |= VF.cSeeded;
    }
    if (this.tauntTurns) {
      flags |= VF.cTaunt;
    }
    if (this.drowsy) {
      flags |= VF.cDrowsy;
    }
    return flags;
  }
}

const getValidTargets = (battle: Battle, move: Move, user: ActivePokemon) => {
  // TODO: retarget if dead && hyper beam
  if (user.v.encore) {
    return [user.id];
  } else if (move === user.v.charging?.move) {
    return [user.v.charging.target.id];
  }

  let range = move.range;
  if (move === battle.gen.moveList.curse && !user.v.types.includes("ghost")) {
    range = Range.Self;
  }
  return battle.getTargets(user, range, true).map(u => u.id);
};
