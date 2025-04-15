import type {Random} from "random";
import {accumulateBide, tryDamage} from "./damaging";
import type {ActivePokemon, Battle} from "../battle";
import {moveFunctions, moveList, type Move, type MoveId} from "../moves";
import {speciesList, type Species, type SpeciesId} from "../species";
import {
  clamp,
  floatTo255,
  idiv,
  VF,
  screens,
  type Stats,
  type StatStageId,
  type Type,
  randChoiceWeighted,
} from "../utils";
import type {ItemData, ItemId} from "../item";
import {UNOWN_FORM, type FormId, type Gender, type Nature} from "../pokemon";
import type {DamageReason} from "../events";

export type TypeChart = Record<Type, Partial<Record<Type, number>>>;

const typeChart: TypeChart = {
  normal: {ghost: 0, rock: 0.5, steel: 0.5},
  rock: {bug: 2, fire: 2, flying: 2, ice: 2, fight: 0.5, ground: 0.5, steel: 0.5},
  ground: {rock: 2, poison: 2, bug: 0.5, flying: 0, grass: 0.5, fire: 2, electric: 2, steel: 2},
  ghost: {normal: 0, ghost: 2, psychic: 0, dark: 0.5, steel: 0.5},
  poison: {rock: 0.5, ground: 0.5, ghost: 0.5, grass: 2, bug: 2, poison: 0.5, steel: 0},
  bug: {
    ghost: 0.5,
    flying: 0.5,
    fight: 0.5,
    grass: 2,
    fire: 0.5,
    psychic: 2,
    poison: 2,
    dark: 2,
    steel: 0.5,
  },
  flying: {rock: 0.5, bug: 2, fight: 2, grass: 2, electric: 0.5, steel: 0.5},
  fight: {
    normal: 2,
    rock: 2,
    ghost: 0,
    poison: 0.5,
    bug: 0.5,
    flying: 0.5,
    ice: 2,
    psychic: 0.5,
    dark: 2,
    steel: 2,
  },
  water: {rock: 2, ground: 2, water: 0.5, grass: 0.5, fire: 2, dragon: 0.5},
  grass: {
    rock: 2,
    ground: 2,
    poison: 0.5,
    bug: 0.5,
    flying: 0.5,
    water: 2,
    fire: 0.5,
    dragon: 0.5,
    grass: 0.5,
    steel: 0.5,
  },
  fire: {rock: 0.5, bug: 2, water: 0.5, grass: 2, fire: 0.5, ice: 2, dragon: 0.5, steel: 2},
  electric: {ground: 0, flying: 2, water: 2, grass: 0.5, electric: 0.5, dragon: 0.5},
  ice: {ground: 2, flying: 2, water: 0.5, grass: 2, ice: 0.5, dragon: 2, steel: 0.5},
  psychic: {poison: 2, fight: 2, psychic: 0.5, steel: 0.5, dark: 0},
  dragon: {dragon: 2, steel: 0.5},
  dark: {ghost: 2, fight: 0.5, psychic: 2, dark: 0.5, steel: 0.5},
  steel: {rock: 2, water: 0.5, fire: 0.5, electric: 0.5, ice: 2, steel: 0.5},
  "???": {},
};

const itemTypeBoost: Partial<Record<ItemId, {type: Type; percent: number} | null>> = {
  softsand: {type: "ground", percent: 10},
  hardstone: {type: "rock", percent: 10},
  metalcoat: {type: "steel", percent: 10},
  pinkbow: {type: "normal", percent: 10},
  blackbelt: {type: "fight", percent: 10},
  sharpbeak: {type: "flying", percent: 10},
  poisonbarb: {type: "poison", percent: 10},
  silverpowder: {type: "bug", percent: 10},
  spelltag: {type: "ghost", percent: 10},
  polkadotbow: {type: "normal", percent: 10},
  charcoal: {type: "fire", percent: 10},
  mysticwater: {type: "water", percent: 10},
  miracleseed: {type: "grass", percent: 10},
  magnet: {type: "electric", percent: 10},
  twistedspoon: {type: "psychic", percent: 10},
  nevermeltice: {type: "ice", percent: 10},
  dragonscale: {type: "dragon", percent: 10},
  dragonfang: null,
  blackglasses: {type: "dark", percent: 10},
  silkscarf: {type: "normal", percent: 10},
  seaincense: {type: "water", percent: 5},
};

const stageMultipliers: Record<number, number> = {
  [-6]: 25 / 100,
  [-5]: 28 / 100,
  [-4]: 33 / 100,
  [-3]: 40 / 100,
  [-2]: 50 / 100,
  [-1]: 66 / 100,
  0: 100 / 100,
  1: 150 / 100,
  2: 200 / 100,
  3: 250 / 100,
  4: 300 / 100,
  5: 350 / 100,
  6: 400 / 100,
};

