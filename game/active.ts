import type {DamageReason, RecoveryReason, InfoReason, PokeId} from "./events";
import type {MoveId, Move, DamagingMove, HealingWishMove, ForesightMove} from "./moves";
import {
  natureTable,
  type Gender,
  type CastformForm,
  type FormId,
  type Pokemon,
  type Status,
} from "./pokemon";
import {
  arraysEqual,
  clamp,
  CVF,
  HP_TYPES,
  hpPercent,
  stageKeys,
  stageStatKeys,
  VF,
  Range,
  type StageId,
  type StageStats,
  type Type,
  type Weather,
  Endure,
  IGNORABLE_ABILITIES,
  idiv1,
  idiv,
} from "./utils";
import {TurnType, type Battle, type MoveOption, type Options, type Player} from "./battle";
import {abilityList, type SpeciesId, type AbilityId} from "./species";
import type {ItemId} from "./item";
import dirty, {type Diff} from "./dirty";
import type {Generation} from "./gen";

export type DamageParams = {
  dmg: number;
  src: Battlemon;
  why: DamageReason;
  isCrit?: bool;
  direct?: bool;
  eff?: number;
  move?: MoveId;
};

export type ChosenMove = {
  move: Move;
  indexInMoves?: number;
  target?: Battlemon;
  isReplacement: bool;
  spe: number;
  executed: bool;
};

export class Battlemon {
  v: Volatiles;
  lastChosenMove?: Move;
  futureSight?: {move: DamagingMove; damage: number; turns: number; user: Battlemon};
  wish?: {user: Pokemon; turns: number};
  choice?: ChosenMove;
  options?: {switches: number[]; moves: MoveOption[]; id: PokeId};
  consumed?: ItemId;
  initialized?: bool;
  id: PokeId;
  originalMoveset?: [MoveId[], number[]];

  constructor(public base: Pokemon, public readonly owner: Player, idx: number) {
    this.v = new Volatiles(base);
    this.id = `${this.owner.id}:${idx}`;
  }

  switchTo(next: Pokemon, battle: Battle, phazer?: Battlemon) {
    if (this.choice) {
      this.choice.executed = true;
    }

    if (this.base.status === "tox" && battle.gen.id <= 2) {
      this.setStatusCondition("psn");
      battle.syncVolatiles();
    }

    if (this.base.status && this.hasAbility("naturalcure") && !this.v.fainted) {
      battle.ability(this);
      this.unstatus(battle);
    }

    if (this.originalMoveset) {
      this.base.moves = this.originalMoveset[0];
      this.base.pp = this.originalMoveset[1];
      this.originalMoveset = undefined;
    }

    const old = this.v;
    this.v = new Volatiles(next);
    this.base = next;
    this.initialized = true;

    if (old.inBatonPass === "batonpass") {
      this.v.substitute = old.substitute;
      this.v.stages = {...old.stages}; // TODO: fix dirty so this isnt necessary
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
        battle.gen.recalculateStat(this, battle, stat, false);
      }
    }

    battle.gen.applyStatusDebuff(this);

