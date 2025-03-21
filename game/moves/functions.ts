import type {CustomMove, Move} from ".";
import {exec as execDamagingMove, use as useDamagingMove} from "./damaging";

type UseMoveFn = Required<CustomMove>["use"];
type ExecMoveFn = CustomMove["exec"];

type MM = {
  [K in Required<Move>["kind"]]: {
    use?(this: Move & {kind: K}, ...args: Parameters<UseMoveFn>): ReturnType<UseMoveFn>;
    exec(this: Move & {kind: K}, ...args: Parameters<ExecMoveFn>): ReturnType<ExecMoveFn>;
  };
};

export const moveFunctions: MM = {
  volatile: {
    exec(battle, user) {
      if (user.v.flags[this.flag]) {
        battle.info(user, "fail_generic");
      } else {
        user.v.flags[this.flag] = true;
        battle.info(user, this.flag, [{id: user.owner.id, v: {[this.flag]: true}}]);
      }
    },
  },
  confuse: {
    exec(battle, user, target) {
      if (target.v.substitute) {
        battle.info(target, "fail_generic");
        return;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      if (!target.confuse(battle)) {
        battle.info(target, "fail_generic");
      }
    },
  },
  damage: {use: useDamagingMove, exec: execDamagingMove},
  recover: {
    exec(battle, user) {
      const diff = user.base.stats.hp - user.base.hp;
      if (diff === 0 || diff % 255 === 0) {
        battle.info(user, "fail_generic");
        return;
      }

      if (this.why === "rest") {
        user.base.status = "slp";
        user.base.sleepTurns = 2;
        user.recover(diff, user, battle, this.why);
        // In gen 1, Rest doesn't reset the toxic counter or par/brn stat drops
      } else {
        user.recover(Math.floor(user.base.stats.hp / 2), user, battle, this.why);
      }
    },
  },
  stage: {
    exec(battle, user, target) {
      target.lastDamage = 0;
      if (this.acc) {
        if (target.v.flags.mist || target.v.substitute) {
          battle.info(target, target.v.flags.mist ? "mist_protect" : "fail_generic");
          return;
        }

        if (!battle.checkAccuracy(this, user, target)) {
          return;
        }
      } else {
        target = user;
      }

      if (!target.modStages(user.owner, this.stages, battle)) {
        battle.info(target, "fail_generic");
      }
    },
  },
  status: {
    exec(battle, user, target) {
      if (target.v.substitute && this.status !== "par" && this.status !== "slp") {
        battle.info(target, "fail_generic");
        return;
      } else if (
        (this.type === "electric" && battle.getEffectiveness(this.type, target.v.types) === 0) ||
        (this.type === "poison" && target.v.types.includes("poison"))
      ) {
        battle.info(target, "immune");
        return;
      } else if (this.status === "slp" && target.v.recharge) {
        // https://www.youtube.com/watch?v=x2AgAdQwyGI
        target.status(this.status, battle, true);
        return;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      if (!target.status(this.status, battle)) {
        battle.info(target, "fail_generic");
      }
    },
  },
  switch: {
    use(battle, user) {
      user.switchTo(this.poke, battle);
    },
    exec: () => false,
  },
  fail: {
    exec(battle, user) {
      battle.info(user, this.why);
    },
  },
  weather: {
    exec(battle) {
      battle.event({type: "weather", kind: "start", weather: this.weather});
      battle.weather = {turns: 5, kind: this.weather};
    },
  },
  screen: {
    exec(battle, user) {
      if (user.owner.screens[this.screen]) {
        battle.info(user, "fail_generic");
        return;
      }

      user.owner.screens[this.screen] = 5;
      battle.event({type: "screen", screen: this.screen, kind: "start", src: user.owner.id});
    },
  },
  phaze: {
    exec(battle, user, target) {
      const next = battle.rng.choice(target.owner.team.filter(p => p.hp && p != target.base.real));
      if (!next || !target.movedThisTurn) {
        battle.info(user, "fail_generic");
        return;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return;
      }

      target.switchTo(next, battle, "phaze");
    },
  },
};
