import {rawMoveList} from "./data/moves";
import {
  VF,
  MC,
  Range,
  stageKeys,
  idiv,
  stageStatKeys,
  HP_TYPES,
  TypeMod,
  DMF,
  idiv1,
  randChoiceWeighted,
  hazards,
} from "./utils";
import type {FailReason, InfoReason, RecoveryReason} from "./events";
import type {Pokemon, Status} from "./pokemon";
import type {StageId, Type, Weather, ScreenId, HazardId} from "./utils";
import type {Battlemon, Battle} from "./battle";
import {isAffectedBySheerForce} from "./gen5/moves";

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
  /** Not selectable/usable while Gravity is active */
  readonly noGravity?: bool;
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
  readonly flag?: DMF;
  readonly effect?: [number, Effect] | [number, Effect, true] | null;
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
  /** Affected by Iron Fist */
  readonly punch?: bool;
  /** Removes a target's status if hit (Smelling Salt/Wake Up Slap) */
  readonly clearTargetStatus?: Status;
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

const createMoveList = (list: any) => {
  let idx = 0;
  for (const moveId in list) {
    const move = list[moveId] as any;
    move.id = moveId;
    move.idx = idx++;
    move.range = Range[move.range];
    if (move.kind === "volatile") {
      if (VF[move.flag] === undefined) {
        console.log(`Move ${moveId} has invalid VF ${move.flag}`);
      }
      move.flag = VF[move.flag];
    }
    if (move.kind === "damage" && move.flag) {
      if (DMF[move.flag] === undefined) {
        console.log(`Move ${moveId} has invalid DMF ${move.flag}`);
      }
      move.flag = DMF[move.flag];
    }
    if (move.category) {
      if (MC[move.category] === undefined) {
        console.log(`Move ${moveId} has invalid MC ${move.category}`);
      }
      move.category = MC[move.category];
    }
  }
  return list;
};

export const moveList = createMoveList(rawMoveList) as Record<MoveId, Move>;

