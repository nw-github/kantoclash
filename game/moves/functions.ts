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
      if (battle.tryMagicBounce(this, user, target)) {
        return;
      } else if (target.v.substitute) {
        continue;
      } else if (target.v.ability === "owntempo") {
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
      user.recover(Math.floor(user.base.stats.hp / 2), user, battle, this.why);
    }
  },
  stage(battle, user, targets) {
    battle.gen1LastDamage = 0;
    let failed = true;
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
      return target.status(this.status, battle, user, {override: true});
    } else if (!battle.checkAccuracy(this, user, target)) {
      return;
    }

    target.status(this.status, battle, user, {override: false, loud: true});
  },
  switch(battle, user) {
    user.switchTo(this.poke, battle, this.batonPass ? "baton_pass" : undefined);
  },
  damage(battle, user, targets) {
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
        user.v.rollout = 0;
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
    }

    if (this.range === Range.Self) {
      if (user.v.lastHitBy && !user.v.lastHitBy.poke.v.fainted) {
        targets = [user.v.lastHitBy.poke];
      } else {
        targets = battle.getTargets(user, Range.AdjacentFoe).slice(0, 1);
        if (!targets.length) {
          user.v.rollout = 0;
          user.v.furyCutter = 0;
          return battle.info(user, "fail_notarget");
        }
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
    }
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
    const next = battle.rng.choice(target.owner.team.filter(p => p.hp && p !== target.base.real));
    if (!next || !target.choice?.executed) {
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
    if (target.choice) {
      target.choice.executed = true;
    }
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
    battle.info(user, this.why);
    for (const poke of user.owner.active) {
      if (poke.base.status && poke.v.ability === "soundproof" && this.sound) {
        battle.ability(poke);
        battle.info(poke, "immune");
        continue;
      }

      poke.unstatus(battle);
    }
    const opp = battle.opponentOf(user.owner);
    for (const poke of user.owner.team) {
      if (poke.ability === "soundproof" && this.sound) {
        continue;
      }

      poke.status = undefined;
      if (opp.sleepClausePoke === poke) {
        opp.sleepClausePoke = undefined;
      }
    }
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
      hasStab: false,
      rand: battle.rng,
    });
    target.futureSight = {damage: dmg, turns: 3, move: this};
    battle.info(user, this.msg);
  },
  swagger(battle, user, [target]) {
    if (target.v.substitute) {
      return battle.info(user, "fail_generic");
    } else if (target.owner.screens.safeguard) {
      target.modStages(this.stages, battle, user);
      return battle.info(target, "safeguard_protect");
    } else if (target.v.ability === "owntempo") {
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
    if (target.v.hasFlag(VF.identified) && battle.gen.id <= 2 && battle.gen.id <= 5) {
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
