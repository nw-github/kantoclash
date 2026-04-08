import type {Random} from "random";
import type {Battlemon, Battle} from "../battle";
import {
  moveOverrides,
  moveList,
  moveScripts,
  type Move,
  type MoveId,
  type DamagingMove,
} from "../moves";
import {speciesList, type Species, type SpeciesId} from "../species";
import {
  clamp,
  idiv,
  VF,
  screens,
  randChoiceWeighted,
  MC,
  type Stats,
  type Type,
  type Weather,
  type StatStageId,
  TypeMod,
  isSpecialType,
  Endure,
  DMF,
  idiv1,
  TypeEffectiveness,
} from "../utils";
import {itemList, type ItemId} from "../item";
import {UNOWN_FORM, type Pokemon, type FormId, type Gender, type Nature} from "../pokemon";
import type {DamageReason} from "../events";
import type {Calc} from "../calc";

const stageMultipliers: Record<number, [num: number, div: number]> = {
  [-6]: [25, 100],
  [-5]: [28, 100],
  [-4]: [33, 100],
  [-3]: [40, 100],
  [-2]: [50, 100],
  [-1]: [66, 100],
  0: [100, 100],
  1: [150, 100],
  2: [200, 100],
  3: [250, 100],
  4: [300, 100],
  5: [350, 100],
  6: [400, 100],
};

enum BetweenTurns {
  Begin,
  FutureSight,
  Weather,
  PartialTrapping,
  PerishSong,
}

export const scaleAccuracy255 = (acc: number, user: Battlemon, target: Battlemon) => {
  // https://bulbapedia.bulbagarden.net/wiki/Accuracy#Generation_I_and_II
  let userStages = user.v.stages["acc"];
  let targetStages = target.v.stages["eva"];
  if (userStages < targetStages && target.v.identified) {
    userStages = 0;
    targetStages = 0;
  }

  const m = user.base.gen.accStageMultipliers;
  acc = idiv(acc * m[userStages][0], m[userStages][1]);
  acc = idiv(acc * m[-targetStages][0], m[-targetStages][1]);
  return clamp(acc, 1, 255);
};

// prettier-ignore
class Rng {
  maxThrash = 3;

  tryDefrost(_: Battle) { return false; }
  tryQuickClaw(battle: Battle) { return battle.rand255Good(60); }
  tryKingsRock(battle: Battle) { return battle.rand255Good(30); }
  tryFocusBand(battle: Battle) { return battle.rand255Good(30); }
  tryCrit(battle: Battle, user: Battlemon, hc: bool) {
    const baseSpe = user.v.species.stats.spe;
    const focus = user.v.hasFlag(VF.focusEnergy);
    if (hc) {
      return battle.rand255(focus ? 4 * idiv(baseSpe, 4) : 8 * idiv(baseSpe, 2));
    } else {
      return battle.rand255(idiv(baseSpe, focus ? 8 : 2));
    }
  }
  tryFullPara(battle: Battle) { return battle.rand100(25); }
  tryAttract(battle: Battle) { return battle.rand100(50); }
  tryShedSkin(battle: Battle) { return battle.rand100((1 / 3) * 100); }
  tryContactStatus(battle: Battle) { return battle.rand100((1 / 3) * 100); }
  sleepTurns(battle: Battle) {
    // https://www.smogon.com/forums/threads/outdated-new-rby-sleep-mechanics-discovery.3745689/
    let rng = battle.rng.int(0, 255);
    let sleepTurns = rng & 7;
    while (!sleepTurns) {
      rng = (rng * 5 + 1) & 255;
      sleepTurns = rng & 7;
    }
    return sleepTurns;
  }
  disableTurns(battle: Battle) { return battle.rng.int(1, 8); }
  multiHitCount(battle: Battle) { return randChoiceWeighted(battle.rng, [2, 3, 4, 5], [37.5, 37.5, 12.5, 12.5]); }
  bindingMoveTurns(battle: Battle, _user: Battlemon) { return this.multiHitCount(battle) - 1; }
  bideDuration(battle: Battle) { return battle.rng.int(2, 3) + 1; }
  uproarDuration(battle: Battle) { return battle.rng.int(2, 5); }
  thrashDuration(battle: Battle) { return battle.rng.int(2, this.maxThrash); }
}

type BaseDamageParams = {
  move?: DamagingMove;
  power: number; // u8
  level: number; // u8
  A: number; // u8
  D: number; // u8
};

type StabParams = {
  type: Type;
  user: Battlemon;
  target: Battlemon;
};

export class DamageCalc {
  static getBoostedAttack({user}: {user: Battlemon}) {
    return {atk: user.v.stats.atk, spa: user.v.stats.spa};
  }

  static getBoostedDefense({target}: {target: Battlemon}) {
    return {def: target.v.stats.def, spd: target.v.stats.spa};
  }

  static getBoostedPower({power}: {power: number}) {
    return power;
  }

  // --

  static P(v: number) {
    return Math.floor((v * 255) / 100);
  }