    battle.event({
      type: "switch",
      speciesId: next.speciesId,
      hpPercent: hpPercent(next.hp, next.maxHp),
      hp: next.hp,
      src: this.id,
      name: next.name,
      level: next.level,
      gender: next.gender,
      shiny: next.shiny,
      indexInTeam: this.owner.team.indexOf(next),
      why: phazer ? "phaze" : old.inBatonPass !== "hwish" ? old.inBatonPass : undefined,
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
      this.recover(this.base.maxHp - this.base.hp, this, battle, "recover");
      this.unstatus(battle);
      if (old.hwish.restorePP) {
        this.base.moves.forEach((move, i) => (this.base.pp[i] = battle.gen.getMaxPP(move)));
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
        const dmg = idiv1(this.base.maxHp, 8 - (this.owner.hazards.spikes - 1) * 2);
        this.damage(dmg, this, battle, false, "spikes", true);
        if (this.base.hp === 0) {
          return;
        }
      }
    }

    if (this.owner.hazards.rocks) {
      const eff = battle.gen.getEffectiveness("rock", this).toFloat();
      const dmg = Math.max(1, Math.floor(this.base.maxHp * (0.125 * eff)));
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
    this.consumed = item;
    this.base.itemId = undefined;
    battle.event({type: "item", src: this.id, item});
  }

  canBatonPass() {
    return this.owner.team.some(p => p.hp && !this.owner.active.some(a => a.base === p));
  }

  faintIfNeeded(battle: Battle) {
    if (this.base.hp || this.v.fainted) {
      return false;
    }

    this.v.fainted = true;
    this.v.clearFlag(VF.protect | VF.mist | VF.lightScreen | VF.reflect | VF.roost);
    battle.info(this, "faint");

    this.freeOpponents(battle);
    if (!battle.victor && this.owner.areAllDead()) {
      battle.victor = battle.opponentOf(this.owner);
    }
    return true;
  }

  freeOpponents(battle: Battle) {
    const {active: oppActive} = battle.opponentOf(this.owner);
    for (const opp of oppActive) {
      if (opp.v.attract === this) {
        opp.v.attract = undefined;
      }
      if (opp.v.meanLook === this) {
        opp.v.meanLook = undefined;
      }
      battle.syncVolatiles();

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
          move: opp.v.trapped.move.id!,
        });
        opp.v.trapped = undefined;
      }
    }
  }

  transform(battle: Battle, target: Battlemon) {
    if (!this.originalMoveset) {
      this.originalMoveset = [this.base.moves, this.base.pp];
    }
    this.base.moves = [...target.base.moves];
    this.base.pp = target.base.moves.map(move => Math.min(battle.gen.getMaxPP(move), 5));

    // TODO: is this right? or should you continue to be locked into the move if the transform
    // moveset has it?
    this.v.choiceLock = undefined;
    this.v.transformed = true;
    this.v.types = [...target.v.types];
    this.v.speciesId = target.v.speciesId;
    this.v.form = target.v.form;
    this.v.shiny = target.v.shiny;
    this.v.ability = target.v.ability;
    this.v.stats = {...target.v.stats};
    this.v.baseStats = {...target.v.baseStats};
    this.v.gender = battle.gen.id <= 5 ? this.v.gender : target.v.gender;
    this.v.mimic = target.v.mimic && {...target.v.mimic, pp: target.v.mimic.pp && 5};
    for (const k of stageKeys) {
      this.v.stages[k] = target.v.stages[k];
      if (stageStatKeys.includes(k)) {
        battle.gen.recalculateStat(this, battle, k, false);
      }
    }

    if (target.v.speciesId === "arceus" && target.hasAbility("multitype")) {
      const type = this.base.item?.plate ?? "normal";
      this.v.form = type;
      this.v.types = [type];
    }

    battle.event({
      type: "transform",
      src: this.id,
      target: target.id,
      speciesId: this.v.speciesId,
      shiny: this.v.shiny,
      gender: this.v.gender,
      form: this.v.form,
    });
  }

  damage(
    dmg: number,
    src: Battlemon,
    battle: Battle,
    isCrit: bool,
    why: DamageReason,
    direct?: bool,
    eff?: number,
  ) {
    return this.damage2(battle, {dmg, src, isCrit, why, direct, eff});
  }

  damage2(battle: Battle, {dmg, src, isCrit, why, direct, eff, move}: DamageParams) {
    if (
      why === "crash" ||
      why === "attacked" ||
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
      const event = battle.event({
        type: "hit_sub",
        src: src.id,
        target: this.id,
        broken: this.v.substitute === 0,
        confusion: why === "confusion",
        eff,
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
      const event = battle.event({
        type: "damage",
        src: src.id,
        target: this.id,
        hpPercentBefore: hpPercent(hpBefore, this.base.maxHp),
        hpPercentAfter: hpPercent(this.base.hp, this.base.maxHp),
        hpBefore,
        hpAfter: this.base.hp,
        why,
        eff,
        isCrit,
        move,
      });

      const dealt = hpBefore - this.base.hp;
      if (shouldRage) {
        this.handleRage(battle);
        this.v.retaliateDamage = dealt;
      }

      return {event, dealt, brokeSub: false, dead: this.base.hp === 0};
    }
  }

  recover(amount: number, src: Battlemon, battle: Battle, why: RecoveryReason) {
    if ((why === "seeder" || why === "drain") && src !== this && src.hasAbility("liquidooze")) {
      battle.ability(src);
      return this.damage2(battle, {dmg: amount, src, why: "roughskin"});
    }

    const hpBefore = this.base.hp;
    this.base.hp = Math.min(this.base.hp + amount, this.base.maxHp);
    if (this.base.hp === hpBefore) {
      if (why === "present") {
        battle.info(this, "fail_present");
      }
      return;
    }

    battle.event({
      type: "recover",
      src: src.id,
      target: this.id,
      hpPercentBefore: hpPercent(hpBefore, this.base.maxHp),
      hpPercentAfter: hpPercent(this.base.hp, this.base.maxHp),
      hpBefore,
      hpAfter: this.base.hp,
      why,
    });
  }

  status(
    status: Status,
    battle: Battle,
    src: Battlemon,
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
        this.base.sleepTurns = idiv(this.base.sleepTurns, 2);
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

    this.setStatusCondition(status);
    battle.gen.applyStatusDebuff(this);
    battle.event({type: "status", src: this.id, status});

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

    // will a shaymin sky transformed into a shaymin sky revert when frozen?
    if (status === "frz" && this.base.speciesId === "shayminsky" && !this.v.transformed) {
      // Getting frozen transforms shaymin for the rest of the battle. Freezing a pokémon
      // transformed into shaymin-sky does nothing
      this.v.speciesId = this.base.speciesId = "shaymin";
      this.v.ability = this.base.ability = "naturalcure";
      this.base.recalculateStats();
      this.v.stats = {...this.base.stats};
      this.v.baseStats = {...this.base.stats};
      battle.event({
        type: "transform",
        src: this.id,
        speciesId: this.v.speciesId,
        shiny: this.v.shiny,
        gender: this.v.gender,
        ability: this.v.ability,
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
    this.setStatusCondition(undefined);
    this.v.hazed = this.v.hazed || why === "thaw";
    this.v.clearFlag(VF.nightmare);

    if (why) {
      return battle.info(this, why);
    } else {
      return battle.event({type: "cure", src: this.id, status});
    }
  }

  setStage(stat: StageId, value: number, battle: Battle, negative: bool) {
    this.v.stages[stat] = value;

    if (stageStatKeys.includes(stat)) {
      battle.gen.recalculateStat(this, battle, stat, negative);
    }

    if (battle.gen.id === 1) {
      for (const other of battle.allActive) {
        if (other !== this) {
          // https://bulbapedia.bulbagarden.net/wiki/List_of_battle_glitches_(Generation_I)#Stat_modification_errors
          battle.gen.applyStatusDebuff(other);
        }
      }
    }
  }

  modStages(mods: [StageId, number][], battle: Battle, src?: Battlemon, quiet?: bool) {
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

      this.setStage(stat, clamp(this.v.stages[stat] + count, -6, 6), battle, count < 0);
      battle.event({type: "stages", src: this.id, stat, count});
      failed = false;
    }
    return !failed;
  }

  confuse(battle: Battle, reason?: InfoReason, turns?: number) {
    if (reason !== "fatigue_confuse" && reason !== "fatigue_confuse_max" && this.v.confusion) {
      return false;
    }

    this.v.confusion = turns ?? battle.rng.int(2, 5) + 1;
    battle.info(this, reason ?? "become_confused");
    return true;
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
        battle.event({type: "trace", src: this.id, target: target.id, ability: this.v.ability!});
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
  }

  handleForecast(battle: Battle) {
    if (this.v.speciesId === "cherrim") {
      const form: FormId | undefined = battle.getWeather() === "sun" ? "sunshine" : undefined;
      if (form !== this.v.form) {
        this.v.form = form;
        battle.event({
          type: "transform",
          src: this.id,
          speciesId: this.v.speciesId,
          shiny: this.v.shiny,
          gender: this.v.gender,
          form: this.v.form,
        });
      }
    } else if (this.hasAbility("forecast") && this.v.speciesId === "castform") {
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
        this.v.types = [type];
        battle.ability(this);
        battle.event({
          type: "transform",
          src: this.id,
          speciesId: this.v.speciesId,
          shiny: this.v.shiny,
          gender: this.v.gender,
          form: this.v.form,
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
      const {dmg, endure} = battle.gen.getConfusionSelfDamage(battle, this);
      this.damage2(battle, {dmg, src: this, why: "confusion", direct: true});
      if (endure) {
        this.handleEndure(battle, endure);
      }
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
      this.recover(idiv1(dmg, 8), this, battle, "shellbell");
    }
  }

  handleLeftovers(battle: Battle) {
    if (!this.v.fainted && this.base.itemId === "leftovers") {
      this.recover(idiv1(this.base.maxHp, 16), this, battle, "leftovers");
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
        battle.info(this, "cure_attract");
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
          this.recover(idiv1(this.base.maxHp, 8), this, battle, "item");
          if (this.base.nature !== undefined) {
            const [, minus] = Object.keys(natureTable[this.base.nature]);
            if (minus === healPinch && !this.hasAbility("owntempo")) {
              this.confuse(battle);
            }
          }
        } else if (healSitrus) {
          this.consumeItem(battle);
          this.recover(idiv1(this.base.maxHp, 4), this, battle, "item");
        }
      }

      const statPinch = item.statPinch;
      if (statPinch && this.base.belowHp(4)) {
        this.consumeItem(battle);
        if (statPinch === "crit") {
          this.v.setFlag(VF.focusEnergy);
          battle.info(this, "focusEnergy");
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

  handleEndure(battle: Battle, endure: Endure) {
    switch (endure) {
      case Endure.Endure:
        return battle.info(this, "endure_hit");
      case Endure.FocusBand:
        return battle.info(this, "endure_band");
      case Endure.Sturdy:
        battle.ability(this);
        return battle.info(this, "endure_hit");
      case Endure.FocusSash:
        return this.consumeItem(battle);
    }
  }

  handleWeather(battle: Battle, weather: Weather) {
    if (
      this.v.charging?.move?.id === "dig" ||
      this.v.charging?.move?.id === "dive" ||
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

    const dmg = idiv1(this.base.maxHp, battle.gen.id <= 2 ? 8 : 16);
    this.damage(dmg, this, battle, false, weather as "hail" | "sand", true);
  }

  handlePartialTrapping(battle: Battle) {
    if (!this.v.trapped || this.v.trapped.turns === -1 || this.v.fainted) {
      return;
    }

    const move = this.v.trapped.move.id!;
    if (--this.v.trapped.turns === 0) {
      this.v.trapped = undefined;
      battle.event({type: "trap", src: this.id, target: this.id, kind: "end", move});
    } else {
      const dmg = idiv1(this.base.maxHp, 16);
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
      battle.info(this, "encore_end");
    }
  }

  handleFutureSight(battle: Battle) {
    if (this.futureSight && --this.futureSight.turns === 0) {
      if (!this.v.fainted) {
        battle.gen.handleFutureSight(battle, this, this.futureSight);
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
      if (this.v.perishCount !== 3) {
        battle.event({type: "perish", src: this.id, turns: this.v.perishCount});
      } else {
        battle.syncVolatiles();
      }
      if (!this.v.perishCount) {
        this.damage(this.base.hp, this, battle, false, "perish_song", true);
      }
    }
  }

  getSwitches(battle: Battle) {
    const switches: number[] = [];
    for (let i = 0; i < this.owner.team.length; i++) {
      const poke = this.owner.team[i];
      if (
        poke.hp !== 0 &&
        (battle.turnType === TurnType.Lead || !this.owner.active.some(a => a.base === poke))
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
      const pp = this.v.mimic?.pp !== undefined ? this.v.mimic.pp : this.base.pp[i];
      return {
        move,
        pp,
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

      const move = lockedIn?.id ?? "struggle";
      moves.push({
        move,
        valid: true,
        display: true,
        targets: this.getValidTargets(battle, battle.gen.moveList[move]),
      });
    }

    if (this.originalMoveset) {
      const [baseMoves, pp] = this.originalMoveset;
      baseMoves.forEach((move, i) => {
        moves.push({move, pp: pp[i], valid: false, display: false, indexInMoves: i, targets: []});
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

  hasPP(moveIndex: number) {
    if (this.v.mimic?.indexInMoves === moveIndex && this.v.mimic.pp !== undefined) {
      return this.v.mimic.pp;
    }
    return this.base.pp[moveIndex];
  }

  deductPP(moveIndex: number, count: number) {
    if (this.v.mimic?.indexInMoves === moveIndex && this.v.mimic.pp !== undefined) {
      this.v.mimic.pp = Math.max(this.v.mimic.pp - count, 0);
    }

    if (this.base.pp[moveIndex] === 0) {
      // Certain glitches can cause a move to get used at 0 PP in Gen 1, in which case it wraps around
      this.base.pp[moveIndex] = 63;
    } else {
      this.base.pp[moveIndex] = Math.max(this.base.pp[moveIndex] - count, 0);
    }
  }

  moveset() {
    if (this.v.mimic) {
      const moves = [...this.base.moves];
      moves[this.v.mimic.indexInMoves] = this.v.mimic.move;
      return moves;
    }
    return this.base.moves;
  }

  isImprisoning(target: Battlemon, move: MoveId) {
    return (
      !this.v.fainted &&
      this.owner !== target.owner &&
      this.v.hasFlag(VF.imprisoning) &&
      this.moveset().includes(move)
    );
  }

  isGrounded() {
    if (this.base.item?.groundsUser) {
      return true;
    }
    const isFlying = this.v.types.includes("flying") && !this.v.hasFlag(VF.roost);
    return !isFlying && !this.hasAbility("levitate");
  }

  hasAbility(ability: AbilityId, user?: Battlemon) {
    return this.getAbilityId(user) === ability;
  }

  hasAnyAbility(...ability: AbilityId[]) {
    return ability.includes(this.getAbilityId());
  }

  hasAllyAbility(user: Battlemon | null, ...abilities: AbilityId[]): any {
    return this.owner.active.some(
      p => p.base.hp && p !== this && abilities.includes(p.getAbilityId(user || undefined)),
    );
  }

  getAbilityId(user?: Battlemon) {
    if (
      this.v.ability &&
      user?.getAbility()?.moldBreaker &&
      IGNORABLE_ABILITIES.has(this.v.ability)
    ) {
      return;
    }
    return !this.v.hasFlag(VF.gastroAcid) ? this.v.ability : undefined;
  }

  getAbility(user?: Battlemon) {
    const ability = this.getAbilityId(user);
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

  changedVolatiles() {
    const diff: Pick<Diff<Volatiles>, (typeof VOLATILE_SYNC_KEYS)[number]> = dirty.flush(this.v);
    let cflags = CVF.none;
    cflags |= diff.disabled ? CVF.disabled : 0;
    cflags |= diff.encore ? CVF.encore : 0;
    cflags |= diff.tauntTurns ? CVF.taunt : 0;
    if (this.v.transformed) {
      diff.stats = undefined;
    }
    return {
      stages: diff.stages,
      stats: diff.stats,
      types: diff.types,
      form: diff.form,
      stockpile: diff.stockpile,
      perishCount: diff.perishCount,
      flags: diff.flags,
      drowsy: diff.drowsy,
      speciesId: diff.speciesId,
      shiny: diff.shiny,
      gender: diff.gender,
      transformed: diff.transformed,
      charging: diff.charging && diff.charging?.move?.id,
      trapped: diff.trapped && diff.trapped?.move?.id,
      identified: diff.identified && diff.identified.id,
      seededBy: diff.seededBy && diff.seededBy.id,
      meanLook: diff.meanLook && diff.meanLook.id,
      attract: diff.attract && diff.attract.id,
      status: this.base.status || null,
      cflags,
    };
  }

  manipulateItem(cb: (_: Pokemon) => void) {
    cb(this.base);
    if (!this.base.item?.choice) {
      this.v.choiceLock = undefined;
    }
  }

  setStatusCondition(status: Status | undefined) {
    // TODO: find a better solution for this
    this.base.status = status;
    const old = this.v.tauntTurns;
    this.v.tauntTurns = 100;
    this.v.tauntTurns = old;
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
  /**
   * In generations 1 and 2, this is the stat including stat stages and burn modifier.
   * In generations 3+, this is the base stats before modifiers, but taking into account effects
   * like Power Trick.
   */
  stats: StageStats;
  baseStats: StageStats;
  types: Type[];
  form?: FormId;
  speciesId: SpeciesId;
  shiny: bool;
  gender: Gender;
  transformed = false;
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
  usedIntimidate = false;
  usedTrace = false;
  metronomeCount = 0;
  slowStartTurns = 0;
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
  meanLook?: Battlemon;
  attract?: Battlemon;
  seededBy?: Battlemon;
  choiceLock?: number;
  lastHitBy?: {move: Move; poke: Battlemon; type: Type};
  hwish?: HealingWishMove;
  lastMove?: Move;
  lastMoveIndex?: number;
  identified?: ForesightMove;
  charging?: {move: DamagingMove; targets: Battlemon[]};
  recharge?: {move: DamagingMove; target: Battlemon};
  thrashing?: {move: DamagingMove; turns: number; max: bool; acc?: number};
  bide?: {move: Move; turns: number; dmg: number};
  disabled?: {turns: number; indexInMoves: number};
  encore?: {turns: number; indexInMoves: number};
  mimic?: {move: MoveId; indexInMoves: number; pp?: number};
  trapping?: {move: Move; turns: number};
  trapped?: {user: Battlemon; move: Move; turns: number};
  flags = VF.none;
  private gen: Generation;

  constructor(base: Pokemon) {
    this.speciesId = base.speciesId;
    this.gender = base.gender;
    this.types = [...base.species.types];
    this.stats = {...base.stats};
    this.baseStats = {...base.stats};
    this.shiny = base.shiny;
    this.ability = base.ability;
    this.counter = base.status === "tox" ? 1 : 0;
    this.gen = base.gen;
    const self = dirty.tracked(this, VOLATILE_SYNC_KEYS);
    self.form = base.form;
    if (base.ability === "multitype" && HP_TYPES.includes(base.form)) {
      self.types = [base.form];
    }
    return self;
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

  get species() {
    return this.gen.speciesList[this.speciesId];
  }
}

export type VolatileDiff = ReturnType<Battlemon["changedVolatiles"]>;

const VOLATILE_SYNC_KEYS = [
  "stages",
  "stats",
  "charging",
  "trapped",
  "types",
  "form",
  "stockpile",
  "perishCount",
  "flags",
  "disabled",
  "attract",
  "encore",
  "meanLook",
  "seededBy",
  "tauntTurns",
  "drowsy",
  "identified",
  "speciesId",
  "gender",
  "shiny",
  "transformed",
] satisfies (keyof Volatiles)[];