type PRecord<K extends string | number | symbol, V> = Partial<Record<K, V>>;

const statBoostItem: PRecord<
  ItemId,
  PRecord<SpeciesId, {stats: StatStageId[]; transformed: bool; amount: number}>
> = {
  metalpowder: {ditto: {stats: ["def", "spd"], transformed: true, amount: 0.5}},
  lightball: {pikachu: {stats: ["spa"], transformed: false, amount: 1}},
  thickclub: {marowak: {stats: ["atk"], transformed: false, amount: 1}},
  souldew: {
    latias: {stats: ["spa", "spd"], transformed: false, amount: 0.5},
    latios: {stats: ["spa", "spd"], transformed: false, amount: 0.5},
  },
  deepseatooth: {clamperl: {stats: ["spa"], transformed: false, amount: 1}},
  deepseascale: {clamperl: {stats: ["spd"], transformed: false, amount: 1}},
};

enum BetweenTurns {
  Begin,
  FutureSight,
  Weather,
  PartialTrapping,
  PerishSong,
}

export const scaleAccuracy255 = (acc: number, user: ActivePokemon, target: ActivePokemon) => {
  // https://bulbapedia.bulbagarden.net/wiki/Accuracy#Generation_I_and_II
  let userStages = user.v.stages["acc"];
  let targetStages = target.v.stages["eva"];
  if (userStages < targetStages && target.v.hasFlag(VF.identified)) {
    userStages = 0;
    targetStages = 0;
  }

  const m = user.base.gen.accStageMultipliers;
  acc *= m[userStages] * m[-targetStages];
  return clamp(Math.floor(acc), 1, 255);
};

const checkAccuracy = (
  move: Move,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  _phys?: bool,
) => {
  if (!move.acc) {
    return true;
  }

  const chance = scaleAccuracy255(user.v.thrashing?.acc ?? floatTo255(move.acc), user, target);
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
};

const tryCrit = (battle: Battle, user: ActivePokemon, hc: bool) => {
  const baseSpe = user.base.species.stats.spe;
  const focus = user.v.hasFlag(VF.focusEnergy);
  if (hc) {
    return battle.rand255(focus ? 4 * Math.floor(baseSpe / 4) : 8 * Math.floor(baseSpe / 2));
  } else {
    return battle.rand255(Math.floor(focus ? baseSpe / 8 : baseSpe / 2));
  }
};

export type CalcDamageParams = {
  lvl: number;
  pow: number;
  atk: number;
  def: number;
  eff: number;
  isCrit: bool;
  hasStab: bool;
  rand: Random | number | false;

  itemBonus?: number;
  weather?: "bonus" | "penalty";
  tripleKick?: number;
  /**
   * Rollout:     2**(n + d) | n: min(consecutive hits, 4), d: defense curl used
   * Fury Cutter: 2**n | n: min(consecutive hits, 4)
   * Rage:        number of times user was damaged while using rage
   */
  moveMod?: number;
  /**
   * Pursuit & target is switching
   * "minimize" flag  and target has minimized
   * ignore + punish and target is in semi-invulnerable move
   * SmellingSalt and target is paralyzed
   * Facade and target is burned
   */
  doubleDmg?: bool;
  stockpile?: number;
  helpingHand?: bool;
  screen?: bool;
  spread?: bool;
  flashFire?: bool;
};

const calcDamage = ({lvl, pow, atk, def, eff, isCrit, hasStab, rand}: CalcDamageParams) => {
  if (eff === 0) {
    return 0;
  }

  lvl *= isCrit ? 2 : 1;
  let dmg = Math.min(idiv(idiv((idiv(2 * lvl, 5) + 2) * pow * atk, def), 50), 997) + 2;
  if (hasStab) {
    dmg += idiv(dmg, 2);
  }

  if (eff > 1) {
    dmg = idiv(dmg * 20, 10);
    dmg = eff > 2 ? idiv(dmg * 20, 10) : dmg;
  } else if (eff < 1) {
    dmg = idiv(dmg * 5, 10);
    dmg = eff < 0.5 ? idiv(dmg * 5, 10) : dmg;
  }

  let r = typeof rand === "number" ? rand : 255;
  if (rand && typeof rand !== "number" && dmg > 1) {
    r = rand.int(217, 255);
  }
  return idiv(dmg * r, 255);
};

const getDamageVariables = (
  special: bool,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  isCrit: bool,
) => {
  const [atks, defs] = special ? (["spa", "spa"] as const) : (["atk", "def"] as const);
  let atk = getStat(battle, user, atks, isCrit);
  let def = getStat(battle, target, defs, isCrit, true);
  if (atk >= 256 || def >= 256) {
    atk = Math.max(Math.floor(atk / 4) % 256, 1);
    // defense doesn't get capped here on cart, potentially causing divide by 0
    def = Math.max(Math.floor(def / 4) % 256, 1);
  }
  return [atk, def] as const;
};

