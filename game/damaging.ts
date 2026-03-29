import type {DamagingMove} from "./moves";
import type {ActivePokemon, Battle} from "./battle";

export function checkUsefulness(
  self: DamagingMove,
  battle: Battle,
  user: ActivePokemon,
  target: ActivePokemon,
) {
  let type = battle.gen.getMoveType(self, user.base, battle.getWeather());
  let fail = false;
  if (self.flag === "beatup") {
    type = "???";
  }

  let eff = battle.getEffectiveness(type, target);
  let abilityImmunity = false;
  const targetAbility = target.getAbilityId();
  if (self.sound && targetAbility === "soundproof") {
    eff = 0;
    abilityImmunity = true;
  } else if (
    (type !== "???" && eff <= 1 && targetAbility === "wonderguard") ||
    (type === "ground" && eff !== 0 && targetAbility === "levitate") ||
    (type === "electric" && targetAbility === "voltabsorb") ||
    (type === "water" && targetAbility === "waterabsorb") ||
    (type === "fire" && targetAbility === "flashfire" && target.base.status !== "frz")
  ) {
    eff = 0;
    abilityImmunity = true;
  }

  if (self.flag === "dream_eater" && target.base.status !== "slp") {
    fail = true;
  } else if (self.flag === "spitup" && !user.v.stockpile) {
    fail = true;
  } else if (self.flag === "ohko" && !battle.gen.canOHKOHit(user, target)) {
    fail = true;
  } else if (self.fixedDamage) {
    if (eff !== 0) {
      eff = 1;
    }
  } else if (battle.gen.move.overrides.dmg[self.id!]) {
    if (eff !== 0) {
      eff = 1;
    }
    const result = battle.gen.getMoveDamage(self, battle, user, target);
    if (result === 0) {
      fail = true;
    }
  }

  return {type, eff, fail, abilityImmunity};
}