export type ScriptFn = (
  battle: Battle,
  user: Battlemon,
  targets: Battlemon[],
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
  dmg: PR<(this: DamagingMove, battle: Battle, user: Battlemon, target: Battlemon) => number>;
  pow: PR<(this: DamagingMove, battle: Battle, user: Battlemon, target: Battlemon) => number>;
  acc: PR<(this: Move, weather: Weather | undefined) => number | undefined>;
  type: PR<(this: Move, battle: Battle | Weather | undefined, user: Battlemon | Pokemon) => Type>;
  dmgPreCheck: PR<
    (this: DamagingMove, battle: Battle, user: Battlemon, targets: Battlemon[]) => bool
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
    user.v.setFlag(this.flag);
    return battle.info(user, key as InfoReason);
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
    const diff = user.base.maxHp - user.base.hp;
    if (diff === 0 || diff % 255 === 0) {
      return battle.info(user, "fail_generic");
    }

    if (this.why === "rest") {
      if (user.getAbility()?.preventsStatus === "slp") {
        return battle.info(user, "fail_generic");
      }

      user.setStatusCondition("slp");
      user.base.sleepTurns = user.hasAbility("earlybird") ? 1 : 2;
      user.recover(diff, user, battle, this.why);
      // In gen 1, Rest doesn't reset the toxic counter or par/brn stat drops
    } else {
      user.recover(idiv(user.base.maxHp, 2), user, battle, this.why);
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
            user.v.gender === target.v.gender ||
            user.v.gender === "N" ||
            target.v.gender === "N"
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

    let flags = VF.none;
    flags |= id === "minimize" ? VF.minimize : 0;
    flags |= id === "defensecurl" ? VF.defenseCurl : 0;
    user.v.setFlag(flags);
    battle.syncVolatiles();
  },
  status(battle, user, [target]) {
    if (target.v.substitute && this.status !== "par" && this.status !== "slp") {
      return battle.info(target, "fail_generic");
    } else if (
      (this.checkType && battle.gen.getEffectiveness(battle, this.type, target).immune()) ||
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
      user.v.clearFlag(VF.charge);
      return battle.syncVolatiles();
    }

    let power: number | undefined;
    if (this.flag === DMF.multi_turn && !user.v.thrashing) {
      // when called by sleep talk, thrashing moves don't lock the user in
      if (user.lastChosenMove !== battle.gen.moveList.sleeptalk) {
        user.v.thrashing = {move: this, turns: battle.gen.rng.thrashDuration(battle), max: false};
        user.v.thrashing.max = user.v.thrashing.turns === battle.gen.rng.maxThrash;
      }
    } else if (this.flag === DMF.rollout && !user.v.thrashing) {
      if (user.lastChosenMove !== battle.gen.moveList.sleeptalk) {
        user.v.thrashing = {move: this, turns: 5, max: false};
      }
    } else if (this.id === "bide") {
      if (!user.v.bide) {
        user.v.bide = {move: this, turns: battle.gen.rng.bideDuration(battle), dmg: 0};
        battle.info(user, "bide_store");
        return;
      }

      battle.gen.accumulateBide(battle, user, user.v.bide);
      if (--user.v.bide.turns !== 0) {
        return battle.info(user, "bide_store");
      }

      battle.info(user, "bide");
    } else if (this.id === "magnitude") {
      const magnitude = battle.rng.int(4, 10);
      power = [10, 30, 50, 70, 90, 110, 150][magnitude - 4];
      battle.event({type: "magnitude", magnitude});
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
    const start = battle.events.length;
    for (const target of targets) {
      dealt += battle.gen.tryDamage(this, battle, user, target, targets.length > 1, power);

      if (!target.base.hp && target.owner !== user.owner) {
        killed.push(target);
      }
    }
    const end = battle.events.length;

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

    user.v.clearFlag(VF.charge);
    user.handleShellBell(battle, dealt);
    battle.syncVolatiles();

    if (this.id === "bide") {
      user.v.bide = undefined;
    } else if (user.v.inBatonPass) {
      battle.checkFaint(user);
      if (battle.finished) {
        user.v.inBatonPass = undefined;
      }
    }

    // FIXME: this is a hack
    const failed = !battle.events.slice(start, end).find(ev => {
      if (ev.type !== "damage" && (battle.gen.id <= 5 || ev.type !== "hit_sub")) {
        return false;
      }
      return ev.src !== ev.target;
    });
    // Sheer Force skips the Relic Song transformation
    if (failed || (user.hasAbility("sheerforce") && isAffectedBySheerForce(this))) {
      return;
    }

    if (user.base.hp && user.hasItem("lifeorb")) {
      user.damage2(battle, {
        dmg: idiv1(user.base.maxHp, 10),
        src: user,
        why: "lifeorb",
        direct: true,
      });
    }

    if (this.id === "relicsong" && user.base.hp && user.v.speciesId === "meloetta") {
      // Doing Meloetta's transfomation like this means anything that accesses species.stats.*
      // would get an incorrect value. Luckily, Beat Up was the only thing that did that, and no
      // longer does from Gen V onward.
      if (user.v.form !== "pirouette") {
        const form = user.v.species.forms!.pirouette!;
        user.v.stats = user.base.calculateStats(form.stats);
        user.v.baseStats = {...user.v.stats};
        user.v.types = [...form.types];
        user.v.form = "pirouette";
      } else {
        user.v.stats = user.base.calculateStats(user.v.species.stats);
        user.v.baseStats = {...user.v.stats};
        user.v.types = [...user.v.species.types];
        user.v.form = undefined;
      }
      battle.event({
        type: "transform",
        src: user.id,
        speciesId: user.v.speciesId,
        shiny: user.v.shiny,
        gender: user.v.gender,
      });
    }
  },
  fail(battle, user) {
    battle.info(user, this.why);
  },
  weather(battle, user) {
    battle.setWeather(this.weather, user.getItem()?.extendWeather === this.weather ? 8 : 5);
  },
  screen(battle, user) {
    if (user.owner.screens[this.screen]) {
      return battle.info(user, "fail_generic");
    }

    user.owner.screens[this.screen] = this.turns ?? 5;
    battle.event({type: "screen", screen: this.screen, kind: "start", user: user.owner.id});
  },
  phaze(battle, user, [target]) {
    const next = battle.rng.choice(
      target.owner.team.filter(p => p.hp && target.owner.active.every(a => p !== a.base)),
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
    const [flag, msg] = this.endure
      ? ([VF.endure, "endure"] as const)
      : ([VF.protect, "protect"] as const);
    user.v.setFlag(flag);
    battle.info(user, msg);
  },
  noSwitch(battle, user, [target]) {
    if (target.v.meanLook || (battle.gen.id >= 3 && target.v.substitute)) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.meanLook = user;
    battle.info(target, "meanlook");
  },
  lockOn(battle, user, [target]) {
    if (target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.setFlag(VF.lockon);
    battle.event({type: "lock_on", src: user.id, target: target.id});
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
      } else if (user.owner.active.some(p => p.base === poke)) {
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
    battle.event({type: "foresight", src: user.id, target: target.id});
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
    battle.info(user, this.message);
  },
  hwish(battle, user) {
    if (!user.owner.team.some(p => p.hp && user.owner.active.every(a => p !== a.base))) {
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
    battle.event({type: "conversion", src: user.id, target: target.id, types: [...user.v.types]});
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
    battle.event({type: "disable", src: target.id, move: target.base.moves[indexInMoves]});
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
      target.v.stats = {...target.v.baseStats};
      if (target === user) {
        continue;
      }

      if (target.base.status === "frz" || target.base.status === "slp") {
        target.base.sleepTurns = 0;
        target.v.hazed = true;
      }

      target.setStatusCondition(undefined);
    }

    if (user.base.status === "tox") {
      user.setStatusCondition("psn");
    }

    battle.info(user, "haze");
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
    battle.info(target, "seeded");
  },
  metronome(battle, user) {
    battle.gen1LastDamage = 0;
    const moves = Object.entries(battle.gen.moveList)
      .filter(([, move]) => !move.noMetronome && move.idx! <= battle.gen.lastMoveIdx)
      .filter(
        ([id]) => (battle.gen.id !== 2 && battle.gen.id !== 4) || !user.base.moves.includes(id),
      )
      .filter(([, move]) => !battle.field.gravity || !move.noGravity)
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
    if (user.v.transformed && battle.gen.id === 2) {
      return battle.info(user, "fail_generic");
    } else if (!lastHitBy || lastHitBy.poke.v.lastMove !== lastHitBy.move) {
      return battle.info(user, "fail_generic");
    }
    return battle.callMove(lastHitBy.move, user);
  },
  substitute(battle, user) {
    const hp = idiv(user.base.maxHp, 4);
    if (user.v.substitute) {
      return battle.info(user, "has_substitute");
    } else if (hp > user.base.hp) {
      // Gen 1 bug, if you have exactly 25% hp you can create a substitute and instantly die
      return battle.info(user, "cant_substitute");
    }

    user.v.substitute = hp + 1;
    user.damage(hp, user, battle, false, "substitute", true, undefined);
  },
  transform(battle, user, [target]) {
    battle.gen1LastDamage = 0;
    user.transform(battle, target);
  },
  // Gen II
  attract(battle, user, [target]) {
    if (target.hasAbility("oblivious")) {
      battle.ability(target);
      return battle.info(target, "immune");
    } else if (
      user.v.gender === "N" ||
      target.v.gender === "N" ||
      user.v.gender === target.v.gender ||
      target.v.attract
    ) {
      battle.info(user, "fail_generic");
      return;
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.attract = user;
    battle.info(target, "attract");
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

    const dmg = idiv(user.base.maxHp, 2);
    if (user.base.hp < dmg) {
      battle.info(user, "fail_generic");

      if (battle.gen.id <= 2) {
        user.setStage("atk", Math.min(user.v.stages.atk + 2, 6), battle, false);
        battle.event({type: "bug", bug: "bug_gen2_bellydrum"});
      }
      return;
    }

    user.setStage("atk", +6, battle, false);
    user.damage(dmg, user, battle, false, "belly_drum", true, undefined);
  },
  conversion2(battle, user) {
    // Conversion2 takes type changes like Hidden Power into account
    let lastType = user.v.lastHitBy?.type;
    if (!lastType) {
      return battle.info(user, "fail_generic");
    }

    if (lastType === "???") {
      lastType = "normal";
    }

    const types = battle.gen.typeMatchupTable.filter(([atk, , mod]) => {
      return atk === lastType && mod < TypeMod.EFFECTIVE;
    });
    user.v.types = [battle.rng.choice(types)![1]];
    battle.event({type: "conversion", src: user.id, types: [...user.v.types]});
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

      target.v.setFlag(VF.curse);
      user.damage(idiv(user.base.maxHp, 2), target, battle, false, "set_curse", true);
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
    battle.info(target, "encore");
  },
  nightmare(battle, user, [target]) {
    if (target.v.hasFlag(VF.nightmare) || target.base.status !== "slp" || target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.setFlag(VF.nightmare);
    battle.info(target, "nightmare");
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
    battle.info(user, "perish_song");
  },
  psychup(battle, user, [target]) {
    if (Object.values(target.v.stages).every(v => v === 0)) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    user.v.stages = {...target.v.stages};
    for (const stat of stageStatKeys) {
      battle.gen.recalculateStat(user, stat, false);
    }
    battle.event({type: "psych_up", src: user.id, target: target.id});
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
    battle.event({type: "sketch", src: user.id, move: id, moveIndex});
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
  // Gen III
  assist(battle, user) {
    const moves = user.owner.team
      .flatMap(p => (p !== user.base ? p.moves : []))
      .map(move => battle.gen.moveList[move])
      .filter(move => !move.noAssist && (!battle.field.gravity || !move.noGravity));
    const move = battle.rng.choice(moves);
    if (!move) {
      return battle.info(user, "fail_generic");
    }
    return battle.callMove(move, user);
  },
  camouflage(battle, user) {
    user.v.types = [this.camouflageType];
    battle.event({type: "conversion", types: [this.camouflageType], src: user.id});
  },
  charge(battle, user) {
    user.v.setFlag(VF.charge);
    battle.info(user, "charge");
  },
  helpinghand(battle, user, [target]) {
    if (target.choice?.executed) {
      return battle.info(user, "fail_generic");
    }

    target.v.setFlag(VF.helpingHand);
    battle.event({type: "helping_hand", src: user.id, target: target.id});
  },
  imprison(battle, user) {
    const moves = new Set(user.moveset());
    const good = battle.allActive.some(
      p => !p.v.fainted && p.owner !== user.owner && !new Set(p.moveset()).isDisjointFrom(moves),
    );

    if (!good) {
      return battle.info(user, "fail_generic");
    }

    user.v.setFlag(VF.imprisoning);
    return battle.info(user, "imprisoning");
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
    if (!user.consumed || user.base._itemId) {
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

    user.v.ability = target.v.ability;
    battle.event({type: "copy_ability", src: user.id, target: target.id, ability: user.v.ability!});
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
    battle.event({type: "skill_swap", src: user.id, target: target.id});
  },
  stockpile(battle, user) {
    if (user.v.stockpile === 3) {
      return battle.info(user, "fail_generic");
    }

    user.v.stockpile++;
    battle.event({type: "stockpile", src: user.id, count: user.v.stockpile});
  },
  swallow(battle, user) {
    if (!user.v.stockpile) {
      return battle.info(user, "fail_generic");
    }

    const d = {3: 1, 2: 2, 1: 4}[user.v.stockpile] ?? 4;
    user.v.stockpile = 0;
    user.recover(idiv1(user.base.maxHp, d), user, battle, "recover");
    battle.syncVolatiles();
  },
  taunt(battle, user, [target]) {
    if (target.v.tauntTurns) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.tauntTurns = 2 + 1;
    battle.info(target, "taunt");
  },
  torment(battle, user, [target]) {
    if (target.v.hasFlag(VF.torment) || target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.setFlag(VF.torment);
    battle.info(target, "torment");
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
    battle.info(target, "drowsy");
  },
  // Gen IV
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
  embargo(battle, user, [target]) {
    if (
      target.v.embargoTurns ||
      target.v.substitute ||
      target.base._itemId === "griseousorb" ||
      target.hasAbility("multitype")
    ) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.embargoTurns = 5;
    battle.info(target, "embargo");
  },
  gastroacid(battle, user, [target]) {
    if (battle.tryMagicBounce(this, user, target)) {
      return;
    } else if (target.v.hasFlag(VF.gastroAcid) || target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (target.hasAbility("multitype")) {
      battle.ability(target);
      return battle.info(target, "immune");
    }

    target.v.setFlag(VF.gastroAcid);
    return battle.info(target, "gastroAcid");
  },
  roost(battle, user) {
    if (user.base.maxHp === user.base.hp) {
      return battle.info(user, "fail_generic");
    }

    user.v.setFlag(VF.roost);
    user.recover(idiv1(user.base.maxHp, 2), user, battle, "recover");
  },
  defog(this: Move, battle, user, [target]) {
    if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    if (battle.gen.id <= 4 || !target.v.substitute) {
      target.modStages([["eva", -1]], battle, user);
    }

    for (const screen of ["light_screen", "reflect", "safeguard", "mist"] as const) {
      if (target.owner.screens[screen]) {
        target.owner.screens[screen] = 0;
        battle.event({type: "screen", user: target.owner.id, screen, kind: "end"});
      }
    }

    for (const hazard of hazards) {
      if (target.owner.hazards[hazard]) {
        target.owner.hazards[hazard] = 0;
        battle.event({
          type: "hazard",
          src: user.id,
          player: target.owner.id,
          hazard,
          spin: true,
        });
      }
    }
  },
  powertrick(battle, user) {
    [user.v.stats.atk, user.v.stats.def] = [user.v.stats.def, user.v.stats.atk];
    user.v.setFlag(VF.powerTrick);
    battle.info(user, "powerTrick");
  },
  psychoshift(battle, user, [target]) {
    if (!user.base.status || target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (!target.canStatus(user.base.status, battle, user, {loud: true})) {
      return;
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    const status = user.base.status;
    if (battle.gen.id <= 4) {
      user.unstatus(battle);
      target.status(status, battle, user, {});
    } else {
      target.status(status, battle, user, {});
      user.unstatus(battle);
    }
  },
  worryseed(battle, user, [target]) {
    const ability = target.getAbilityId();
    if (
      ability === "truant" ||
      ability === "multitype" ||
      target.base._itemId === "griseousorb" ||
      target.v.substitute
    ) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.v.ability = "insomnia";
    battle.ability(target);
    battle.info(target, "worryseed");
    if (target.base.status === "slp") {
      target.unstatus(battle);
    }
  },
  magnetrise(battle, user) {
    if (user.v.magnetRise || user.v.hasFlag(VF.ingrain)) {
      return battle.info(user, "fail_generic");
    }

    user.v.magnetRise = 5;
    battle.info(user, "magnet_rise");
  },
  gravity(battle, user) {
    if (battle.field.gravity) {
      return battle.info(user, "fail_generic");
    }

    battle.field.gravity = 5;
    battle.event({type: "weather", kind: "start", weather: "gravity"});
    for (const poke of battle.turnOrder) {
      if (!poke.base.hp) {
        continue;
      } else if (poke.v.magnetRise) {
        poke.v.magnetRise = 0;
        battle.info(poke, "gravity_grounded");
      } else if (poke.v.charging?.move?.id === "fly") {
        poke.v.charging = undefined;
        poke.choice!.executed = true;
        battle.info(poke, "gravity_grounded");
      } else if (poke.v.hasFlag(VF.ingrain | VF.gastroAcid)) {
        continue;
      } else if (poke.getAbilityId() === "levitate" || poke.v.hasAnyType("flying")) {
        battle.info(poke, "gravity_grounded");
      }
    }
  },
  trickroom(battle, user) {
    if (battle.field.trickRoom) {
      battle.field.trickRoom = 0;
      return battle.event({type: "weather", kind: "end", weather: "trickRoom"});
    }

    battle.field.trickRoom = 5;
    battle.event({type: "weather", kind: "start", weather: "trickRoom", src: user.id});
  },
};

export const moveOverrides: MovePropOverrides = {
  pow: {
    present: battle => randChoiceWeighted(battle.rng, [40, 80, 120, -1], [40, 30, 10, 20]),
    // Gen III
    flail: getFlailPower,
    frustration: (_, user) => idiv(255 - user.base.friendship, 2.5),
    hiddenpower(_, {base: {ivs: dvs}}) {
      const msb = (dv: number) => +((dv & (1 << 3)) !== 0);

      const x = msb(dvs.spa) | (msb(dvs.spe) << 1) | (msb(dvs.def) << 2) | (msb(dvs.atk) << 3);
      const y = (dvs.spa ?? 15) & 0b11;
      return idiv(5 * x + y, 2) + 31;
    },
    return: (_, user) => idiv(user.base.friendship, 2.5),
    reversal: getFlailPower,
    eruption: getHPFalloffPower,
    waterspout: getHPFalloffPower,
    // Gen IV
    crushgrip: getCrushGripPower,
    grassknot: (_, _user, target) => getLowKickPower(target.v.species.weight),
    wringout: getCrushGripPower,
    payback(_, _user, target) {
      return target.choice?.executed ? this.power << 1 : this.power;
    },
    punishment(this, _battle, _user, target) {
      const stages = stageKeys.reduce((acc, stat) => acc + Math.max(0, target.v.stages[stat]), 0);
      return this.power + Math.min(stages, 7) * 20;
    },
    naturalgift: (_battle, user) => user.getItem()?.naturalGift?.[1] ?? 0,
    fling: (_battle, user) => user.getItem()?.fling ?? 0,
    gyroball(battle, user, target) {
      // https://github.com/pret/pokeheartgold/blob/821bad70967f3d49dc98e56f36c1776ae9e69e3e/src/battle/battle_command.c#L4302
      // Gyro ball uses ctx->effectiveSpeed. This is only set by CheckSortSpeed, which has a few different
      // code paths that call it. Its unclear to me if it is only called at the beginning of the turn,
      // or between moves, or something else.
      const targetSpe = battle.gen.getSpeed(battle, target); // target.choice!.spe
      const userSpe = battle.gen.getSpeed(battle, user); // user.choice!.spe
      return Math.min(150, 1 + idiv(25 * targetSpe, userSpe));
    },
    // Gen V
    acrobatics(_, user) {
      return !user.base._itemId ? this.power << 1 : this.power;
    },
    hex(_battle, _user, target) {
      return target.base.status ? this.power << 1 : this.power;
    },
    storedpower(this, _battle, user) {
      const stages = stageKeys.reduce((acc, stat) => acc + Math.max(0, user.v.stages[stat]), 0);
      return this.power + stages * 20;
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
    superfang: (_battle, _, target) => Math.max(target.base.hp >> 1, 1),
    mirrorcoat(battle, user) {
      const lastHit = user.v.lastHitBy;
      if (!lastHit || !battle.gen.isSpecial(lastHit.move, lastHit.type, true)) {
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
    hiddenpower(_battle, _user) {
      const user = "base" in _user ? _user.base : _user;
      return HP_TYPES[(((user.ivs.atk ?? 15) & 0b11) << 2) | ((user.ivs.def ?? 15) & 0b11)];
    },
    weatherball(battle) {
      const weather = typeof battle === "string" ? battle : battle?.getWeather();
      return (
        (weather && ({hail: "ice", sand: "rock", rain: "water", sun: "fire"} as const)[weather]) ??
        "normal"
      );
    },
    naturalgift(_battle, user) {
      const item = "base" in user ? user.getItem() : user.item;
      return item?.naturalGift?.[0] ?? "normal";
    },
    judgment(_battle, user) {
      const item = "base" in user ? user.getItem() : user.item;
      return item?.plate ?? "normal";
    },
    technoblast(_battle, user) {
      const item = "base" in user ? user.getItem() : user.item;
      // prettier-ignore
      switch (item?.drive) {
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
    feint(battle, user, [target]) {
      if (!target.v.hasFlag(VF.protect)) {
        battle.info(user, "fail_generic");
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
    naturalgift(battle, user) {
      if (!user.getItem()?.naturalGift) {
        battle.info(user, "fail_generic");
        return false;
      }
      return true;
    },
  },
};

function getFlailPower(_: Battle, user: Battlemon) {
  const percent = user.base.hpPercent;
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

function getHPFalloffPower(this: DamagingMove, _battle: Battle, user: Battlemon) {
  return idiv1(this.power * user.base.hp, user.base.maxHp);
}

function getCrushGripPower(_battle: Battle, _user: Battlemon, target: Battlemon) {
  return 1 + idiv(target.base.hp * 120, target.base.maxHp);
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