const isValidMove = (battle: Battle, user: ActivePokemon, move: MoveId, i: number) => {
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
};

const handleCrashDamage = (
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
  _dmg: number,
) => {
  // https://www.smogon.com/dex/rb/moves/high-jump-kick/
  if (user.v.substitute && target.v.substitute) {
    target.damage(1, user, battle, false, "attacked");
  } else if (!user.v.substitute) {
    user.damage(1, user, battle, false, "crash", true);
  }
};

const beforeUseMove = (battle: Battle, move: Move, user: ActivePokemon) => {
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
    user.v.recharge = undefined;
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
    battle.info(user, "disable_end", [{id: user.id, v: {flags: user.v.cflags}}]);
  }

  if (user.v.confusion) {
    const event = --user.v.confusion === 0 ? "confused_end" : "confused";
    battle.info(user, event, [{id: user.id, v: {flags: user.v.cflags}}]);
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
  }

  if (!confuse && user.v.attract) {
    battle.event({type: "in_love", src: user.id, target: user.v.attract.id});
  }

  if (confuse) {
    // TODO: use target reflect
    const [atk, def] = battle.gen.getDamageVariables(false, battle, user, user, false);
    const dmg = battle.gen.calcDamage({
      lvl: user.base.level,
      pow: 40,
      def,
      atk,
      eff: 1,
      rand: false,
      isCrit: false,
      hasStab: false,
    });

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
};

const getStat = (_: Battle, poke: ActivePokemon, stat: StatStageId, isCrit?: bool, def?: bool) => {
  // In gen 1, a crit against a transformed pokemon will use its untransformed stats
  let value = poke.v.stats[stat];
  if (def && isCrit && poke.base.transformed) {
    return poke.base.real.stats[stat];
  }

  const screen = def && poke.v.hasFlag(stat === "def" ? VF.reflect : VF.lightScreen);
  if (isCrit) {
    value = poke.base.stats[stat];
  } else if (screen) {
    value *= 2;
  }
  return value;
};

const calcStat = (
  stat: keyof Stats,
  bases: Stats,
  level: number,
  dvs?: Partial<Stats>,
  statexp?: Partial<Stats>,
  _nature?: Nature,
) => {
  const base = bases[stat];
  // Gen 2 uses the Spc IV/EVs for SpA and SpD
  stat = stat === "spd" ? "spa" : stat;

  let dv = dvs?.[stat] ?? 15;
  if (stat === "hp") {
    dv = getHpIv(dvs);
  }
  const s = Math.min(Math.ceil(Math.sqrt(statexp?.[stat] ?? 65535)), 255);
  return Math.floor((((base + dv) * 2 + s / 4) * level) / 100) + (stat === "hp" ? level + 10 : 5);
};

const getHpIv = (dvs?: Partial<Stats>) => {
  return (
    (((dvs?.atk ?? 15) & 1) << 3) |
    (((dvs?.def ?? 15) & 1) << 2) |
    (((dvs?.spa ?? 15) & 1) << 1) |
    ((dvs?.spe ?? 15) & 1)
  );
};

