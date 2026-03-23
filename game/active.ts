import type {
  HitSubstituteEvent,
  DamageEvent,
  DamageReason,
  RecoveryReason,
  InfoReason,
  ChangedVolatiles,
  PokeId,
} from "./events";
import type {MoveId, Move, DamagingMove, HealingWishMove, ForesightMove} from "./moves";
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
  CVF,
  getEffectiveness,
  HP_TYPES,
  hpPercent,
  idiv,
  stageKeys,
  stageStatKeys,
  VF,
  Range,
  type StageId,
  type StageStats,
  type StatStageId,
  type Type,
  type Weather,
} from "./utils";
import {TurnType, type Battle, type MoveOption, type Options, type Player} from "./battle";
import {abilityList, type AbilityId} from "./species";
import type {ItemId} from "./item";

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
  futureSight?: {move: DamagingMove; damage: number; turns: number};
  wish?: {user: Pokemon; turns: number};
  choice?: ChosenMove;
  options?: {switches: number[]; moves: MoveOption[]; id: PokeId};
  consumed?: ItemId;
  id: PokeId;

  constructor(public base: Pokemon, public readonly owner: Player, idx: number) {
    this.v = new Volatiles(base);
    this.id = `${this.owner.id}:${idx}`;
  }

  switchTo(next: Pokemon, battle: Battle, phazer?: ActivePokemon) {
    if (this.choice) {
      this.choice.executed = true;
    }

    if (this.base.status === "tox" && battle.gen.id <= 2) {
      this.base.status = "psn";
      battle.event({type: "sv", volatiles: [{id: this.id, v: {status: "psn"}}]});
    }

    if (this.base.status && this.hasAbility("naturalcure") && !this.v.fainted) {
      battle.ability(this);
      this.unstatus(battle);
    }

    const old = this.v;
    this.v = new Volatiles(next);
    this.base = next;

    if (old.inBatonPass === "batonpass") {
      this.v.substitute = old.substitute;
      this.v.stages = old.stages;
      this.v.confusion = old.confusion;
      this.v.perishCount = old.perishCount;
      this.v.meanLook = old.meanLook;
      this.v.counter = old.counter;
      this.v.seededBy = old.seededBy;
      if (battle.gen.id >= 3) {
        this.v.identified = old.identified;
      }

      const passedFlags =
        VF.lightScreen | VF.reflect | VF.mist | VF.focusEnergy | VF.curse | VF.lockon | VF.ingrain;
      this.v.setFlag(old.flags & passedFlags);

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
      shiny: next.shiny,
      form: next.form,
      indexInTeam: this.owner.team.indexOf(next),
      why: phazer ? "phaze" : old.inBatonPass !== "hwish" ? old.inBatonPass : undefined,
      volatiles: [{id: this.id, v: this.getClientVolatiles(next, battle)}],
    });

    this.freeOpponents(battle);

    if (this.base.itemId === "berserkgene") {
      this.consumeItem(battle);
      this.modStages([["atk", +2]], battle);
      // BUG GEN2: If you baton pass into a pokemon with a berserk gene, the confusion value
      // is not updated.
      this.confuse(battle, undefined, 256);
    }

    if (old.hwish) {
      battle.info(this, old.hwish.restorePP ? "lunardance" : "healingwish");
      this.recover(this.base.stats.hp - this.base.hp, this, battle, "recover");
      this.unstatus(battle);
      if (old.hwish.restorePP) {
        this.base.moves.forEach(
          (move, i) => (this.base.pp[i] = battle.gen.getMaxPP(battle.gen.moveList[move])),
        );
      }
    }

    if (this.isGrounded()) {
      if (this.owner.hazards.tspikes && this.v.types.includes("poison")) {
        this.owner.hazards.tspikes = 0;
        battle.event({
          type: "hazard",
          src: this.id,
          player: this.owner.id,
          hazard: "tspikes",
          spin: true,
        });
      }

      if (
        this.owner.hazards.tspikes &&
        !this.base.status &&
        !this.v.hasAnyType("steel", "poison")
      ) {
        this.status(this.owner.hazards.tspikes > 1 ? "tox" : "psn", battle, phazer ?? this, {});
      }

      if (this.owner.hazards.spikes && this.isGrounded()) {
        const mod = 8 - (this.owner.hazards.spikes - 1) * 2;
        const dmg = Math.max(1, Math.floor(this.base.stats.hp / mod));
        this.damage(dmg, this, battle, false, "spikes", true);
        if (this.base.hp === 0) {
          return;
        }
      }
    }

    if (this.owner.hazards.rocks) {
      const eff = getEffectiveness(battle.gen.typeChart, "rock", this.v.types);
      const dmg = Math.max(1, Math.floor(this.base.stats.hp * (0.125 * eff)));
      this.damage(dmg, this, battle, false, "rocks", true);
      if (this.base.hp === 0) {
        return;
      }
    }

    if (
      battle.turnType === TurnType.Normal ||
      (battle.gen.id <= 3 && battle.turnType !== TurnType.Lead)
    ) {
      this.handleWeatherAbility(battle);
      this.handleSwitchInAbility(battle);
    }
  }

  consumeItem(battle: Battle) {
    const item = this.base.itemId!;
    battle.event({
      type: "item",
      src: this.id,
      item,
      volatiles:
        item === "mentalherb"
          ? [{id: this.id, v: {flags: this.v.cflags}}]
          : item === "whiteherb"
          ? [{id: this.id, v: {stages: {...this.v.stages}, stats: this.clientStats(battle)}}]
          : undefined,
    });

    this.consumed = item;
    this.base.itemId = undefined;
  }

  canBatonPass() {
    return this.owner.team.some(p => p.hp && !this.owner.active.some(a => a.base.real === p));
  }

  faintIfNeeded(battle: Battle) {
    if (this.base.hp || this.v.fainted) {
      return false;
    }

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
    if (!battle.victor && this.owner.areAllDead()) {
      battle.victor = battle.opponentOf(this.owner);
    }
    return true;
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
    this.v.ability = target.v.ability;

    if (target.base.speciesId === "arceus" && target.hasAbility("multitype")) {
      const type = this.base.item?.plate ?? "normal";
      this.v.form = type;
      this.v.types = [type];
    }

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
    if ((why === "seeder" || why === "drain") && src !== this && src.hasAbility("liquidooze")) {
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
    if (this.getAbility()?.preventsStatus === statusNoTox) {
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
      if (this.hasAbility("earlybird")) {
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
      this.hasAbility("synchronize") &&
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

    if (status === "frz" && this.base.speciesId === "shayminsky" && !this.base.transformed) {
      // Getting frozen transforms shaymin for the rest of the battle. Freezing a pokémon
      // transformed into shaymin-sky does nothing
      this.base.speciesId = "shaymin";
      this.base.ability = "naturalcure";
      this.v.ability = "naturalcure";
      battle.event({
        type: "transform",
        src: this.id,
        speciesId: this.base.speciesId,
        shiny: this.base.shiny,
        gender: this.base.gender,
        form: this.v.form,
        volatiles: [
          {
            id: this.id,
            v: {...this.getClientVolatiles(this.base, battle), ability: this.v.ability},
          },
        ],
        permanent: true,
      });
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
    const prevented = this.getAbility()?.preventsStatDrop;
    for (const [stat, count] of mods) {
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
    if (reason !== "fatigue_confuse" && reason !== "fatigue_confuse_max" && this.v.confusion) {
      return false;
    }

    this.v.confusion = turns ?? battle.rng.int(2, 5) + 1;
    battle.info(this, reason ?? "become_confused", [{id: this.id, v: {flags: this.v.cflags}}]);
    return true;
  }

  applyAbilityStatBoost(battle: Battle, stat: StatStageId, value: number) {
    const ability = this.getAbilityId();
    if (!ability) {
      return value;
    }

    if ((ability === "hugepower" || ability === "purepower") && stat === "atk") {
      value *= 2;
    }

    const weather = battle.getWeather();
    if (weather && abilityList[ability]?.weatherSpeedBoost === weather && stat === "spe") {
      value *= 2;
    }

    if (
      weather === "sun" &&
      this.owner.active.some(p => !p.v.fainted && p.hasAbility("flowergift")) &&
      (stat === "atk" || stat === "spd")
    ) {
      value += Math.floor(value / 2);
    }

    // TODO: the attack boost from guts should activate if the pokemon uses a move that thaws it
    // out
    if (ability === "guts" && stat === "atk" && this.base.status) {
      value += Math.floor(value / 2);
    }

    if (ability === "hustle" && stat === "atk") {
      value += Math.floor(value / 2);
    }

    if (ability === "marvelscale" && stat === "def" && this.base.status) {
      value += Math.floor(value / 2);
    }

    if (stat === "spa" && (ability === "plus" || ability === "minus")) {
      let minus = false,
        plus = false;
      for (const poke of battle.allActive) {
        // pre Gen V, plus and minus activate for opponents
        if (!poke.v.fainted) {
          minus = minus || poke.hasAbility("minus");
          plus = plus || poke.hasAbility("plus");
        }
      }

      if ((minus && ability === "plus") || (plus && ability === "minus")) {
        value += Math.floor(value / 2);
      }
    }

    return value;
  }

  handleWeatherAbility(battle: Battle) {
    const weather = this.getAbility()?.startsWeather;
    if (weather) {
      battle.ability(this);
      battle.setWeather(weather, -1);
    }
  }

  handleSwitchInAbility(battle: Battle) {
    if (this.hasAbility("intimidate") && !this.v.usedIntimidate) {
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
            continue;
          }
          poke.modStages([["atk", -1]], battle, this);
        }
      }
    } else if (this.hasAbility("trace") && !this.v.usedTrace) {
      const target = battle.rng.choice(
        battle
          .getTargets(this, Range.AllAdjacentFoe)
          .filter(target => target.v.ability !== "multitype"),
      );
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
    } else if (this.hasAbility("pressure") && battle.gen.id >= 4) {
      battle.ability(this);
      battle.info(this, "pressure");
    } else if (this.getAbility()?.moldBreaker) {
      battle.ability(this);
      battle.event({type: "moldbreaker", src: this.id, ability: this.getAbilityId()!});
    } else {
      this.handleForecast(battle);
    }

    battle.sv(battle.allActive.map(p => ({id: p.id, v: {stats: p.clientStats(battle)}})));
  }

  handleForecast(battle: Battle) {
    if (this.base.speciesId === "cherrim") {
      const form: FormId | undefined = battle.getWeather() === "sun" ? "sunshine" : undefined;
      if (form !== this.v.form) {
        this.v.form = form;
        battle.event({
          type: "transform",
          src: this.id,
          speciesId: this.base.speciesId,
          shiny: this.base.shiny,
          gender: this.base.gender,
          form: this.v.form,
        });
      }
    } else if (this.hasAbility("forecast") && this.base.speciesId === "castform") {
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
  }

  handleConfusion(battle: Battle) {
    if (!this.v.confusion) {
      return false;
    }

    const done = --this.v.confusion === 0;
    battle.info(this, done ? "confused_end" : "confused");
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

    return battle.gen.handleRage(battle, this);
  }

  handleShellBell(battle: Battle, dmg: number) {
    if (this.base.hp && dmg !== 0 && !this.v.fainted && this.base.itemId === "shellbell") {
      this.recover(Math.max(1, Math.floor(dmg / 8)), this, battle, "shellbell", false);
    }
  }

  handleLeftovers(battle: Battle) {
    if (!this.v.fainted && this.base.itemId === "leftovers") {
      this.recover(Math.max(1, idiv(this.base.stats.hp, 16)), this, battle, "leftovers");
    }
  }

  handleBerry(battle: Battle, {pp, pinch, status}: {pp?: bool; pinch?: bool; status?: bool}) {
    const item = this.base.item;
    if (this.v.fainted || !item) {
      return;
    }

    if (pp) {
      const restorePP = item.restorePP;
      if (restorePP) {
        const slot = this.base.pp.findIndex(pp => pp === 0);
        if (slot !== -1) {
          const move = battle.gen.moveList[this.base.moves[slot]];
          this.base.pp[slot] = Math.min(restorePP, battle.gen.getMaxPP(move));
          this.consumeItem(battle);
          battle.event({type: "pp", src: this.id, move: this.base.moves[slot]});
        }
      }
    }

    if (status) {
      const status = this.base.status === "tox" ? "psn" : this.base.status;
      if (status && this.getAbility()?.preventsStatus === status) {
        battle.ability(this);
        this.unstatus(battle);
      }

      if (this.v.attract && this.hasAbility("oblivious")) {
        this.v.attract = undefined;
        // is this silent?
        battle.ability(this);
        battle.info(this, "cure_attract", [{id: this.id, v: {flags: this.v.cflags}}]);
      }

      if (this.v.confusion && this.hasAbility("owntempo")) {
        this.v.confusion = 0;
        battle.ability(this);
        battle.info(this, "confused_end");
      }

      const cures = item.cureStatus;
      if (cures && cures === status) {
        this.consumeItem(battle);
        this.unstatus(battle);
      } else if (cures === "any") {
        if (this.base.status) {
          this.consumeItem(battle);
          this.unstatus(battle);
        } else if (this.v.confusion) {
          this.v.confusion = 0;
          this.consumeItem(battle);
          battle.info(this, "confused_end");
        }
      } else if (cures === "confuse" && this.v.confusion) {
        this.v.confusion = 0;
        this.consumeItem(battle);
        battle.info(this, "confused_end");
      } else if (this.v.attract && this.base.itemId === "mentalherb") {
        this.v.attract = undefined;
        this.consumeItem(battle);
        battle.info(this, "cure_attract");
      } else if (
        this.base.itemId === "whiteherb" &&
        Object.values(this.v.stages).some(v => v < 0)
      ) {
        for (const stage in this.v.stages) {
          if (this.v.stages[stage as StageId] < 0) {
            this.setStage(stage as StageId, 0, battle, false);
          }
        }

        this.consumeItem(battle);
      }
    }

    if (pinch) {
      if (this.base.belowHp(2)) {
        const healPinch = item.healPinchNature;
        const healFixed = item.healFixed;
        const healSitrus = item.healSitrus;
        if (healFixed) {
          this.consumeItem(battle);
          this.recover(healFixed, this, battle, "item");
        } else if (healPinch) {
          this.consumeItem(battle);
          this.recover(Math.max(1, Math.floor(this.base.stats.hp / 8)), this, battle, "item");
          if (this.base.nature !== undefined) {
            const [, minus] = Object.keys(natureTable[this.base.nature]);
            if (minus === healPinch && !this.hasAbility("owntempo")) {
              this.confuse(battle);
            }
          }
        } else if (healSitrus) {
          this.consumeItem(battle);
          this.recover(Math.max(1, Math.floor(this.base.stats.hp / 4)), this, battle, "item");
        }
      }

      const statPinch = item.statPinch;
      if (statPinch && this.base.belowHp(4)) {
        this.consumeItem(battle);
        if (statPinch === "crit") {
          battle.info(this, "focusEnergy", [this.setFlag(VF.focusEnergy)]);
        } else {
          if (statPinch === "random") {
            this.modStages([[battle.rng.choice([...stageStatKeys])!, +2]], battle);
          } else {
            this.modStages([[statPinch, +1]], battle);
          }
        }
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
      this.v.types.some(t => t === "steel" || t === "ground" || t === "rock")
    ) {
      return;
    } else if (weather === "hail" && this.v.types.includes("ice")) {
      return;
    } else if (this.getAbility()?.weatherEva === weather) {
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
        battle.event({
          type: "futuresight",
          src: this.id,
          move: battle.moveIdOf(this.futureSight.move)!,
          release: true,
        });
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
    if (battle.finished) {
      return undefined;
    }

    const switches = this.getSwitches(battle);
    if (battle.allActive.some(poke => poke.v.inBatonPass)) {
      return this.v.inBatonPass ? {switches, moves: [], id: this.id} : undefined;
    } else if (this.v.fainted && !this.canBeReplaced(switches)) {
      return;
    } else if (
      !this.v.fainted &&
      battle.allActive.some(p => p.v.fainted && p.canBeReplaced(battle))
    ) {
      return;
    } else if (battle.turnType === TurnType.Lead) {
      return {switches, moves: [], id: this.id};
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
        targets: this.getValidTargets(battle, battle.gen.moveList[move]),
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
        targets: this.getValidTargets(battle, battle.gen.moveList[move]),
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
    return !this.v.types.includes("flying") && !this.hasAbility("levitate");
  }

  hasAbility(ability: AbilityId) {
    return this.getAbilityId() === ability;
  }

  hasAnyAbility(...ability: AbilityId[]) {
    return ability.includes(this.getAbilityId());
  }

  getAbilityId() {
    return !this.v.hasFlag(VF.gastroAcid) ? this.v.ability : undefined;
  }

  getAbility() {
    const ability = this.getAbilityId();
    return ability && abilityList[ability];
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
      const ability = poke.getAbilityId();
      if (ability === "magnetpull" && this.v.types.includes("steel")) {
        return true;
      } else if (ability === "arenatrap" && poke.owner !== this.owner && this.isGrounded()) {
        return true;
      } else if (ability === "shadowtag" && poke.owner !== this.owner) {
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
    };
  }

  manipulateItem(cb: (_: Pokemon) => void) {
    cb(this.base);
    if (!this.base.item?.choice) {
      this.v.choiceLock = undefined;
    }
  }

  private getValidTargets(battle: Battle, move: Move) {
    // TODO: retarget if dead && hyper beam
    if (this.v.encore) {
      return [this.id];
    } else if (move === this.v.charging?.move) {
      return this.v.charging.targets.map(o => o.id);
    } else if (move === this.v.recharge?.move) {
      return [this.v.recharge.target.id];
    }

    let range = move.range;
    if (move === battle.gen.moveList.curse && !this.v.types.includes("ghost")) {
      range = Range.Self;
    }
    return battle.getTargets(this, range, true).map(u => u.id);
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
  inBatonPass?: "batonpass" | "uturn" | "hwish";
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
  hwish?: HealingWishMove;
  lastMove?: Move;
  lastMoveIndex?: number;
  identified?: ForesightMove;
  charging?: {move: DamagingMove; targets: ActivePokemon[]};
  recharge?: {move: DamagingMove; target: ActivePokemon};
  thrashing?: {move: DamagingMove; turns: number; max: bool; acc?: number};
  bide?: {move: Move; turns: number; dmg: number};
  disabled?: {turns: number; indexInMoves: number};
  encore?: {turns: number; indexInMoves: number};
  mimic?: {move: MoveId; indexInMoves: number};
  trapping?: {move: Move; turns: number};
  trapped?: {user: ActivePokemon; move: Move; turns: number};
  flags = VF.none;

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

    if (base.ability === "multitype" && HP_TYPES.includes(this.form)) {
      this.types = [this.form];
    }
  }

  hasAnyType(...types: Type[]) {
    return this.types.some(t => types.includes(t));
  }

  lockedIn() {
    return (
      this.recharge?.move ||
      this.charging?.move ||
      this.thrashing?.move ||
      this.bide?.move ||
      this.trapping?.move
    );
  }

  setFlag(flag: VF) {
    this.flags |= flag;
  }

  clearFlag(flag: VF) {
    this.flags &= ~flag;
  }

  hasFlag(flag: VF) {
    return (this.flags & flag) !== 0;
  }

  get cflags() {
    let hi = CVF.none;
    hi |= this.disabled ? CVF.disabled : 0;
    hi |= this.attract ? CVF.attract : 0;
    hi |= this.encore ? CVF.encore : 0;
    hi |= this.meanLook ? CVF.meanLook : 0;
    hi |= this.seededBy ? CVF.seeded : 0;
    hi |= this.tauntTurns ? CVF.taunt : 0;
    hi |= this.drowsy ? CVF.drowsy : 0;
    hi |= this.identified ? CVF.identified : 0;
    return {lo: this.flags, hi};
  }
}
