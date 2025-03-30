import type {CustomMove, Move} from ".";
import type {InfoReason} from "../events";
import {VF} from "../utils";
import {exec as execDamagingMove} from "../gen1/damaging";

type ExecMoveFn = CustomMove["exec"];

export type MoveFunctions = {
  [K in Required<Move>["kind"]]: (
    this: Move & {kind: K},
    ...args: Parameters<ExecMoveFn>
  ) => ReturnType<ExecMoveFn>;
};

export const moveFunctions: MoveFunctions = {
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
  confuse(battle, user, [target]) {
    if (target.v.substitute) {
      return battle.info(target, "fail_generic");
    } else if (target.owner.screens.safeguard) {
      return battle.info(target, "safeguard_protect");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    if (!target.confuse(battle)) {
      battle.info(target, "fail_generic");
    }
  },
  damage: execDamagingMove,
  recover(battle, user) {
    const diff = user.base.stats.hp - user.base.hp;
    if (diff === 0 || diff % 255 === 0) {
      return battle.info(user, "fail_generic");
    }

    if (this.why === "rest") {
      user.base.status = "slp";
      user.base.sleepTurns = 2;
      user.recover(diff, user, battle, this.why, true);
      // In gen 1, Rest doesn't reset the toxic counter or par/brn stat drops
    } else {
      let amount = Math.floor(user.base.stats.hp / 2);
      if (this.weather && !battle.weather) {
        amount = Math.floor(user.base.stats.hp / 4);
      } else if (this.weather && battle.weather?.kind !== "sun") {
        amount = Math.floor(user.base.stats.hp / 8);
      }
      user.recover(amount, user, battle, this.why);
    }
  },
  stage(battle, user, targets) {
    battle.gen1LastDamage = 0;
    let failed = true;
    for (const target of targets) {
      if (this.acc) {
        if (target.v.hasFlag(VF.mist)) {
          failed = false;
          return battle.info(target, "mist_protect");
        } else if (target.v.substitute) {
          continue;
        }

        if (!battle.checkAccuracy(this, user, target)) {
          failed = false;
          continue;
        }
      }

      if (target.modStages(this.stages, battle)) {
        failed = false;
      }
    }

    if (failed) {
      return battle.info(user, "fail_generic");
    }

    const id = battle.moveIdOf(this)!;
    user.v.usedMinimize = user.v.usedMinimize || id === "minimize";
    user.v.usedDefenseCurl = user.v.usedDefenseCurl || id === "defensecurl";
  },
  status(battle, user, [target]) {
    if (target.v.substitute && this.status !== "par" && this.status !== "slp") {
      return battle.info(target, "fail_generic");
    } else if (
      (this.type === "electric" && battle.getEffectiveness(this.type, target) === 0) ||
      (this.type === "poison" && target.v.types.includes("poison"))
    ) {
      return battle.info(target, "immune");
    } else if (target.owner.screens.safeguard) {
      return battle.info(target, "safeguard_protect");
    } else if (this.status === "slp" && target.v.recharge) {
      // https://www.youtube.com/watch?v=x2AgAdQwyGI
      return target.status(this.status, battle, true);
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    if (!target.status(this.status, battle)) {
      battle.info(target, "fail_generic");
    }
  },
  switch(battle, user) {
    user.switchTo(this.poke, battle, this.batonPass ? "baton_pass" : undefined);
  },
  fail(battle, user) {
    battle.info(user, this.why);
  },
  weather(battle) {
    battle.event({type: "weather", kind: "start", weather: this.weather});
    battle.weather = {turns: 5, kind: this.weather};
  },
  screen(battle, user) {
    if (user.owner.screens[this.screen]) {
      return battle.info(user, "fail_generic");
    }

    user.owner.screens[this.screen] = 5;
    battle.event({type: "screen", screen: this.screen, kind: "start", user: user.owner.id});
  },
  phaze(battle, user, [target]) {
    const next = battle.rng.choice(target.owner.team.filter(p => p.hp && p != target.base.real));
    if (!next || !target.movedThisTurn) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.switchTo(next, battle, "phaze");
  },
  protect(battle, user) {
    if (user.v.substitute || (battle.turnOrder.at(-1)?.user === user && !this.endure)) {
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
    battle.info(target, "cMeanLook", [{id: target.id, v: {flags: target.v.cflags}}]);
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
};