  static getDamageVariables(user: Battlemon, target: Battlemon, special: bool, isCrit: bool) {
    const [atks, defs] = special ? (["spa", "spa"] as const) : (["atk", "def"] as const);
    let A = user.v.stats[atks];
    let D = target.v.stats[defs];
    if (target.v.hasFlag(defs === "def" ? VF.reflect : VF.lightScreen)) {
      D <<= 1;
    }

    if (isCrit) {
      A = user.v.baseStats[atks];
      // In gen 1, a crit against a transformed pokemon will use its untransformed stats
      D = target.base.stats[defs];
    }

    if (A > 0xff || D > 0xff) {
      // A / 4
      A = Math.max(A >> 2, 1);
      // defense doesn't get capped here on cart, potentially causing divide by 0
      D = Math.max(D >> 2, 1);
    }

    let level = user.base.level;
    if (isCrit) {
      level *= 2;
    }
    // A, D, power, and level are all u8 values
    return {A: A & 0xff, D: D & 0xff, level: level & 0xff} as const;
  }

  static calcBaseDamage({power, level, A, D, move}: BaseDamageParams) {
    if (move?.flag === DMF.explosion) {
      D = Math.max(D >> 1, 1);
    }

    return Math.min(idiv(idiv((idiv(level * 2, 5) + 2) * power * A, D), 50), 997) + 2;
  }

  static applyTypeModifiers(dmg: number, {type, user, target}: StabParams) {
    if (user.v.hasAnyType(type)) {
      // Stab does not check for overflow
      dmg = (dmg + (dmg >> 1)) & 0xffff;
    }

    const eff = new TypeEffectiveness();
    for (const [atktype, deftype, modifier] of typeMatchupTable) {
      if (atktype === type && target.v.hasAnyType(deftype)) {
        dmg = idiv(dmg * modifier, TypeMod.EFFECTIVE);
        eff.modify(modifier);
        if (dmg === 0) {
          return {dmg: 0, eff, miss: true};
        }
      }
    }

    return {dmg, eff, miss: false};
  }

  static randomizeDamage(dmg: number, rng: Random | number) {
    if (dmg <= 1) {
      return dmg;
    }

    const r = typeof rng === "number" ? rng : rng.int(DamageCalc.P(85) + 1, DamageCalc.P(100));
    return idiv(dmg * r, DamageCalc.P(100));
  }
}

export type GetDamageParams = {
  battle: Battle;
  user: Battlemon;
  target: Battlemon;
  move: DamagingMove;
  isCrit: bool;
  /**
   * If RNG is null, skip damage randomization. If RNG is a number, use that number. Otherwise,
   * use battle.rng to generate a number.
   */
  rng?: number | null;

  // Gen 2+

  /** Gen 2 only: Which triple kick (a number between 1 and 3) */
  tripleKick?: number;
  power?: number;
  /** The party mon for this beat up attack */
  beatUp?: Pokemon;
};

export type TryEndureParams = {
  battle: Battle;
  user: Battlemon;
  target: Battlemon;
  dmg: number;
  prev?: Endure;
  wasFullHp?: bool;
};

export class Generation1 {
  static Rng = Rng;

  id = 1;
  maxIv = 15;
  maxEv = 65535;
  maxTotalEv = 65535 * 6;
  speciesList = speciesList;
  moveList = moveList;
  typeMatchupTable = typeMatchupTable;
  items = itemList;
  lastMoveIdx = moveList.whirlwind.idx!;
  lastPokemon = 151;
  invalidSketchMoves: MoveId[] = [
    "transform",
    "metronome",
    "mimic",
    "mirrormove",
    "sleeptalk",
    "explosion",
    "selfdestruct",
  ];
  stageMultipliers = stageMultipliers;
  accStageMultipliers = stageMultipliers;
  move = {scripts: moveScripts, overrides: moveOverrides};
  rng = new Generation1.Rng();
  calc: Calc = DamageCalc;

  beforeUseMove(battle: Battle, move: Move, user: Battlemon) {
    // Order of events comes from here:
    //  https://www.smogon.com/forums/threads/past-gens-research-thread.3506992/#post-5878612
    if (user.v.hazed) {
      return false;
    } else if (user.base.status === "slp") {
      const done = --user.base.sleepTurns === 0;
      if (done) {
        user.unstatus(battle, "wake");
      } else {
        battle.info(user, "sleep");
      }
      return false;
    } else if (user.base.status === "frz") {
      battle.info(user, "frozen");
      return false;
    }

    // See: damaging.ts:counterDamage
    // https://bulbapedia.bulbagarden.net/wiki/Counter_(move) | Full Para desync
    user.lastChosenMove = move;

    if (user.v.flinch) {
      battle.info(user, "flinch");
      return false;
    } else if (user.v.trapped) {
      battle.info(user, "trapped");
      return false;
    } else if (user.v.recharge) {
      battle.info(user, "recharge");
      user.v.recharge = undefined;
      return false;
    }

    if (user.v.disabled && --user.v.disabled.turns === 0) {
      user.v.disabled = undefined;
      battle.info(user, "disable_end");
    }

    if (user.v.confusion) {
      battle.info(user, --user.v.confusion === 0 ? "confused_end" : "confused");
    }

    const confuse = user.v.confusion && battle.rng.bool();
    const fullPara = user.base.status === "par" && battle.gen.rng.tryFullPara(battle);
    const attract = user.v.attract && battle.gen.rng.tryAttract(battle);
    if (confuse || attract || fullPara) {
      // Gen 1 bug: remove charging w/o removing user.v.invuln
      user.v.charging = undefined;
      user.v.bide = undefined;
      if (user.v.thrashing?.turns !== -1) {
        user.v.thrashing = undefined;
      }
      user.v.trapping = undefined;
      battle.syncVolatiles();
    }

    if (!confuse && user.v.attract) {
      battle.event({type: "in_love", src: user.id, target: user.v.attract.id});
    }

    if (confuse) {
      const {dmg} = this.getConfusionSelfDamage(battle, user);
      if (!user.v.substitute) {
        user.damage(dmg, user, battle, false, "confusion");
      } else {
        // TODO: ?
        for (const target of battle.opponentOf(user.owner).active) {
          if (target.v.substitute) {
            target.damage(dmg, user, battle, false, "confusion");
            return false;
          }
        }
      }
      return false;
    } else if (attract) {
      battle.info(user, "immobilized");
      return false;
    } else if (fullPara) {
      battle.info(user, "paralyze");
      return false;
    }

    return true;
  }