const createGeneration = () => {
  return {
    id: 1,
    maxIv: 15,
    maxEv: 65535,
    maxTotalEv: 65535 * 6,
    speciesList,
    moveList,
    typeChart,
    items: {} as Record<ItemId, ItemData>,
    moveFunctions,
    itemTypeBoost,
    statBoostItem,
    lastMoveIdx: moveList.whirlwind.idx!,
    invalidSketchMoves: [
      "transform",
      "metronome",
      "mimic",
      "mirrormove",
      "sleeptalk",
      "explosion",
      "selfdestruct",
    ] as MoveId[],
    stageMultipliers,
    accStageMultipliers: stageMultipliers,
    // Gen 1 bug, if you have exactly 25% hp you can create a substitute and instantly die
    canSubstitute: (user: ActivePokemon, hp: number) => hp <= user.base.hp,
    beforeUseMove,
    isValidMove,
    rng: {
      maxThrash: 3,
      tryDefrost: (_: Battle) => false,
      tryQuickClaw: (battle: Battle) => battle.rand255Good(60),
      tryKingsRock: (battle: Battle) => battle.rand255Good(30),
      tryFocusBand: (battle: Battle) => battle.rand255Good(30),
      tryCrit,
      tryFullPara: (battle: Battle) => battle.rand100(25),
      tryAttract: (battle: Battle) => battle.rand100(50),
      tryShedSkin: (battle: Battle) => battle.rand100((1 / 3) * 100),
      tryContactStatus: (battle: Battle) => battle.rand100((1 / 3) * 100),
      sleepTurns(battle: Battle) {
        // https://www.smogon.com/forums/threads/outdated-new-rby-sleep-mechanics-discovery.3745689/
        let rng = battle.rng.int(0, 255);
        let sleepTurns = rng & 7;
        while (!sleepTurns) {
          rng = (rng * 5 + 1) & 255;
          sleepTurns = rng & 7;
        }
        return sleepTurns;
      },
      disableTurns: (battle: Battle) => battle.rng.int(1, 8),
      multiHitCount: (battle: Battle) => {
        return randChoiceWeighted(battle.rng, [2, 3, 4, 5], [37.5, 37.5, 12.5, 12.5]);
      },
      thrashDuration(battle: Battle) {
        return battle.rng.int(2, this.maxThrash);
      },
      bideDuration: (battle: Battle) => battle.rng.int(2, 3) + 1,
      uproarDuration: (battle: Battle) => battle.rng.int(2, 5),
    },
    checkAccuracy,
    calcDamage,
    getDamageVariables,
    handleCrashDamage,
    getStat,
    validSpecies: (species: Species) => species.dexId <= 151,
    getMaxPP: (move: Move) => (move.pp === 1 ? 1 : Math.min(Math.floor((move.pp * 8) / 5), 61)),
    canOHKOHit(battle: Battle, user: ActivePokemon, target: ActivePokemon) {
      return getStat(battle, target, "spe") <= getStat(battle, user, "spe");
    },
    calcStat,
    getHpIv,
    getGender: (
      _desired: Gender | undefined,
      _species: Species,
      _atk: number,
    ): Gender | undefined => "N",
    getForm(_desired: FormId | undefined, id: SpeciesId, dvs: Partial<Stats>): FormId | undefined {
      if (id === "unown") {
        const c2 = (iv?: number) => ((iv ?? 15) >> 1) & 0b11;
        const letter = (c2(dvs.atk) << 6) | (c2(dvs.def) << 4) | (c2(dvs.spe) << 2) | c2(dvs.spa);
        return UNOWN_FORM[idiv(letter, 10)];
      }

      return;
    },
    getShiny: (_desired: bool | undefined, _dvs: Partial<Stats>) => false,
    accumulateBide,
    tryDamage,
    afterBeforeUseMove(battle: Battle, user: ActivePokemon): bool {
      this.handleResidualDamage(battle, user);
      return battle.checkFaint(user) && shouldReturn(battle, false);
    },
    afterUseMove(battle: Battle, user: ActivePokemon, isReplacement: bool): bool {
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
    },
    handleResidualDamage(battle: Battle, poke: ActivePokemon) {
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
          d = why === "seeded" ? 8 : 16;
        }

        const dmg = Math.max(Math.floor((m * poke.base.stats.hp) / d), 1);
        const {dead} = poke.damage(dmg, poke, battle, false, why, true);
        if (why === "seeded" && poke.v.seededBy) {
          poke.v.seededBy.recover(dmg, poke, battle, "seeder");
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
          dmg: Math.max(1, idiv(poke.base.stats.hp, 4)),
          src: poke,
          why: "nightmare",
          direct: true,
        }).dead
      ) {
        return;
      } else if (
        poke.v.hasFlag(VF.curse) &&
        poke.damage2(battle, {
          dmg: Math.max(1, idiv(poke.base.stats.hp, 4)),
          src: poke,
          why: "curse",
          direct: true,
        }).dead
      ) {
        return;
      }
    },
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
          battle.event({
            type: "sv",
            volatiles: [poke.clearFlag(VF.protect | VF.endure | VF.helpingHand)],
          });
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
            battle.event({type: "weather", kind: "end", weather: battle.weather.kind});
            delete battle.weather;
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

        if (poke.base.item === "leftovers") {
          poke.recover(Math.max(1, idiv(poke.base.stats.hp, 16)), poke, battle, "leftovers");
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
        poke.handleBerry(battle, {pinch: true, status: true, heal: true});
      }

      // Encore
      for (const poke of battle.allActive) {
        poke.handleEncore(battle);

        if (!poke.base.hp && !poke.v.fainted) {
          battle.event({type: "bug", bug: "bug_gen2_spikes"});
        }
      }
    },
  };
};

export const shouldReturn = (battle: Battle, pursuit: bool) => {
  // Pursuit switches continue until Gen V
  return battle.allActive.some(
    p =>
      p.v.fainted &&
      p.getOptions(battle) &&
      (!pursuit || p.choice?.move?.kind !== "switch" || p.choice.executed),
  );
};

export const GENERATION1 = createGeneration();

export type Generation = typeof GENERATION1;
