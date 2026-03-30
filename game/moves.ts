import {rawMoveList} from "./data/moves";
import {VF, MC, Range, stageKeys, idiv, stageStatKeys, HP_TYPES} from "./utils";
import type {FailReason, InfoReason, RecoveryReason} from "./events";
import type {Pokemon, Status} from "./pokemon";
import type {StageId, Type, Weather, ScreenId, HazardId} from "./utils";
import type {ActivePokemon, Battle} from "./battle";

export type MoveId = keyof typeof rawMoveList;
export type MoveScriptId = (typeof rawMoveList)[MoveId]["kind"];

export interface BaseMove {
  readonly kind: MoveScriptId | "phaze" | "switch";
  readonly id?: MoveId;
  readonly idx?: number;
  readonly name: string;
  readonly pp: number;
  readonly type: Type;
  readonly range: Range;
  readonly acc?: number;
  readonly priority?: number;
  readonly power?: number;
  /** Hits users in the semi-invuln state of these moves */
  readonly ignore?: MoveId[];
  /** Not encoreable */
  readonly noEncore?: bool;
  /** Not callable by metronome */
  readonly noMetronome?: bool;
  /** Not callable by assist */
  readonly noAssist?: bool;
  /** Not callable by sleep talk */
  readonly noSleepTalk?: bool;
  /** Not copyable by mimic */
  readonly noMimic?: bool;
  /** Undefined: Inherit from script, true: affected, false: unaffected */
  readonly protect?: bool;
  /** Only usable while sleeping */
  readonly sleepOnly?: bool;
  /** Usable while frozen; thaws the user out */
  readonly selfThaw?: bool;
  /** Soundproof Pokémon are immune */
  readonly sound?: bool;
  /** Affected by snatch */
  readonly snatch?: bool;
  /** Affected by magic coat */
  readonly magicCoat?: bool;
}

export interface VolatileFlagMove extends BaseMove {
  readonly kind: "volatile";
  readonly flag: VF;
  readonly range: Range.Self;
}

export interface ConfuseMove extends BaseMove {
  readonly kind: "confuse";
  readonly range: Range.Adjacent | Range.AllAdjacent;
}

export interface RecoveryMove extends BaseMove {
  readonly kind: "recover";
  readonly why: RecoveryReason;
  readonly weather?: bool;
  readonly range: Range.Self;
}

export interface StageMove extends BaseMove {
  readonly kind: "stage";
  readonly stages: [StageId, number][];
  readonly ignoreSub?: bool;
}

export interface StatusMove extends BaseMove {
  readonly kind: "status";
  readonly status: Status;
  readonly checkType?: bool;
  readonly range: Range.Adjacent | Range.Any | Range.AllAdjacentFoe;
}

export interface SwitchMove extends BaseMove {
  readonly kind: "switch";
  readonly poke: Pokemon;
  readonly priority: number;
}

export interface TrickMove extends BaseMove {
  readonly kind: "trick";
  readonly range: Range.Adjacent;
}

export interface FailMove extends BaseMove {
  readonly kind: "fail";
  readonly why: FailReason;
}

export interface WeatherMove extends BaseMove {
  readonly kind: "weather";
  readonly weather: Weather;
}

export interface ScreenMove extends BaseMove {
  readonly kind: "screen";
  readonly screen: ScreenId;
  readonly turns?: number;
}

export interface HazardMove extends BaseMove {
  readonly kind: "hazard";
  readonly range: Range.Field;
  readonly hazard: HazardId;
  readonly max: number;
}

export interface PhazingMove extends BaseMove {
  readonly kind: "phaze";
}

export interface ProtectMove extends BaseMove {
  readonly kind: "protect";
  readonly endure?: bool;
}

export interface PreventEscapeMove extends BaseMove {
  readonly kind: "noSwitch";
  readonly range: Range.Adjacent;
}

export interface LockOnMove extends BaseMove {
  readonly kind: "lockOn";
  readonly range: Range.Adjacent;
}

export interface HealBellMove extends BaseMove {
  readonly kind: "healbell";
  // user and all allies
  readonly range: Range.Self;
  readonly why: InfoReason;
}

export interface SwaggerMove extends BaseMove {
  readonly kind: "swagger";
  readonly range: Range.Adjacent;
  readonly stages: [StageId, number][];
}

export interface ForesightMove extends BaseMove {
  readonly kind: "foresight";
  readonly range: Range.Adjacent;
  readonly protect: true;
  readonly removeImmunities: Type;
}

export interface HealingWishMove extends BaseMove {
  readonly kind: "hwish";
  readonly range: Range.Self;
  readonly restorePP: bool;
}

export interface SwapMove extends BaseMove {
  readonly kind: "swap";
  readonly range: Range.Adjacent;
  readonly message: InfoReason;
  readonly stats: readonly StageId[];
}

export interface DamagingMove extends BaseMove {
  readonly kind: "damage";
  readonly power: number;
  readonly category: MC.physical | MC.special;
  readonly flag?: Flag;
  readonly effect?: [number, Effect] | [number, Effect, true];
  readonly effect2?: DamagingMove["effect"];
  /** Recoil: max(1 / recoil, 1) */
  readonly recoil?: number;
  /** Damage bonus if hitting an ignored move (ie Surf against Dive) */
  readonly punish?: bool;
  readonly contact?: bool;
  /** Affected by damp */
  readonly damp?: bool;
  readonly charge?: bool | "sun" | "invuln" | [StageId, number][];
  readonly ignoreType?: bool;
  readonly noTechnician?: bool;
  /** Affected by kings rock pre Gen V */
  readonly kingsRock?: bool;
  /** The amount of damage the move should do */
  readonly fixedDamage?: number;
}

interface NaturePowerMove extends BaseMove {
  readonly kind: "naturepower";
  readonly calls: MoveId;
}

interface CamouflageMove extends BaseMove {
  readonly kind: "camouflage";
  readonly camouflageType: Type;
}