  isValidMove(battle: Battle, user: Battlemon, move: MoveId, i: number) {
    if (user.v.lockedIn() && user.v.lockedIn() !== battle.gen.moveList[move]) {
      return false;
    } else if (user.base.status === "frz" || user.base.status === "slp") {
      // https://bulbapedia.bulbagarden.net/wiki/List_of_battle_glitches_(Generation_I)#Defrost_move_forcing
      // XXX: Gen 1 doesn't let you pick your move when frozen, so if you are defrosted
      // before your turn, the game can desync. The logic we implement follows with what the
      // opponent player's game would do :shrug:

      // This also implements the bug in which pokemon who are frozen/put to sleep on the turn
      // they use a modified priority move retain that priority until they wake up/thaw.
      return (user.v.lastMoveIndex ?? 0) === i;
    } else if (i === user.v.disabled?.indexInMoves) {
      return false;
    } else if (user.base.pp[i] === 0) {
      return false;
    } else if (user.v.encore && i !== user.v.encore.indexInMoves) {
      return false;
    } else if (user.v.tauntTurns && battle.gen.moveList[move].kind !== "damage") {
      return false;
    }

    return true;
  }

  checkAccuracy(move: Move, battle: Battle, user: Battlemon, target: Battlemon, _phys?: bool) {
    if (!move.acc) {
      return true;
    } else if (move.id === "dreameater" && target.base.status !== "slp") {
      battle.miss(user, target);
      return false;
    } else if (
      move.kind === "damage" &&
      move.flag === DMF.ohko &&
      user.v.stats.spe < target.v.stats.spe
    ) {
      // in the real game, this is handled inside calcBaseDamage
      battle.miss(user, target);
      return false;
    }

    const chance = scaleAccuracy255(user.v.thrashing?.acc ?? DamageCalc.P(move.acc), user, target);
    // https://www.smogon.com/dex/rb/moves/petal-dance/
    // https://www.youtube.com/watch?v=NC5gbJeExbs
    if (user.v.thrashing) {
      user.v.thrashing.acc = chance;
    }

    if (target.v.invuln || !battle.rand255(chance)) {
      battle.miss(user, target);
      return false;
    }
    return true;
  }

  getDamage({battle, user, target, move, isCrit, rng}: GetDamageParams) {
    let res;
    if ((res = this.getFixedDamage(battle, user, target, move))) {
      return res;
    }

    const {A, D, level} = DamageCalc.getDamageVariables(user, target, this.isSpecial(move), isCrit);
    let eff,
      miss = false;
    let dmg = DamageCalc.calcBaseDamage({level, A, D, power: move.power, move});
    // eslint-disable-next-line prefer-const
    ({dmg, miss, eff} = DamageCalc.applyTypeModifiers(dmg, {type: move.type, user, target}));

    const random = !rng && rng !== null ? battle.rng : rng;
    if (!miss && random) {
      dmg = DamageCalc.randomizeDamage(dmg, random);
    }

    return {dmg, miss, eff: eff.toFloat(), type: move.type};
  }

  protected getFixedDamage(battle: Battle, user: Battlemon, target: Battlemon, move: DamagingMove) {
    if (move.fixedDamage) {
      return {dmg: move.fixedDamage, miss: false, eff: 1, type: move.type};
    } else if (this.move.overrides.dmg[move.id!]) {
      // Counter, Bide
      const dmg = this.getMoveDamage(move, battle, user, target) ?? 0;
      return {dmg, miss: !dmg, eff: 1, type: move.type};
    }
  }

  getConfusionSelfDamage(battle: Battle, user: Battlemon): {dmg: number; endure?: Endure} {
    const target = battle.opponentOf(user.owner).active[0];

    // This is the exact hack the game does (pokered:HandleSelfConfusionDamage)
    // This causes the game to use the opponent's reflect when calculating confusion damage
    const olddef = target.v.stats.def;
    target.v.stats.def = user.v.stats.def;
    const {A, D, level} = DamageCalc.getDamageVariables(user, target, false, false);
    target.v.stats.def = olddef;

    // Confusion damage is not adjusted for type effectiveness/stab or varied by a random factor
    return {dmg: DamageCalc.calcBaseDamage({power: 40, A, D, level})};
  }

