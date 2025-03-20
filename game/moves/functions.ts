import type {
  ConfuseMove,
  CustomMove,
  DamagingMove,
  FailMove,
  Move,
  PhazingMove,
  RecoveryMove,
  ScreenMove,
  StageMove,
  StatusMove,
  SwitchMove,
  VolatileFlagMove,
  WeatherMove,
} from "./index";
import {exec as execDamagingMove, use as useDamagingMove} from "./damaging";

type KindToType = {
  volatile: VolatileFlagMove;
  confuse: ConfuseMove;
  damage: DamagingMove;
  recover: RecoveryMove;
  stage: StageMove;
  status: StatusMove;
  switch: SwitchMove;
  fail: FailMove;
  weather: WeatherMove;
  screen: ScreenMove;
  phaze: PhazingMove;
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
  volatile: {
    exec(battle, user) {
      if (user.v.flags[this.flag]) {
        battle.info(user, "fail_generic");
      } else {
        user.v.flags[this.flag] = true;
        battle.info(user, this.flag, [{id: user.owner.id, v: {[this.flag]: true}}]);
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
  damage: {use: useDamagingMove, exec: execDamagingMove},
  recover: {
    exec(battle, user) {
      const diff = user.base.stats.hp - user.base.hp;
      if (diff === 0 || diff % 255 === 0) {
        battle.info(user, "fail_generic");
        return false;
      }

      if (this.why === "rest") {
        user.base.status = "slp";
        user.base.sleepTurns = 2;
        user.recover(diff, user, battle, this.why);
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
        (this.type === "electric" && battle.getEffectiveness(this.type, target.v.types) === 0) ||
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
  weather: {
    exec(battle) {
      battle.event({type: "weather", kind: "start", weather: this.weather});
      battle.weather = {turns: 5, kind: this.weather};
      return false;
    },
  },
  screen: {
    exec(battle, user) {
      if (user.owner.screens[this.screen]) {
        battle.info(user, "fail_generic");
        return false;
      }

      user.owner.screens[this.screen] = 5;
      battle.event({type: "screen", screen: this.screen, kind: "start", src: user.owner.id});
      return false;
    },
  },
  phaze: {
    exec(battle, user, target) {
      const next = battle.rng.choice(target.owner.team.filter(p => p.hp && p != target.base.real));
      if (!next || !target.movedThisTurn) {
        battle.info(user, "fail_generic");
        return false;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return false;
      }

      target.switchTo(next, battle, "phaze");
      return false;
    },
  },
} satisfies MM;