export type Move =
  | VolatileFlagMove
  | ConfuseMove
  | DamagingMove
  | RecoveryMove
  | StageMove
  | StatusMove
  | SwitchMove
  | FailMove
  | TrickMove
  | WeatherMove
  | ScreenMove
  | HazardMove
  | PhazingMove
  | ProtectMove
  | PreventEscapeMove
  | LockOnMove
  | HealBellMove
  | SwaggerMove
  | ForesightMove
  | SwapMove
  | HealingWishMove
  | CamouflageMove
  | NaturePowerMove;

type Effect =
  | Status
  | [StageId, number][]
  | "confusion"
  | "flinch"
  | "thief"
  | "tri_attack"
  | "knockoff";

type Flag =
  | "none"
  | "high_crit"
  | "drain"
  | "explosion"
  | "recharge"
  | "crash"
  | "double"
  | "triple"
  | "multi"
  | "dream_eater"
  | "bide"
  | "payday"
  | "multi_turn"
  | "rage"
  | "trap"
  | "ohko"
  | "uturn"
  | "norand"
  | "magnitude"
  | "false_swipe"
  | "rapid_spin"
  | "fury_cutter"
  | "rollout"
  | "minimize"
  | "present"
  | "beatup"
  | "facade"
  | "remove_screens"
  | "remove_protect"
  | "smellingsalt"
  | "spitup"
  | "uproar"
  | "revenge"
  | "bugbite"
  | "futuresight"
  | "assurance";

const createMoveList = (list: any) => {
  let idx = 0;
  for (const moveId in list) {
    const move = list[moveId] as any;
    move.id = moveId;
    move.idx = idx++;
    move.range = Range[move.range];
    if (move.kind === "volatile") {
      move.flag = VF[move.flag];
    }
    if (move.category) {
      move.category = MC[move.category];
    }
  }
  return Object.freeze(list);
};

export const moveList = createMoveList(rawMoveList) as Record<MoveId, Move>;

export type ScriptFn = (
  battle: Battle,
  user: ActivePokemon,
  targets: ActivePokemon[],
  indexInMoves?: number,
) => void;

export type MoveScripts = {
  [K in Required<Move>["kind"] | MoveScriptId]: (
    this: Move & {kind: K},
    ...args: Parameters<ScriptFn>
  ) => ReturnType<ScriptFn>;
};

type PR<V> = Partial<Record<MoveId, V>>;

export type MovePropOverrides = {
  dmg: PR<
    (this: DamagingMove, battle: Battle, user: ActivePokemon, target: ActivePokemon) => number
  >;
  pow: PR<(this: DamagingMove, user: Pokemon, target: Pokemon) => number>;
  acc: PR<(this: Move, weather: Weather | undefined) => number | undefined>;
  type: PR<(this: Move, user: Pokemon, weather: Weather | undefined) => Type>;
  dmgPreCheck: PR<
    (this: DamagingMove, battle: Battle, user: ActivePokemon, targets: ActivePokemon[]) => bool
  >;
};