  applyStatusDebuff(poke: Battlemon) {
    if (poke.base.status === "brn") {
      poke.v.stats.atk = idiv1(poke.v.stats.atk, 2);
    } else if (poke.base.status === "par") {
      poke.v.stats.spe = idiv1(poke.v.stats.spe, 4);
    }
  }

  recalculateStat(poke: Battlemon, battle: Battle, stat: StatStageId, negative: bool) {
    const [num, div] = battle.gen.stageMultipliers[poke.v.stages[stat]];
    poke.v.stats[stat] = idiv(poke.v.baseStats[stat] * num, div);

    // https://www.smogon.com/rb/articles/rby_mechanics_guide#stat-mechanics
    if (!negative) {
      poke.v.stats[stat] = clamp(poke.v.stats[stat], 1, 999);
    }
  }

  handleCrashDamage(battle: Battle, user: Battlemon, target: Battlemon, _dmg: number) {
    // https://www.smogon.com/dex/rb/moves/high-jump-kick/
    if (user.v.substitute && target.v.substitute) {
      target.damage(1, user, battle, false, "attacked");
    } else if (!user.v.substitute) {
      user.damage(1, user, battle, false, "crash", true);
    }
  }

  rollCrit(battle: Battle, user: Battlemon, _target: Battlemon, move: DamagingMove) {
    // Counter gets handled right after calling CriticalHitTest, but it never does anything with wCriticalHitOrOHKO
    if (move.fixedDamage || move.id === "bide") {
      return false;
    }
    return this.rng.tryCrit(battle, user, move.flag === DMF.high_crit);
  }

  calcStat(
    stat: keyof Stats,
    bases: Stats,
    level: number,
    dvs?: Partial<Stats>,
    statexp?: Partial<Stats>,
    _nature?: Nature,
  ) {
    const base = bases[stat];
    // Gen 2 uses the Spc IV/EVs for SpA and SpD
    stat = stat === "spd" ? "spa" : stat;

    let dv = dvs?.[stat] ?? 15;
    if (stat === "hp") {
      dv = this.getHpIv(dvs);
    }
    const s = Math.min(Math.ceil(Math.sqrt(statexp?.[stat] ?? 65535)), 255);
    return Math.floor((((base + dv) * 2 + s / 4) * level) / 100) + (stat === "hp" ? level + 10 : 5);
  }

  getHpIv(dvs?: Partial<Stats>) {
    return (
      (((dvs?.atk ?? 15) & 1) << 3) |
      (((dvs?.def ?? 15) & 1) << 2) |
      (((dvs?.spa ?? 15) & 1) << 1) |
      ((dvs?.spe ?? 15) & 1)
    );
  }

  validSpecies(species: Species) {
    return species.dexId <= this.lastPokemon;
  }

  getMaxPP(move: Move | MoveId) {
    move = typeof move === "string" ? this.moveList[move] : move;
    return move.pp === 1 ? 1 : Math.min(idiv(move.pp * 8, 5), 61);
  }

  getSpeed(_battle: Battle, user: Battlemon) {
    return user.v.stats.spe;
  }

  getGender(_desired: Gender | undefined, _species: Species, _atk: number): Gender | undefined {
    return "N";
  }

  getForm(
    _desired: string | undefined,
    id: SpeciesId,
    dvs: Partial<Stats>,
    item?: ItemId,
  ): FormId | undefined {
    if (id === "unown") {
      const c2 = (iv?: number) => ((iv ?? 15) >> 1) & 0b11;
      const letter = (c2(dvs.atk) << 6) | (c2(dvs.def) << 4) | (c2(dvs.spe) << 2) | c2(dvs.spa);
      return UNOWN_FORM[idiv(letter, 10)];
    }

    const itemData = this.items[item!];
    if (id === "arceus" && itemData?.plate) {
      return itemData.plate;
    }
  }

  getShiny(_desired: bool | undefined, _dvs: Partial<Stats>) {
    return false;
  }

  accumulateBide(battle: Battle, _user: Battlemon, bide: Required<Battlemon["v"]>["bide"]) {
    bide.dmg += battle.gen1LastDamage;
    bide.dmg &= 0xffff;
  }

  tryDamage = tryDamage;

  afterBeforeUseMove(battle: Battle, user: Battlemon): bool {
    this.handleResidualDamage(battle, user);
    return battle.checkFaint(user) && shouldReturn(battle, false);
  }

  afterUseMove(battle: Battle, user: Battlemon, isReplacement: bool): bool {
    if (isReplacement) {
      return false;
    }

    if (user.v.inBatonPass) {
      return true;
    } else if (battle.checkFaint(user) && shouldReturn(battle, true)) {
      return true;
    }

    this.handleResidualDamage(battle, user);
    return battle.checkFaint(user) && shouldReturn(battle, false);
  }

