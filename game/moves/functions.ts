import type {
  BaseMove,
  ConfuseMove,
  CustomMove,
  DamagingMove,
  DefaultMove,
  FailMove,
  Move,
  RecoveryMove,
  StageMove,
  StatusMove,
  SwitchMove,
  VolatileFlagMove,
} from "./index";
import { getEffectiveness, isSpecial } from "../utils";
import { exec as execDamagingMove, use as useDamagingMove } from "./damaging";

type KindToType = {
  volatile: VolatileFlagMove;
  confuse: ConfuseMove;
  damage: DamagingMove;
  recover: RecoveryMove;
  stage: StageMove;
  status: StatusMove;
  switch: SwitchMove;
  fail: FailMove;
  default: DefaultMove;
};

type MoveKind = Required<Move>["kind"];
type UseMoveFn = Required<CustomMove>["use"];
type ExecMoveFn = CustomMove["exec"];

type MM = {
  [K in MoveKind]: {
    use?(this: KindToType[K], ...args: Parameters<UseMoveFn>): ReturnType<UseMoveFn>;
    exec(this: KindToType[K], ...args: Parameters<ExecMoveFn>): ReturnType<ExecMoveFn>;
  };
};

type MoveFunctions = {
  use?(this: Move, ...args: Parameters<UseMoveFn>): ReturnType<UseMoveFn>;
  exec(this: Move, ...args: Parameters<ExecMoveFn>): ReturnType<ExecMoveFn>;
};

export const moveFunctions: Record<MoveKind, MoveFunctions> = {
  default: {
    use(battle, user, target, moveIndex) {
      const move = battle.moveIdOf(this)!;
      if (move === user.base.moves[user.v.disabled?.indexInMoves ?? -1]) {
        battle.event({ move, type: "move", src: user.owner.id, disabled: true });
        user.v.charging = undefined;
        return false;
      }

      if (moveIndex !== undefined && !user.v.thrashing) {
        user.base.pp[moveIndex]--;
        if (user.base.pp[moveIndex] < 0) {
          user.base.pp[moveIndex] = 63;
        }
        user.v.lastMoveIndex = moveIndex;
      }

      battle.event({
        move,
        type: "move",
        src: user.owner.id,
        thrashing: user.v.thrashing ? true : undefined,
      });
      user.v.lastMove = this;
      return battle.callExecMove(this, user, target);
    },
    exec() {
      throw new Error(`Must override exec(): ${this.name}`);
    },
  },
  volatile: {
    exec(battle, user) {
      if (user.v.flags[this.flag]) {
        battle.info(user, "fail_generic");
      } else {
        user.v.flags[this.flag] = true;
        battle.info(user, this.flag);
      }
      return false;
    },
  },
  confuse: {
    exec(battle, user, target) {
      if (target.v.substitute) {
        battle.info(target, "fail_generic");
        return false;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return false;
      }

      if (!target.confuse(battle)) {
        battle.info(target, "fail_generic");
      }
      return false;
    },
  },
  damage: {
    use: useDamagingMove,
    exec: execDamagingMove,
  },
  recover: {
    exec(battle, user) {
      const diff = user.base.stats.hp - user.base.hp;
      if (diff === 0 || diff % 255 === 0) {
        battle.info(user, "fail_generic");
        return false;
      }

      if (this.why === "rest") {
        user.recover(diff, user, battle, this.why);
        user.base.status = "slp";
        user.base.sleepTurns = 2;
        // In gen 1, Rest doesn't reset the toxic counter or par/brn stat drops
      } else {
        user.recover(Math.floor(user.base.stats.hp / 2), user, battle, this.why);
      }
      return false;
    },
  },
  stage: {
    exec(battle, user, target) {
      target.lastDamage = 0;
      if (this.acc) {
        if (target.v.flags.mist || target.v.substitute) {
          battle.info(target, target.v.flags.mist ? "mist_protect" : "fail_generic");
          return false;
        }

        if (!battle.checkAccuracy(this, user, target)) {
          return false;
        }
      } else {
        target = user;
      }

      if (!target.modStages(user.owner, this.stages, battle)) {
        battle.info(target, "fail_generic");
      }
      return false;
    },
  },
  status: {
    exec(battle, user, target) {
      if (target.v.substitute && this.status !== "par" && this.status !== "slp") {
        battle.info(target, "fail_generic");
        return false;
      } else if (
        (this.type === "electric" && getEffectiveness(this.type, target.v.types) === 0) ||
        (this.type === "poison" && target.v.types.includes("poison"))
      ) {
        battle.info(target, "immune");
        return false;
      } else if (this.status === "slp" && target.v.recharge) {
        // https://www.youtube.com/watch?v=x2AgAdQwyGI
        target.status(this.status, battle, true);
        return false;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return false;
      }

      if (!target.status(this.status, battle)) {
        battle.info(target, "fail_generic");
      }
      return false;
    },
  },
  switch: {
    use(battle, user) {
      user.switchTo(this.poke, battle);
      return false;
    },
    exec: () => false,
  },
  fail: {
    exec(battle, user) {
      battle.info(user, this.why);
      return false;
    },
  },
} satisfies MM;

export function getMaxPP(move: BaseMove) {
  return Math.min(Math.floor((move.pp * 8) / 5), 61);
}

export function getCategory(move: BaseMove) {
  return move.power ? (isSpecial(move.type) ? "special" : "physical") : "status";
}