export const moveScripts: MoveScripts = {
  volatile(battle, user) {
    if (user.v.hasFlag(this.flag)) {
      return battle.info(user, "fail_generic");
    }

    const key = VF[this.flag];
    if (!key) {
      console.error("Attempt to set invalid VolatileFlag value: " + this.flag);
      return battle.info(user, "fail_generic");
    }
    return battle.info(user, key as InfoReason, [user.setFlag(this.flag)]);
  },
  confuse(battle, user, targets) {
    let failed = true;
    for (const target of targets) {
      if (battle.tryMagicBounce(this, user, target)) {
        return;
      } else if (target.v.substitute) {
        continue;
      } else if (target.hasAbility("owntempo")) {
        battle.ability(target);
        battle.info(target, "immune");
        failed = false;
        continue;
      } else if (target.owner.screens.safeguard) {
        battle.info(target, "safeguard_protect");
        failed = false;
        continue;
      } else if (!battle.checkAccuracy(this, user, target)) {
        failed = false;
        continue;
      }

      if (target.confuse(battle)) {
        failed = false;
      }
    }

    if (failed) {
      battle.info(user, "fail_generic");
    }
  },
  recover(battle, user) {
    const diff = user.base.stats.hp - user.base.hp;
    if (diff === 0 || diff % 255 === 0) {
      return battle.info(user, "fail_generic");
    }

    if (this.why === "rest") {
      if (user.getAbility()?.preventsStatus === "slp") {
        return battle.info(user, "fail_generic");
      }

      user.base.status = "slp";
      user.base.sleepTurns = 2;
      if (user.hasAbility("earlybird")) {
        user.base.sleepTurns--;
      }
      user.recover(diff, user, battle, this.why, true);
      // In gen 1, Rest doesn't reset the toxic counter or par/brn stat drops
    } else {
      user.recover(Math.floor(user.base.stats.hp / 2), user, battle, this.why);
    }
  },
  stage(battle, user, targets) {
    battle.gen1LastDamage = 0;
    let failed = true;

    const id = this.id!;
    for (const target of targets) {
      if (this.range !== Range.Self) {
        if (battle.tryMagicBounce(this, user, target)) {
          return;
        } else if (target.v.hasFlag(VF.mist) || target.owner.screens.mist) {
          failed = false;
          battle.info(target, "mist_protect");
          continue;
        } else if (target.v.substitute && !this.ignoreSub) {
          continue;
        } else if (id === "captivate") {
          // Is this the correct ordering? IE would we reveal the target ability if the move would
          // fail for some other reason?
          if (target.hasAbility("oblivious")) {
            failed = false;
            battle.ability(target);
            battle.info(target, "immune");
            continue;
          } else if (
            user.base.gender === target.base.gender ||
            user.base.gender === "N" ||
            target.base.gender === "N"
          ) {
            continue;
          }
        }

        if (!battle.checkAccuracy(this, user, target)) {
          failed = false;
          continue;
        }
      }

      target.modStages(this.stages, battle, user);
      failed = false;
    }

    if (failed) {
      return battle.info(user, "fail_generic");
    }

    user.v.usedMinimize = user.v.usedMinimize || id === "minimize";
    user.v.usedDefenseCurl = user.v.usedDefenseCurl || id === "defensecurl";
  },
  status(battle, user, [target]) {
    if (target.v.substitute && this.status !== "par" && this.status !== "slp") {
      return battle.info(target, "fail_generic");
    } else if (
      (this.type === "electric" && battle.gen.getEffectiveness(this.type, target.v.types) === 0) ||
      (this.type === "poison" && target.v.types.includes("poison")) ||
      (this.type === "fire" && target.v.types.includes("fire"))
    ) {
      return battle.info(target, "immune");
    } else if (target.owner.screens.safeguard) {
      return battle.info(target, "safeguard_protect");
    } else if (this.status === "slp" && target.v.recharge) {
      // https://www.youtube.com/watch?v=x2AgAdQwyGI
      return target.status(this.status, battle, user, {override: true});
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.status(this.status, battle, user, {override: false, loud: true});
  },
  switch(battle, user) {
    user.switchTo(this.poke, battle);
  },
  damage(battle, user, targets) {
    const checkSuccess = battle.gen.move.overrides.dmgPreCheck[this.id!];
    if (checkSuccess && !checkSuccess.call(this, battle, user, targets)) {
      user.v.charging = undefined;
      return battle.sv([user.clearFlag(VF.charge)]);
    }

    let power: number | undefined;
    if (this.flag === "multi_turn" && !user.v.thrashing) {
      // when called by sleep talk, thrashing moves don't lock the user in
      if (user.lastChosenMove !== battle.gen.moveList.sleeptalk) {
        user.v.thrashing = {move: this, turns: battle.gen.rng.thrashDuration(battle), max: false};
        user.v.thrashing.max = user.v.thrashing.turns === battle.gen.rng.maxThrash;
      }
    } else if (this.flag === "rollout" && !user.v.thrashing) {
      if (user.lastChosenMove !== battle.gen.moveList.sleeptalk) {
        user.v.thrashing = {move: this, turns: 5, max: false};
      }
    } else if (this.flag === "fury_cutter") {
      user.v.furyCutter++;
    } else if (this.flag === "bide") {
      if (!user.v.bide) {
        user.v.bide = {move: this, turns: battle.gen.rng.bideDuration(battle), dmg: 0};
        return;
      }

      battle.gen.accumulateBide(battle, user, user.v.bide);
      if (--user.v.bide.turns !== 0) {
        return battle.info(user, "bide_store");
      }

      battle.info(user, "bide");
    } else if (this.flag === "magnitude") {
      const magnitude = battle.rng.int(4, 10);
      power = [10, 30, 50, 70, 90, 110, 150][magnitude - 4];
      battle.event({type: "magnitude", magnitude});
    } else if (this.flag === "futuresight") {
      const [target] = targets;
      if (target.futureSight) {
        return battle.info(user, "fail_generic");
      }

      const {dmg} = battle.gen.getDamage({
        user,
        target,
        battle,
        move: this,
        skipType: true,
        isCrit: false,
      });
      target.futureSight = {damage: dmg, turns: 3, move: this};
      return battle.event({
        type: "futuresight",
        src: user.id,
        move: this.id!,
        release: false,
      });
    }

    if (this.range === Range.Self) {
      if (user.v.lastHitBy && !user.v.lastHitBy.poke.v.fainted) {
        targets = [user.v.lastHitBy.poke];
      } else {
        // Counter/Mirror Coat/Bide will not retarget into another slot, but in a Gen 3 double
        // battle they can still hit a pokemon that didn't target it if the original pokemon dies
        // and is replaced by a teammate.
        return battle.info(user, "fail_generic");
      }
    }

    let dealt = 0;
    const killed = [];
    for (const target of targets) {
      dealt += battle.gen.tryDamage(this, battle, user, target, targets.length > 1, power);

      if (!target.base.hp && target.owner !== user.owner) {
        killed.push(target);
      }
    }

    for (const target of killed) {
      if (target.v.hasFlag(VF.destinyBond)) {
        user.damage(user.base.hp, target, battle, false, "destiny_bond", true);
        // user should die first
        battle.checkFaint(target);
      }

      if (target.v.hasFlag(VF.grudge)) {
        if (user.v.lastMoveIndex === undefined) {
          console.error("Grudge with no lastMoveIndex: ", user);
        } else {
          user.base.pp[user.v.lastMoveIndex] = 0;
          battle.event({
            type: "grudge",
            src: user.id,
            move: user.base.moves[user.v.lastMoveIndex],
          });
        }
      }
    }

    user.handleShellBell(battle, dealt);
    battle.sv([user.clearFlag(VF.charge)]);

    if (this.flag === "bide") {
      user.v.bide = undefined;
    } else if (user.v.inBatonPass) {
      battle.checkFaint(user);
      if (battle.finished) {
        user.v.inBatonPass = undefined;
      }
    }
  },
  fail(battle, user) {
    battle.info(user, this.why);
  },
  weather(battle, user) {
    battle.setWeather(this.weather, user.base.item?.extendWeather === this.weather ? 8 : 5);
  },
  screen(battle, user) {
    if (user.owner.screens[this.screen]) {
      return battle.info(user, "fail_generic");
    }

    user.owner.screens[this.screen] = this.turns ?? 5;
    battle.event({
      type: "screen",
      screen: this.screen,
      kind: "start",
      user: user.owner.id,
      volatiles:
        this.screen === "tailwind"
          ? user.owner.active.map(p => ({id: p.id, v: {stats: p.clientStats(battle)}}))
          : undefined,
    });
  },
  phaze(battle, user, [target]) {
    const next = battle.rng.choice(
      target.owner.team.filter(p => p.hp && target.owner.active.every(a => p !== a.base.real)),
    );
    if (!next || !target.choice?.executed) {
      return battle.info(user, "fail_generic");
    } else if (target.hasAbility("suctioncups")) {
      battle.ability(target);
      return battle.info(target, "immune");
    } else if (target.v.hasFlag(VF.ingrain)) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.switchTo(next, battle, user);
  },
  protect(battle, user) {
    if (user.v.substitute || (battle.turnOrder.at(-1) === user && !this.endure)) {
      user.v.protectCount = 0;
      return battle.info(user, "fail_generic");
    }

    const threshold = [255, 127, 63, 31, 15, 7, 3, 1];
    if ((threshold[user.v.protectCount] ?? 0) <= battle.rng.int(0, 254)) {
      user.v.protectCount = 0;
      return battle.info(user, "fail_generic");
    }

    user.v.protectCount++;
    if (!this.endure) {
      battle.info(user, "protect", [user.setFlag(VF.protect)]);
    } else {
      battle.info(user, "endure", [user.setFlag(VF.endure)]);
    }
  },
  noSwitch(battle, user, [target]) {
    if (target.v.meanLook) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.meanLook = user;
    battle.info(target, "meanlook", [{id: target.id, v: {flags: target.v.cflags}}]);
  },
  lockOn(battle, user, [target]) {
    if (target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    battle.event({
      type: "lock_on",
      src: user.id,
      target: target.id,
      volatiles: [target.setFlag(VF.lockon)],
    });
  },
  healbell(battle, user) {
    battle.info(user, this.why);
    for (const poke of user.owner.active) {
      if (this.sound && poke.base.status && poke.hasAbility("soundproof")) {
        battle.ability(poke);
        battle.info(poke, "immune");
        continue;
      }

      poke.unstatus(battle);
    }
    const opp = battle.opponentOf(user.owner);
    for (const poke of user.owner.team) {
      if (this.sound && poke.ability === "soundproof") {
        continue;
      } else if (user.owner.active.some(p => p.base.real === poke)) {
        continue;
      }

      poke.status = undefined;
      if (opp.sleepClausePoke === poke) {
        opp.sleepClausePoke = undefined;
      }
    }
  },
  swagger(battle, user, [target]) {
    if (target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (target.owner.screens.safeguard) {
      target.modStages(this.stages, battle, user);
      return battle.info(target, "safeguard_protect");
    } else if (target.hasAbility("owntempo")) {
      target.modStages(this.stages, battle, user);
      battle.ability(target);
      return battle.info(target, "not_confused");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    } else if (!target.modStages(this.stages, battle, user) && battle.gen.id <= 2) {
      return;
    } else {
      target.confuse(battle);
    }
  },
  foresight(battle, user, [target]) {
    if (battle.tryMagicBounce(this, user, target)) {
      return;
    } else if (target.v.identified && battle.gen.id <= 2 && battle.gen.id >= 5) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.identified = this;
    battle.event({
      type: "foresight",
      src: user.id,
      target: target.id,
      volatiles: [{id: target.id, v: {flags: target.v.cflags}}],
    });
  },
  trick(battle, user, [target]) {
    if (target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (target.hasAnyAbility("stickyhold", "multitype")) {
      battle.ability(target);
      return battle.info(target, "immune");
    } else if (
      (!target.base.itemId && !user.base.itemId) ||
      target.base.itemUnusable ||
      user.base.itemUnusable ||
      target.base.itemId === "enigmaberry" ||
      target.base.itemId === "griseousorb" ||
      target.base.itemId?.includes("mail")
    ) {
      return battle.info(user, "fail_generic");
    }

    const userItem = user.base.itemId;
    user.manipulateItem(poke => (poke.itemId = target.base.itemId));
    target.manipulateItem(poke => (poke.itemId = userItem));
    battle.event({
      type: "trick",
      src: user.id,
      target: target.id,
      srcItem: user.base.itemId,
      targetItem: target.base.itemId,
    });
  },
  hazard(battle, user) {
    const target = battle.opponentOf(user.owner);
    if ((target.hazards[this.hazard] ?? 0) >= this.max) {
      return battle.info(user, "fail_generic");
    }

    battle.event({
      type: "hazard",
      src: user.id,
      player: target.id,
      hazard: this.hazard,
      spin: false,
    });
    target.hazards[this.hazard] = (target.hazards[this.hazard] ?? 0) + 1;
  },
  swap(battle, user, [target]) {
    for (const stat of this.stats) {
      [user.v.stages[stat], target.v.stages[stat]] = [target.v.stages[stat], user.v.stages[stat]];
    }
    battle.info(
      user,
      this.message,
      [user, target].map(t => ({id: t.id, v: t.getClientVolatiles(battle)})),
    );
  },
  hwish(battle, user) {
    if (!user.owner.team.some(p => p.hp && user.owner.active.every(a => p !== a.base.real))) {
      return battle.info(user, "fail_generic");
    }

    user.v.hwish = this;
    user.damage2(battle, {dmg: user.base.hp, src: user, why: "explosion", direct: true});
    if (battle.gen.id <= 4) {
      user.v.inBatonPass = "hwish";
    }
  },
  // Individual move functions
  conversion(battle, user, [target]) {
    user.v.types = [...target.v.types];
    battle.event({
      type: "conversion",
      src: user.id,
      target: target.id,
      types: [...user.v.types],
      volatiles: [{id: user.id, v: {types: [...user.v.types]}}],
    });
  },
  disable(battle, user, [target]) {
    battle.gen1LastDamage = 0;

    const options = [...target.base.moves.keys()].filter(i => target.base.pp[i] !== 0);
    if (!options.length || target.v.disabled) {
      battle.info(user, "fail_generic");
      target.handleRage(battle);
      return;
    } else if (!battle.checkAccuracy(this, user, target)) {
      target.handleRage(battle);
      return;
    }

    const indexInMoves = battle.rng.choice(options)!;
    target.v.disabled = {indexInMoves, turns: battle.gen.rng.disableTurns(battle)};
    battle.event({
      type: "disable",
      src: target.id,
      move: target.base.moves[indexInMoves],
      volatiles: [{id: target.id, v: {flags: target.v.cflags}}],
    });
    target.handleRage(battle);
  },
  haze(battle, user, targets) {
    for (const target of targets) {
      target.v.clearFlag(VF.lightScreen | VF.reflect | VF.mist | VF.focusEnergy);
      for (const k of stageKeys) {
        target.v.stages[k] = 0;
      }
      target.v.counter = 0;
      target.v.confusion = 0;
      target.v.disabled = undefined;
      target.v.seededBy = undefined;
      target.v.stats = {...target.base.stats};
      if (target === user) {
        continue;
      }

      if (target.base.status === "frz" || target.base.status === "slp") {
        target.base.sleepTurns = 0;
        target.v.hazed = true;
      }

      target.base.status = undefined;
    }

    if (user.base.status === "tox") {
      user.base.status = "psn";
    }

    battle.info(
      user,
      "haze",
      targets.map(t => ({id: t.id, v: t.getClientVolatiles(battle)})),
    );
  },
  leechseed(battle, user, [target]) {
    if (target.v.types.includes("grass")) {
      return battle.info(target, "immune");
    } else if (target.v.seededBy) {
      return battle.info(target, "fail_generic");
    } else if (battle.gen.id >= 2 && target.v.substitute) {
      return battle.info(target, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.seededBy = user;
    battle.info(target, "seeded", [{id: target.id, v: {flags: target.v.cflags}}]);
  },
  metronome(battle, user) {
    battle.gen1LastDamage = 0;
    const moves = Object.entries(battle.gen.moveList)
      .filter(([, move]) => !move.noMetronome && move.idx! <= battle.gen.lastMoveIdx)
      .filter(
        ([id]) => (battle.gen.id !== 2 && battle.gen.id !== 4) || !user.base.moves.includes(id),
      )
      .map(([, move]) => move);
    return battle.callMove(battle.rng.choice(moves)!, user);
  },
  mimic(battle, user, [target], indexInMoves) {
    if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    user.v.mimic = {
      indexInMoves: indexInMoves ?? user.v.lastMoveIndex ?? -1,
      move: battle.rng.choice(target.base.moves)!,
    };

    battle.event({
      type: "mimic",
      src: user.id,
      move: user.v.mimic.move,
    });
  },
  mirrormove(battle, user) {
    battle.gen1LastDamage = 0;
    const lastHitBy = user.v.lastHitBy;
    if (user.base.transformed && battle.gen.id === 2) {
      return battle.info(user, "fail_generic");
    } else if (!lastHitBy || lastHitBy.poke.v.lastMove !== lastHitBy.move) {
      return battle.info(user, "fail_generic");
    }
    return battle.callMove(lastHitBy.move, user);
  },
  substitute(battle, user) {
    const hp = Math.floor(user.base.stats.hp / 4);
    if (user.v.substitute) {
      return battle.info(user, "has_substitute");
    } else if (hp > user.base.hp) {
      // Gen 1 bug, if you have exactly 25% hp you can create a substitute and instantly die
      return battle.info(user, "cant_substitute");
    }

    user.v.substitute = hp + 1;
    user.damage(hp, user, battle, false, "substitute", true, undefined, [
      {id: user.id, v: {flags: user.v.cflags}},
    ]);
  },
  transform(battle, user, [target]) {
    battle.gen1LastDamage = 0;
    user.transform(battle, target);
  },
  attract(battle, user, [target]) {
    if (target.hasAbility("oblivious")) {
      battle.ability(target);
      return battle.info(target, "immune");
    } else if (
      user.base.gender === "N" ||
      target.base.gender === "N" ||
      user.base.gender === target.base.gender ||
      target.v.attract
    ) {
      battle.info(user, "fail_generic");
      return;
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.attract = user;
    battle.info(target, "attract", [{id: target.id, v: {flags: target.v.cflags}}]);
  },
  batonpass(battle, user) {
    if (!user.canBatonPass()) {
      return battle.info(user, "fail_generic");
    }

    user.v.inBatonPass = "batonpass";
    battle.info(user, "batonpass");
  },
  bellydrum(battle, user) {
    if (user.v.stages.atk >= 6) {
      battle.info(user, "fail_generic");
      return;
    }

    const dmg = idiv(user.base.stats.hp, 2);
    if (user.base.hp < dmg) {
      battle.info(user, "fail_generic");

      if (battle.gen.id <= 2) {
        battle.event({
          type: "bug",
          bug: "bug_gen2_bellydrum",
          volatiles: user.setStage("atk", Math.min(user.v.stages.atk + 2, 6), battle, false),
        });
      }
      return;
    }

    user.damage(
      dmg,
      user,
      battle,
      false,
      "belly_drum",
      true,
      undefined,
      user.setStage("atk", +6, battle, false),
    );
  },
  conversion2(battle, user) {
    let lastType = user.v.lastHitBy?.move?.type;
    if (!lastType) {
      return battle.info(user, "fail_generic");
    }

    if (lastType === "???") {
      lastType = "normal";
    }

    const types = battle.gen.typeMatchupTable.filter(([atk, , mod]) => {
      return atk === lastType && mod < 10;
    });
    const v = user.setVolatile("types", [battle.rng.choice(types)![1]]);
    battle.event({
      type: "conversion",
      src: user.id,
      types: [...user.v.types],
      volatiles: [v],
    });
  },
  curse(battle, user, [target]) {
    if (!user.v.types.includes("ghost")) {
      // prettier-ignore
      if (battle.gen.id <= 2 && user.v.stages.atk >= 6 && user.v.stages.def >= 6) {
        return battle.info(user, "fail_generic");
      } else if (!user.modStages([["spe", -1], ["atk", +1], ["def", +1]], battle)) {
        return battle.info(user, "fail_generic");
      }
    } else {
      // mid-turn type switch
      if (target === user) {
        target = battle.getTargets(user, Range.Adjacent)[0];
        // shouldn't be possible in gen 3?
        if (!target) {
          return battle.info(user, "fail_notarget");
        }
      }

      if (target.v.substitute || target.v.hasFlag(VF.curse)) {
        return battle.info(user, "fail_generic");
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      user.damage(
        idiv(user.base.stats.hp, 2),
        target,
        battle,
        false,
        "set_curse",
        true,
        undefined,
        [target.setFlag(VF.curse)],
      );
    }
  },
  encore(battle, user, [target]) {
    if (
      target.v.lastMoveIndex === undefined ||
      target.v.encore ||
      battle.gen.moveList[target.base.moves[target.v.lastMoveIndex]].noEncore ||
      !target.base.pp[target.v.lastMoveIndex]
    ) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.encore = {indexInMoves: target.v.lastMoveIndex, turns: battle.rng.int(2, 6) + 1};
    battle.info(target, "encore", [{id: target.id, v: {flags: target.v.cflags}}]);
  },
  nightmare(battle, user, [target]) {
    if (target.v.hasFlag(VF.nightmare) || target.base.status !== "slp") {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    battle.info(target, "nightmare", [target.setFlag(VF.nightmare)]);
  },
  painsplit(battle, user, [target]) {
    if (target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    battle.info(user, "pain_split");

    const hp = idiv(user.base.hp + target.base.hp, 2);
    if (user.base.hp < hp) {
      user.recover(hp - user.base.hp, user, battle, "pain_split");
    } else {
      user.damage(user.base.hp - hp, user, battle, false, "pain_split", true);
    }

    if (target.base.hp < hp) {
      target.recover(hp - target.base.hp, user, battle, "pain_split");
    } else {
      const {dealt} = target.damage(target.base.hp - hp, user, battle, false, "pain_split", true);
      if (battle.gen.id === 3 && target.v.bide) {
        target.v.bide.dmg += dealt;
      }
    }
  },
  perishsong(battle, user, targets) {
    for (const poke of targets) {
      if (poke.hasAbility("soundproof")) {
        battle.ability(poke);
        battle.info(poke, "immune");
        continue;
      }

      if (!poke.v.perishCount) {
        poke.v.perishCount = 4;
      }
    }
    battle.info(
      user,
      "perish_song",
      targets.map(poke => ({id: poke.id, v: {perishCount: poke.v.perishCount}})),
    );
  },
  psychup(battle, user, [target]) {
    if (Object.values(target.v.stages).every(v => v === 0)) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    user.v.stages = {...target.v.stages};
    for (const stat of stageStatKeys) {
      battle.gen.recalculateStat(user, battle, stat, false);
    }
    battle.event({
      type: "psych_up",
      src: user.id,
      target: target.id,
      volatiles: [{id: user.id, v: {stats: user.clientStats(battle), stages: {...user.v.stages}}}],
    });
  },
  sketch(battle, user, [target], moveIndex) {
    if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    if (moveIndex === undefined) {
      // called by sleep talk
      moveIndex = user.base.moves.indexOf("sketch");
      // TODO: call by mirror move? is that even possible
      if (moveIndex === -1) {
        console.warn("sketch called with no moveIndex: ", user);
        return battle.info(user, "fail_generic");
      }
    }

    if (!target.v.lastMove) {
      return battle.info(user, "fail_generic");
    }

    const id = target.v.lastMove.id!;
    const idx = target.base.moves.indexOf(id);
    // Fail for struggle, metronome, mirror move, sleep talk
    if (
      idx === -1 ||
      target.v.lastMove === this ||
      target.v.lastMove.noEncore ||
      user.base.moves.includes(id)
    ) {
      return battle.info(user, "fail_generic");
    }

    user.base.moves[moveIndex] = id;
    user.base.pp[moveIndex] = battle.gen.getMaxPP(target.v.lastMove);
    battle.event({type: "sketch", src: user.id, move: id});
  },
  sleeptalk(battle, user) {
    const m = battle.rng.choice(
      user.base.moves.filter(
        m =>
          !battle.gen.moveList[m].noSleepTalk &&
          (!user.v.disabled || m !== user.base.moves[user.v.disabled.indexInMoves]),
      ),
    );
    if (!m) {
      return battle.info(user, "fail_generic");
    }

    // TODO: https://bulbapedia.bulbagarden.net/wiki/Sleep_Talk_(move)
    // If Sleep Talk calls Metronome or Mirror Move (which are selectable by Sleep Talk only in
    // this generation) and thus in turn calls a two-turn move, the move will fail.
    return battle.callMove(battle.gen.moveList[m], user);
  },
  spite(battle, user, [target]) {
    if (!battle.checkAccuracy(this, user, target)) {
      return;
    } else if (!target.v.lastMove) {
      return battle.info(user, "fail_generic");
    }
    const id = target.v.lastMove.id!;
    const idx = target.base.moves.indexOf(id);
    // Fail for struggle, metronome, mirror move, sleep talk unless it called a move we already
    // know (which metronome cant in gen 2)
    if (idx === -1 || !target.base.pp[idx]) {
      return battle.info(user, "fail_generic");
    }

    const amount = Math.min(battle.rng.int(2, 5), target.base.pp[idx]);
    target.base.pp[idx] -= amount;
    battle.event({type: "spite", src: target.id, move: id, amount});
  },
  assist(battle, user) {
    const moves = user.owner.team
      .flatMap(p => (p !== user.base.real ? p.moves : []))
      .map(move => battle.gen.moveList[move])
      .filter(move => !move.noAssist);
    const move = battle.rng.choice(moves);
    if (!move) {
      return battle.info(user, "fail_generic");
    }
    return battle.callMove(move, user);
  },
  camouflage(battle, user) {
    battle.event({
      type: "conversion",
      types: [this.camouflageType],
      src: user.id,
      volatiles: [user.setVolatile("types", [this.camouflageType])],
    });
  },
  charge(battle, user) {
    battle.info(user, "charge", [user.setFlag(VF.charge)]);
  },
  helpinghand(battle, user, [target]) {
    if (target.choice?.executed) {
      return battle.info(user, "fail_generic");
    }

    battle.event({
      type: "helping_hand",
      src: user.id,
      target: target.id,
      volatiles: [target.setFlag(VF.helpingHand)],
    });
  },
  imprison(battle, user) {
    const moves = new Set(user.moveset());
    const good = battle.allActive.some(
      p => !p.v.fainted && p.owner !== user.owner && !new Set(p.moveset()).isDisjointFrom(moves),
    );

    if (!good) {
      return battle.info(user, "fail_generic");
    }

    return battle.info(user, "imprisoning", [user.setFlag(VF.imprisoning)]);
  },
  memento(battle, user, [target]) {
    let faint = true;
    // prettier-ignore
    if (target.v.hasFlag(VF.mist) || target.owner.screens.mist) {
      battle.info(target, "mist_protect");
    } else if (target.v.hasFlag(VF.protect)) {
      battle.info(target, "protect");
    } else if (target.v.substitute) {
      battle.info(target, "fail_generic");
    } else if (!target.modStages([["atk", -2], ["spa", -2]], battle, user)) {
      faint = false;
    }

    if (faint) {
      user.damage(user.base.hp, user, battle, false, "explosion");
    }
  },
  naturepower(battle, user) {
    // TODO: should target the opponent across from the user
    battle.callMove(battle.gen.moveList[this.calls], user);
  },
  recycle(battle, user) {
    if (!user.consumed) {
      return battle.info(user, "fail_generic");
    }

    battle.event({type: "recycle", src: user.id, item: user.consumed});
    user.base.itemId = user.consumed;
    user.consumed = undefined;
  },
  refresh(battle, user) {
    if (!["brn", "psn", "par", "tox"].includes(user.base.status)) {
      return battle.info(user, "fail_generic");
    }
    user.unstatus(battle);
  },
  roleplay(battle, user, [target]) {
    if (target.hasAbility("multitype") || user.hasAbility("multitype")) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    const v = user.setVolatile("ability", target.v.ability);
    battle.event({
      type: "copy_ability",
      src: user.id,
      target: target.id,
      ability: user.v.ability!,
      volatiles: [v],
    });
  },
  skillswap(battle, user, [target]) {
    if (target.hasAbility("multitype") || user.hasAbility("multitype")) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    const mine = user.v.ability;
    user.v.ability = target.v.ability;
    target.v.ability = mine;
    // skill swap doesn't reveal the abilities until Gen V
    battle.event({
      type: "skill_swap",
      src: user.id,
      target: target.id,
      volatiles: [
        {id: user.id, v: {ability: null}},
        {id: target.id, v: {ability: null}},
      ],
    });
  },
  stockpile(battle, user) {
    if (user.v.stockpile === 3) {
      return battle.info(user, "fail_generic");
    }

    user.v.stockpile++;
    battle.event({
      type: "stockpile",
      src: user.id,
      count: user.v.stockpile,
      volatiles: [{id: user.id, v: {stockpile: user.v.stockpile}}],
    });
  },
  swallow(battle, user) {
    if (!user.v.stockpile) {
      return battle.info(user, "fail_generic");
    }

    const d = {3: 1, 2: 2, 1: 4}[user.v.stockpile] ?? 4;
    user.recover(Math.max(1, idiv(user.base.stats.hp, d)), user, battle, "recover");
    battle.sv([user.setVolatile("stockpile", 0)]);
  },
  taunt(battle, user, [target]) {
    if (target.v.tauntTurns) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.tauntTurns = 2 + 1;
    battle.info(target, "taunt", [{id: target.id, v: {flags: target.v.cflags}}]);
  },
  torment(battle, user, [target]) {
    if (target.v.hasFlag(VF.torment)) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    battle.info(target, "torment", [target.setFlag(VF.torment)]);
  },
  wish(battle, user) {
    if (user.wish) {
      return battle.info(user, "fail_generic");
    }

    battle.info(user, "wish");
    user.wish = {user: user.base, turns: 2};
  },
  yawn(battle, user, [target]) {
    if (target.v.substitute || target.base.status || target.v.drowsy || battle.hasUproar(target)) {
      return battle.info(user, "fail_generic");
    } else if (target.getAbility()?.preventsStatus === "slp") {
      battle.ability(target);
      return battle.info(target, "immune");
    } else if (target.owner.screens.safeguard) {
      return battle.info(target, "safeguard_protect");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.drowsy = 2;
    battle.info(target, "drowsy", [{id: target.id, v: {flags: target.v.cflags}}]);
  },
  acupressure(battle, user, [target]) {
    if (target.v.substitute) {
      return battle.info(user, "fail_generic");
    }

    const key = battle.rng.choice(stageKeys.filter(key => target.v.stages[key] !== 6));
    if (!key) {
      return battle.info(user, "fail_generic");
    }

    target.modStages([[key, +2]], battle, user);
  },
  gastroacid(battle, user, [target]) {
    if (battle.tryMagicBounce(this, user, target)) {
      return;
    } else if (target.v.hasFlag(VF.gastroAcid)) {
      return battle.info(user, "fail_generic");
    } else if (target.hasAbility("multitype")) {
      battle.ability(target);
      return battle.info(target, "immune");
    }

    return battle.info(target, "gastroAcid", [target.setFlag(VF.gastroAcid)]);
  },
};

export const moveOverrides: MovePropOverrides = {
  pow: {
    // Gen III
    flail: getFlailPower,
    frustration: user => idiv(255 - user.friendship, 2.5),
    hiddenpower({ivs: dvs}) {
      const msb = (dv?: number) => +(((dv ?? 15) & (1 << 3)) !== 0);

      const x = msb(dvs.spa) | (msb(dvs.spe) << 1) | (msb(dvs.def) << 2) | (msb(dvs.atk) << 3);
      const y = (dvs.spa ?? 15) & 0b11;
      return idiv(5 * x + y, 2) + 31;
    },
    return: user => idiv(user.friendship, 2.5),
    reversal: getFlailPower,
    eruption: user => Math.max(1, Math.floor((user.hp * 150) / user.stats.hp)),
    waterspout: user => Math.max(1, Math.floor((user.hp * 150) / user.stats.hp)),
    // Gen IV
    crushgrip: getCrushGripPower,
    grassknot: (_user, target) => getLowKickPower(target.species.weight),
    wringout: getCrushGripPower,
    // Gen V
    acrobatics(user) {
      return !user.itemId ? this.power * 2 : this.power;
    },
    brine(_user, target) {
      return target.belowHp(2) ? this.power * 2 : this.power;
    },
    hex(_, target) {
      return target.status ? this.power * 2 : this.power;
    },
    venoshock(_user, target) {
      return target.status === "psn" || target.status === "tox" ? this.power * 2 : this.power;
    },
  },
  dmg: {
    bide: (_, user) => {
      // Bide doesn't have an overflow check
      // https://github.com/pret/pokered/blob/fbcf7d0e19a3a2db505440d3ccd3d40ca996c15c/engine/battle/core.asm#L5878
      // https://github.com/pret/pokered/blob/fbcf7d0e19a3a2db505440d3ccd3d40ca996c15c/engine/battle/core.asm#L3503
      return ((user.v.bide?.dmg ?? 0) << 1) & 0xffff;
    },
    counter(battle, _, target) {
      // https://www.youtube.com/watch?v=ftTalHMjPRY
      //  On cartrige, the move counter uses is updated whenever a player hovers over a move (even
      //  if he doesn't select it). In a link battle, this information is not shared between both
      //  players. This means, that a player can influence the ability of counter to succeed by
      //  hovering over a move on their side, cancelling the 'FIGHT' menu, and switching out. Since
      //  we don't have a FIGHT menu, and this can cause a desync anyway, just use the last
      //  attempted move.

      const mv = target.lastChosenMove;
      if (
        mv &&
        ((mv.type !== "normal" && mv.type !== "fight") || mv.kind !== "damage" || mv === this)
      ) {
        return 0;
      } else if (target.choice?.move === this) {
        return 0;
      }
      // Counter can crit, but it won't do any more damage
      // Counter checks for an overflow and sets the damage to 0xffff in that case
      return Math.min(battle.gen1LastDamage << 1, 0xffff);
    },
    nightshade: (_, user) => user.base.level,
    psywave(battle, user) {
      // Psywave generates a random number between 1 and Level * 1.5 exclusive for the player,
      // and 0 and level * 1.5 exclusive for the enemy. This can cause a desync, so we
      // just always use [1, level * 1.5).
      const upperBound = Math.max(1, user.base.level + (user.base.level >> 1));
      return battle.rng.int(1, upperBound);
    },
    seismictoss: (_, user) => user.base.level,
    superfang: (_battle, _, target) => Math.max(Math.floor(target.base.hp / 2), 1),
    mirrorcoat(_battle, user) {
      if (!user.v.lastHitBy || !user.v.lastHitBy.special) {
        return 0;
      }
      return Math.min(user.v.retaliateDamage << 1, 0xffff);
    },
    endeavor: (_, user, target) => Math.max(0, target.base.hp - user.base.hp),
  },
  acc: {
    hurricane: thunderAccOverride,
  },
  type: {
    hiddenpower(user) {
      return HP_TYPES[(((user.ivs.atk ?? 15) & 0b11) << 2) | ((user.ivs.def ?? 15) & 0b11)];
    },
    weatherball(_user, weather) {
      return (
        (weather && ({hail: "ice", sand: "rock", rain: "water", sun: "fire"} as const)[weather]) ??
        "normal"
      );
    },
    judgment: user => user.item?.plate ?? "normal",
    technoblast(user) {
      // prettier-ignore
      switch (user.item?.drive) {
      case "douse": return "water";
      case "shock": return "electric";
      case "burn": return "fire";
      case "chill": return "ice";
      default: return this.type;
      }
    },
  },
  dmgPreCheck: {
    fakeout(battle, user) {
      if (!user.v.canFakeOut) {
        battle.info(user, "fail_generic");
        return false;
      }
      return true;
    },
    focuspunch(battle, user) {
      if (!user.v.hasFocus) {
        battle.info(user, "fail_focus");
        return false;
      }
      return true;
    },
    suckerpunch(battle, user, [target]) {
      if (target?.choice?.move?.kind !== "damage" || target?.choice?.executed) {
        battle.info(user, "fail_generic");
        return false;
      }
      return true;
    },
  },
};

function getFlailPower(user: Pokemon) {
  const percent = user.hpPercent;
  if (percent >= 68.8) {
    return 20;
  } else if (percent >= 35.4) {
    return 40;
  } else if (percent >= 20.8) {
    return 80;
  } else if (percent >= 10.4) {
    return 100;
  } else if (percent >= 4.2) {
    return 150;
  } else {
    return 200;
  }
}

function getCrushGripPower(_user: Pokemon, target?: Pokemon) {
  return target ? 1 + Math.floor(120 * (target.hp / target.stats.hp)) : 0;
}

export function getLowKickPower(weight: number): number {
  if (weight <= 9.9) {
    return 20;
  } else if (weight <= 24.9) {
    return 40;
  } else if (weight <= 49.9) {
    return 60;
  } else if (weight <= 99.9) {
    return 80;
  } else if (weight <= 199.9) {
    return 100;
  } else {
    return 120;
  }
}

export function thunderAccOverride(this: Move, weather?: Weather) {
  switch (weather) {
    case "rain":
      return undefined;
    case "sun":
      return 50;
    default:
      return this.acc;
  }
}