  handleResidualDamage(battle: Battle, poke: Battlemon) {
    const tickCounter = (why: DamageReason) => {
      // BUG GEN1: Toxic, Leech Seed, and brn/psn share the same routine. If a Pokemon rests, its
      // toxic counter will not be reset and brn, poison, and leech seed will use and update it.

      // BUG GEN2: Same as above, but Leech Seed is fixed and Rest resets the counter. Heal Bell
      // and Baton Pass don't though, so the same bug can happen.
      let m = poke.v.counter || 1;
      let d = 16;
      if (battle.gen.id >= 2) {
        m =
          why !== "seeded" && (battle.gen.id === 2 || poke.base.status === "tox")
            ? poke.v.counter || 1
            : 1;
        d = why === "psn" && poke.base.status === "tox" ? 16 : 8;
      }

      let dead = false;
      if (why === "psn" && poke.hasAbility("poisonheal")) {
        if (poke.base.hp < poke.base.maxHp) {
          battle.ability(poke);
          poke.recover(idiv1(poke.base.maxHp, 8), poke, battle, "recover");
        }
      } else {
        const dmg = idiv1(m * poke.base.maxHp, d);
        dead = poke.damage(dmg, poke, battle, false, why, true).dead;
        if (why === "seeded" && poke.v.seededBy) {
          poke.v.seededBy.recover(dmg, poke, battle, "seeder");
        }
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
    } else if (poke.v.seededBy && !poke.v.seededBy.v.fainted && tickCounter("seeded")) {
      return;
    } else if (
      poke.v.hasFlag(VF.nightmare) &&
      poke.damage2(battle, {
        dmg: idiv1(poke.base.maxHp, 4),
        src: poke,
        why: "nightmare",
        direct: true,
      }).dead
    ) {
      return;
    } else if (
      poke.v.hasFlag(VF.curse) &&
      poke.damage2(battle, {
        dmg: idiv1(poke.base.maxHp, 4),
        src: poke,
        why: "curse",
        direct: true,
      }).dead
    ) {
      return;
    }
  }

  betweenTurns(battle: Battle) {
    for (const poke of battle.allActive) {
      poke.v.hazed = false;
      poke.v.flinch = false;
      poke.v.inPursuit = false;
      poke.v.retaliateDamage = 0;
      if (battle.gen.id === 1 && poke.v.trapped && !poke.v.trapped.user.v.trapping) {
        poke.v.trapped = undefined;
      }
      if (poke.v.hasFlag(VF.protect | VF.endure | VF.helpingHand)) {
        poke.v.clearFlag(VF.protect | VF.endure | VF.helpingHand);
        battle.syncVolatiles();
      }
    }

    if (battle.betweenTurns < BetweenTurns.FutureSight) {
      for (const poke of battle.allActive) {
        poke.handleFutureSight(battle);
      }

      battle.betweenTurns = BetweenTurns.FutureSight;
      if (battle.checkFaint(battle.players[0].active[0], true)) {
        return;
      }
    }

    if (battle.betweenTurns < BetweenTurns.Weather) {
      weather: if (battle.weather) {
        if (battle.weather.turns !== -1 && --battle.weather.turns === 0) {
          battle.endWeather();
          break weather;
        }

        battle.event({type: "weather", kind: "continue", weather: battle.weather.kind});
        if (!battle.hasWeather("sand") && !battle.hasWeather("hail")) {
          break weather;
        }

        for (const poke of battle.allActive) {
          poke.handleWeather(battle, battle.weather!.kind);
        }

        battle.betweenTurns = BetweenTurns.Weather;
        if (battle.checkFaint(battle.players[0].active[0], true)) {
          return;
        }
      }
    }

    if (battle.betweenTurns < BetweenTurns.PartialTrapping) {
      for (const poke of battle.allActive) {
        poke.handlePartialTrapping(battle);
      }

      battle.betweenTurns = BetweenTurns.PartialTrapping;
      if (battle.checkFaint(battle.players[0].active[0], true)) {
        return;
      }
    }

    if (battle.betweenTurns < BetweenTurns.PerishSong) {
      for (const poke of battle.allActive) {
        poke.handlePerishSong(battle);
      }

      battle.betweenTurns = BetweenTurns.PerishSong;
      if (battle.checkFaint(battle.players[0].active[0], true)) {
        return;
      }

      // BUG GEN2: https://www.youtube.com/watch?v=1IiPWw5fMf8&t=85s
      // battle is the last faint check performed between turns. The pokemon that switches in here
      // can take spikes damage and end up on 0 HP without fainting.
    }

    battle.betweenTurns = BetweenTurns.Begin;
    for (const poke of battle.allActive) {
      if (poke.v.fainted) {
        continue;
      }

      if (poke.base.itemId === "leftovers") {
        poke.recover(idiv1(poke.base.maxHp, 16), poke, battle, "leftovers");
      }
      poke.handleBerry(battle, {pp: true});
    }

    // Defrost
    for (const poke of battle.allActive) {
      if (!poke.v.fainted && poke.base.status === "frz" && this.rng.tryDefrost(battle)) {
        poke.unstatus(battle, "thaw");
      }
    }

    // Screens
    for (const player of battle.players) {
      // technically should be safeguard, then light screen and reflect but who cares
      for (const screen of screens) {
        if (player.screens[screen] && --player.screens[screen] === 0) {
          battle.event({type: "screen", user: player.id, screen, kind: "end"});
        }
      }
    }

    // Berries
    for (const poke of battle.allActive) {
      poke.handleBerry(battle, {pinch: true, status: true});
    }

    // Encore
    for (const poke of battle.allActive) {
      poke.handleEncore(battle);

      if (!poke.base.hp && !poke.v.fainted) {
        battle.event({type: "bug", bug: "bug_gen2_spikes"});
      }
    }
  }

  getCategory(move: Move, overrideType?: Type) {
    return move.kind === "damage"
      ? this.isSpecial(move, overrideType)
        ? MC.special
        : MC.physical
      : MC.status;
  }

  isSpecial(move: Move, overrideType?: Type, other?: bool) {
    if (other && (move === this.moveList.beatup || move === this.moveList.hiddenpower)) {
      return false;
    }

    return isSpecialType(overrideType ?? move.type);
  }

  handleRage(battle: Battle, poke: Battlemon) {
    if (poke.v.thrashing?.move === battle.gen.moveList.rage && poke.v.stages.atk < 6) {
      battle.info(poke, "rage");
      poke.modStages([["atk", +1]], battle);
    }
  }

  getMoveAcc(move: Move, weather: Weather | undefined) {
    return callOr(move.acc, this.move.overrides.acc[move.id!], move, weather);
  }

  getMoveType(move: Move, user: Pokemon, weather: Weather | undefined) {
    return callOr(move.type, this.move.overrides.type[move.id!], move, user, weather);
  }

  getMoveBasePower(move: DamagingMove, battle: Battle, user: Battlemon, target: Battlemon) {
    return callOr(move.power, this.move.overrides.pow[move.id!], move, battle, user, target);
  }

  getMoveDamage(move: DamagingMove, battle: Battle, user: Battlemon, target: Battlemon) {
    return this.move.overrides.dmg[move.id!]?.call(move, battle, user, target);
  }

  getEffectiveness(type: Type, target: Battlemon) {
    return DamageCalc.applyTypeModifiers(0, {type, user: target, target}).eff;
  }

  tryAbilityImmunity(
    _battle: Battle,
    _user: Battlemon,
    _target: Battlemon,
    _self: Move,
    _type: Type,
    _eff: number,
  ) {
    return false;
  }

  handleFutureSight(battle: Battle, poke: Battlemon, fs: Battlemon["futureSight"] & {}) {
    battle.event({type: "futuresight", src: poke.id, move: fs.move.id!, release: true});
    if (!battle.checkAccuracy(fs.move, poke, poke)) {
      // FIXME: this is lazy
      battle.events.splice(-1, 1);
      battle.info(poke, "fail_generic");
    } else {
      poke.damage(fs.damage, poke, battle, false, "future_sight");
    }
  }

  tryEndure({dmg}: TryEndureParams) {
    return {dmg, endure: Endure.None};
  }
}

export const shouldReturn = (battle: Battle, pursuit: bool) => {
  // Pursuit switches continue until Gen V
  return battle.allActive.some(
    p =>
      p.v.fainted &&
      p.getOptions(battle) &&
      (!pursuit || p.choice?.move?.kind !== "switch" || p.choice.executed),
  );
};

const callOr = <T, Args extends any[], R>(
  _default: R,
  func: ((...args: Args) => R) | undefined,
  self: T,
  ...args: Args
) => {
  return func ? func.call(self, ...args) : _default;
};

export function tryDamage(
  self: DamagingMove,
  battle: Battle,
  user: Battlemon,
  target: Battlemon,
  _spread: bool,
  _power?: number,
): number {
  const checkThrashing = () => {
    if (user.v.thrashing && user.v.thrashing.turns !== -1 && --user.v.thrashing.turns === 0) {
      if (!user.owner.screens.safeguard && self.flag === DMF.multi_turn) {
        user.confuse(battle, user.v.thrashing.max ? "fatigue_confuse_max" : "fatigue_confuse");
      }
      user.v.thrashing = undefined;
    }
  };

  const trapTarget = () => {
    target.v.trapped = {move: self, turns: -1, user};
    user.v.trapping = {move: self, turns: battle.gen.rng.bindingMoveTurns(battle, user)};
  };

  if (self.flag === DMF.trap) {
    target.v.recharge = undefined;
  }

  const isCrit = battle.gen.rollCrit(battle, user, target, self);
  // eslint-disable-next-line prefer-const
  let {dmg, eff, miss, type} = battle.gen.getDamage({battle, user, target, move: self, isCrit});
  if (miss || !battle.checkAccuracy(self, user, target, !battle.gen.isSpecial(self, type))) {
    battle.gen1LastDamage = 0;
    // pokered:PrintMoveFailureText
    if (miss) {
      if (eff !== 0) {
        battle.miss(user, target);
      } else {
        battle.info(target, "immune");
        if (self.flag === DMF.trap) {
          trapTarget();
        } else if (self.flag === DMF.crash) {
          checkThrashing();
          return 0;
        }
      }
    }

    if (self.flag === DMF.crash) {
      battle.gen.handleCrashDamage(battle, user, target, dmg);
    } else if (self.flag === DMF.explosion) {
      // according to showdown, explosion also boosts rage even on miss/failure
      target.handleRage(battle);
      user.damage(user.base.hp, user, battle, false, "explosion", true);
    }
    checkThrashing();
    return 0;
  }

  target.v.lastHitBy = {move: self, poke: user, type};

  checkThrashing();
  if (self.id === "rage") {
    user.v.thrashing = {move: self, max: false, turns: -1};
  }

  const hadSub = target.v.substitute !== 0;
  // eslint-disable-next-line prefer-const
  let {dealt, brokeSub, dead, event} = target.damage(
    dmg,
    user,
    battle,
    isCrit,
    self.flag === DMF.ohko ? "ohko" : "attacked",
    false,
    eff,
  );

  if (self.flag === DMF.multi || self.flag === DMF.double) {
    event.hitCount = 1;
  }

  if (!brokeSub) {
    if (self.recoil) {
      dead =
        user.damage(idiv1(dealt, self.recoil), user, battle, false, "recoil", true).dead || dead;
    }

    if (self.flag === DMF.drain) {
      // https://www.smogon.com/forums/threads/past-gens-research-thread.3506992/#post-5878612
      //  - DRAIN HP SIDE EFFECT
      const dmg = idiv1(dealt, 2);
      battle.gen1LastDamage = dmg;
      user.recover(dmg, target, battle, "drain");
    } else if (self.flag === DMF.explosion) {
      dead = user.damage(user.base.hp, user, battle, false, "explosion", true).dead || dead;
    } else if (self.flag === DMF.double || self.flag === DMF.multi) {
      const count = self.flag === DMF.double ? 2 : battle.gen.rng.multiHitCount(battle);
      for (let hits = 1; !dead && !brokeSub && hits < count; hits++) {
        event.hitCount = 0;
        ({dead, brokeSub, event} = target.damage(
          dmg,
          user,
          battle,
          isCrit,
          "attacked",
          false,
          eff,
        ));
        event.hitCount = hits + 1;
      }
    } else if (self.id === "payday") {
      battle.info(user, "payday");
    }
  }

  if (dead || brokeSub) {
    return dealt;
  }

  if (self.flag === DMF.recharge) {
    user.v.recharge = {move: self, target};
  } else if (self.flag === DMF.trap) {
    trapTarget();
  }

  if (!self.effect) {
    return dealt;
  }

  // eslint-disable-next-line prefer-const
  let [chance, effect] = self.effect;
  if (effect === "tri_attack") {
    effect = battle.rng.choice(["brn", "par", "frz"] as const)!;
  }

  if (effect === "brn" && target.base.status === "frz") {
    target.unstatus(battle, "thaw");
    // TODO: can you thaw and then burn?
    return dealt;
  }

  /*
   * ld b, XX percent + 1
   * call BattleRandom      ; a = 0-255
   * cp b
   * ret nc                 ; ret if a >= b
   * ; Do the effect
   */
  if (battle.rng.int(0, 255) >= DamageCalc.P(chance) + 1) {
    return dealt;
  }

  if (effect === "confusion") {
    // GEN1 bug: ConfusionSideEffect doesn't check for an opponent substitute
    if (target.v.confusion === 0) {
      target.confuse(battle);
    }
    return dealt;
  } else if (hadSub) {
    return dealt;
  } else if (Array.isArray(effect)) {
    target.modStages(effect, battle, user, true);
  } else if (effect === "flinch") {
    target.v.flinch = true;
    // Flinching moves clear hyper beam from the target
    // https://github.com/pret/pokered/blob/fbcf7d0e19a3a2db505440d3ccd3d40ca996c15c/engine/battle/effects.asm#L992
    target.v.recharge = undefined;
  } else if (effect !== "knockoff" && effect !== "thief") {
    if (target.base.status || target.v.types.includes(self.type)) {
      return dealt;
    }

    if (effect === "frz") {
      // https://github.com/pret/pokered/blob/fbcf7d0e19a3a2db505440d3ccd3d40ca996c15c/engine/battle/effects.asm#L249
      target.v.recharge = undefined;
    }

    target.status(effect, battle, user, {});
  }
  return dealt;
}

const typeMatchupTable: [Type, Type, number][] = [
  ["water", "fire", TypeMod.SUPER_EFFECTIVE],
  ["fire", "grass", TypeMod.SUPER_EFFECTIVE],
  ["fire", "ice", TypeMod.SUPER_EFFECTIVE],
  ["grass", "water", TypeMod.SUPER_EFFECTIVE],
  ["electric", "water", TypeMod.SUPER_EFFECTIVE],
  ["water", "rock", TypeMod.SUPER_EFFECTIVE],
  ["ground", "flying", TypeMod.NO_EFFECT],
  ["water", "water", TypeMod.NOT_VERY_EFFECTIVE],
  ["fire", "fire", TypeMod.NOT_VERY_EFFECTIVE],
  ["electric", "electric", TypeMod.NOT_VERY_EFFECTIVE],
  ["ice", "ice", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "grass", TypeMod.NOT_VERY_EFFECTIVE],
  ["psychic", "psychic", TypeMod.NOT_VERY_EFFECTIVE],
  ["fire", "water", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "fire", TypeMod.NOT_VERY_EFFECTIVE],
  ["water", "grass", TypeMod.NOT_VERY_EFFECTIVE],
  ["electric", "grass", TypeMod.NOT_VERY_EFFECTIVE],
  ["normal", "rock", TypeMod.NOT_VERY_EFFECTIVE],
  ["normal", "ghost", TypeMod.NO_EFFECT],
  ["ghost", "ghost", TypeMod.SUPER_EFFECTIVE],
  ["fire", "bug", TypeMod.SUPER_EFFECTIVE],
  ["fire", "rock", TypeMod.NOT_VERY_EFFECTIVE],
  ["water", "ground", TypeMod.SUPER_EFFECTIVE],
  ["electric", "ground", TypeMod.NO_EFFECT],
  ["electric", "flying", TypeMod.SUPER_EFFECTIVE],
  ["grass", "ground", TypeMod.SUPER_EFFECTIVE],
  ["grass", "bug", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "poison", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "rock", TypeMod.SUPER_EFFECTIVE],
  ["grass", "flying", TypeMod.NOT_VERY_EFFECTIVE],
  ["ice", "water", TypeMod.NOT_VERY_EFFECTIVE],
  ["ice", "grass", TypeMod.SUPER_EFFECTIVE],
  ["ice", "ground", TypeMod.SUPER_EFFECTIVE],
  ["ice", "flying", TypeMod.SUPER_EFFECTIVE],
  ["fight", "normal", TypeMod.SUPER_EFFECTIVE],
  ["fight", "poison", TypeMod.NOT_VERY_EFFECTIVE],
  ["fight", "flying", TypeMod.NOT_VERY_EFFECTIVE],
  ["fight", "psychic", TypeMod.NOT_VERY_EFFECTIVE],
  ["fight", "bug", TypeMod.NOT_VERY_EFFECTIVE],
  ["fight", "rock", TypeMod.SUPER_EFFECTIVE],
  ["fight", "ice", TypeMod.SUPER_EFFECTIVE],
  ["fight", "ghost", TypeMod.NO_EFFECT],
  ["poison", "grass", TypeMod.SUPER_EFFECTIVE],
  ["poison", "poison", TypeMod.NOT_VERY_EFFECTIVE],
  ["poison", "ground", TypeMod.NOT_VERY_EFFECTIVE],
  ["poison", "bug", TypeMod.SUPER_EFFECTIVE],
  ["poison", "rock", TypeMod.NOT_VERY_EFFECTIVE],
  ["poison", "ghost", TypeMod.NOT_VERY_EFFECTIVE],
  ["ground", "fire", TypeMod.SUPER_EFFECTIVE],
  ["ground", "electric", TypeMod.SUPER_EFFECTIVE],
  ["ground", "grass", TypeMod.NOT_VERY_EFFECTIVE],
  ["ground", "bug", TypeMod.NOT_VERY_EFFECTIVE],
  ["ground", "rock", TypeMod.SUPER_EFFECTIVE],
  ["ground", "poison", TypeMod.SUPER_EFFECTIVE],
  ["flying", "electric", TypeMod.NOT_VERY_EFFECTIVE],
  ["flying", "fight", TypeMod.SUPER_EFFECTIVE],
  ["flying", "bug", TypeMod.SUPER_EFFECTIVE],
  ["flying", "grass", TypeMod.SUPER_EFFECTIVE],
  ["flying", "rock", TypeMod.NOT_VERY_EFFECTIVE],
  ["psychic", "fight", TypeMod.SUPER_EFFECTIVE],
  ["psychic", "poison", TypeMod.SUPER_EFFECTIVE],
  ["bug", "fire", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "grass", TypeMod.SUPER_EFFECTIVE],
  ["bug", "fight", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "flying", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "psychic", TypeMod.SUPER_EFFECTIVE],
  ["bug", "ghost", TypeMod.NOT_VERY_EFFECTIVE],
  ["bug", "poison", TypeMod.SUPER_EFFECTIVE],
  ["rock", "fire", TypeMod.SUPER_EFFECTIVE],
  ["rock", "fight", TypeMod.NOT_VERY_EFFECTIVE],
  ["rock", "ground", TypeMod.NOT_VERY_EFFECTIVE],
  ["rock", "flying", TypeMod.SUPER_EFFECTIVE],
  ["rock", "bug", TypeMod.SUPER_EFFECTIVE],
  ["rock", "ice", TypeMod.SUPER_EFFECTIVE],
  ["ghost", "normal", TypeMod.NO_EFFECT],
  ["ghost", "psychic", TypeMod.NO_EFFECT],
  ["fire", "dragon", TypeMod.NOT_VERY_EFFECTIVE],
  ["water", "dragon", TypeMod.NOT_VERY_EFFECTIVE],
  ["electric", "dragon", TypeMod.NOT_VERY_EFFECTIVE],
  ["grass", "dragon", TypeMod.NOT_VERY_EFFECTIVE],
  ["ice", "dragon", TypeMod.SUPER_EFFECTIVE],
  ["dragon", "dragon", TypeMod.SUPER_EFFECTIVE],
];
