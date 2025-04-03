import {Range, type CustomMove, type Move} from ".";
import type {InfoReason} from "../events";
import {abilityList} from "../species";
import {isSpecial, VF} from "../utils";

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
  confuse(battle, user, targets) {
    let failed = true;
    for (const target of targets) {
      if (target.v.substitute) {
        continue;
      } else if (target.owner.screens.safeguard) {
        battle.info(target, "safeguard_protect");
        failed = false;
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
      if (abilityList[user.v.ability!]?.preventsStatus === "slp") {
        return battle.info(user, "fail_generic");
      }

      user.base.status = "slp";
      user.base.sleepTurns = 2;
      if (user.v.ability === "earlybird") {
        user.base.sleepTurns--;
      }
      user.recover(diff, user, battle, this.why, true);
      // In gen 1, Rest doesn't reset the toxic counter or par/brn stat drops
    } else {
      let amount = Math.floor(user.base.stats.hp / 2);
      if (this.weather && !battle.getWeather()) {
        amount = Math.floor(user.base.stats.hp / 4);
      } else if (this.weather && battle.hasWeather("sun")) {
        amount = Math.floor(user.base.stats.hp / 8);
      }
      user.recover(amount, user, battle, this.why);
    }
  },
  stage(battle, user, targets) {
    battle.gen1LastDamage = 0;
    let failed = true;
    for (const target of targets) {
      if (this.range !== Range.Self) {
        if (target.v.hasFlag(VF.mist)) {
          failed = false;
          battle.info(target, "mist_protect");
          continue;
        } else if (target.v.substitute && !this.ignoreSub) {
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
      (this.type === "poison" && target.v.types.includes("poison")) ||
      (this.type === "fire" && target.v.types.includes("fire"))
    ) {
      return battle.info(target, "immune");
    } else if (target.owner.screens.safeguard) {
      return battle.info(target, "safeguard_protect");
    } else if (this.status === "slp" && target.v.recharge) {
      // https://www.youtube.com/watch?v=x2AgAdQwyGI
      return target.status(this.status, battle, user, true);
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.status(this.status, battle, user, false, true);
  },
  switch(battle, user) {
    user.switchTo(this.poke, battle, this.batonPass ? "baton_pass" : undefined);
  },
  damage(battle, user, targets) {
    if (this.flag === "multi_turn" && !user.v.thrashing) {
      user.v.thrashing = {move: this, turns: battle.rng.int(2, 3), max: false};
      user.v.thrashing.max = user.v.thrashing.turns == 3;
    } else if (this.flag === "rollout" && !user.v.thrashing) {
      user.v.thrashing = {move: this, turns: 5, max: false};
      user.v.rollout = 0;
    } else if (this.flag === "fury_cutter") {
      user.v.furyCutter++;
    } else if (this.flag === "bide") {
      if (!user.v.bide) {
        user.v.bide = {move: this, turns: battle.rng.int(2, 3) + 1, dmg: 0};
        return;
      }

      battle.gen.accumulateBide(battle, user, user.v.bide);
      if (--user.v.bide.turns !== 0) {
        return battle.info(user, "bide_store");
      }

      battle.info(user, "bide");
    }

    if (this.range === Range.Self) {
      if (!user.v.lastHitBy) {
        user.v.rollout = 0;
        user.v.furyCutter = 0;
        return battle.info(user, battle.gen.id <= 2 ? "miss" : "fail_generic");
      }
      targets = [user.v.lastHitBy.user];
    }

    let dealt = 0;
    for (const target of targets) {
      dealt += battle.gen.tryDamage(this, battle, user, target, targets.length > 1);
    }

    user.handleShellBell(battle, dealt);
  },
  fail(battle, user) {
    battle.info(user, this.why);
  },
  weather(battle) {
    battle.setWeather(this.weather, 5);
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
    } else if (target.v.ability === "suctioncups") {
      battle.ability(target);
      return battle.info(target, "immune");
    } else if (target.v.hasFlag(VF.ingrain)) {
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
  healbell(battle, user) {
    battle.info(user, "heal_bell");
    for (const active of user.owner.active) {
      active.unstatus(battle);
    }
    const opp = battle.opponentOf(user.owner);
    user.owner.team.forEach(poke => {
      poke.status = undefined;
      // TODO: soundproof
      if (opp.sleepClausePoke === poke) {
        opp.sleepClausePoke = undefined;
      }
    });
  },
  futuresight(battle, user, [target]) {
    if (target.futureSight) {
      return battle.info(user, "fail_generic");
    }

    const spc = isSpecial(this.type);
    const [atk, def] = battle.gen.getDamageVariables(spc, battle, user, target, false);
    const dmg = battle.gen.calcDamage({
      atk,
      def,
      pow: this.power,
      lvl: user.base.level,
      eff: 1,
      isCrit: false,
      isStab: false,
      rand: battle.rng,
    });
    target.futureSight = {damage: dmg, turns: 3, move: this};
    battle.info(user, this.msg);
  },
  swagger(battle, user, [target]) {
    if (target.owner.screens.safeguard) {
      target.modStages(this.stages, battle);
      return battle.info(user, "safeguard_protect");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    } else if (!target.modStages(this.stages, battle)) {
      return battle.info(user, "fail_generic");
    } else {
      target.confuse(battle);
    }
  },
  foresight(battle, user, [target]) {
    if (user.v.hasFlag(VF.identified)) {
      return battle.info(user, "fail_generic");
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    battle.event({
      type: "foresight",
      src: user.id,
      target: target.id,
      volatiles: [target.setFlag(VF.identified)],
    });
  },
};
