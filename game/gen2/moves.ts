import type { Move, MoveId } from "../moves";
import { stageKeys } from "../utils";

// FLAG: drain        | always misses against substitute in Gen 2
// FLAG: multi_hit    | all hits are now independently damage calcd, continues after breaking sub,  final strike only kings rock
// FLAG: explosion    | now faints when hitting a substitute/protect, end of turn damage happens after, defense halving applies to self-inflicted confusion damage
// FLAG: ohko         | new formula: https://bulbapedia.bulbagarden.net/wiki/Fissure_(move), counterable even on miss
// FLAG: level, dmg, super_fang   | affected by type immunities
// FLAG: multi_turn   | 2-3 turns instead of 3-4

// Sleep now disrupts bide
// Partial trapping
// Normal type moves can par normal types, etc.
// Counter is sane now
// Defense curl doubles rollout
// User takes recoil when breaking a substitute
// Crash damage is now 1/8
// Hyper beam must now always recharge (substitute, faint), and trapping moves dont reset it
// Status moves: glare cannot hit ghost types now, poison powder cant hit steels
// leech seed doesn't interact with toxic N and drains 1/8
// Mist now applies to secondary effects of moves
// Quick attack/counter priority doesnt stick to sleep/frozen poke
// Recover fail glitch is fixed
// All status moves cannot affect targets behind a substitute

// substitute: can no longer create a sub and insta-die

// Twineedle can poison steel types

/*
https://bulbapedia.bulbagarden.net/wiki/Dig_(move)
In Generation II only, due to a glitch, when Lock-On or Mind Reader are in effect, the moves Attract, Curse, Foresight, Mean Look, Mimic, Nightmare, Spider Web, and Transform cannot hit targets in the semi-invulnerable turn of Dig, and moves cannot lower stats of targets in the semi-invulnerable turn of Dig (status moves such as String Shot will fail, and additional effects of moves such as Bubble will not activate).

https://bulbapedia.bulbagarden.net/wiki/Metronome_(move)
pp rollover

https://bulbapedia.bulbagarden.net/wiki/Mimic_(move)
has 5 pp like transform

https://bulbapedia.bulbagarden.net/wiki/Rage_(move)
rage is now different

rest now resets the toxic counter & stat reductions and all recovery moves dont fail for no reason

https://bulbapedia.bulbagarden.net/wiki/Solar_Beam_(move)
If the user is prevented from attacking with SolarBeam during harsh sunlight by conditions such as flinching, paralysis, and confusion, then PP will still be deducted regardless, due to the fact that SolarBeam was designed as a two-turn attack.

If SolarBeam is disrupted from succeeding due to conditions such as flinching, paralysis, or confusion, the entire move will now be cancelled rather than simply paused.

In this generation only, Mirror Move always fails when used by a transformed Pokémon.
*/

// Does 10% chance mean 10.2 /* 26/256 */ like in gen 1?

export const movePatches: Partial<Record<MoveId, Partial<Move>>> = {
  bide: { acc: 100 },
  conversion: {
    exec(battle, user) {
      const type = battle.rng.choice(
        user.base.moves
          .map(move => battle.gen.moveList[move].type)
          .filter(type => !user.v.types.includes(type)),
      );
      if (!type) {
        battle.info(user, "fail_generic");
        return false;
      }

      user.v.types = [type];
      battle.event({
        type: "conversion",
        user: user.owner.id,
        types: [type],
        volatiles: [{ id: user.owner.id, v: { conversion: [type] } }],
      });
      return false;
    },
  },
  disable: {
    exec(this: Move, battle, user, target) {
      target.lastDamage = 0;

      if (
        target.v.disabled ||
        !target.v.lastMove ||
        battle.moveIdOf(target.v.lastMove) === "struggle"
      ) {
        battle.info(user, "fail_generic");
        return false;
      } else if (!battle.checkAccuracy(this, user, target)) {
        return false;
      }

      const indexInMoves = target.v.lastMoveIndex!;

      target.v.disabled = { indexInMoves, turns: battle.rng.int(1, 8) };
      battle.event({
        type: "disable",
        src: target.owner.id,
        move: target.base.moves[indexInMoves],
        volatiles: [{ id: target.owner.id, v: { disabled: true } }],
      });
      return false;
    },
  },
  haze: {
    exec(battle, user, target) {
      battle.info(user, "haze", [
        { id: user.owner.id, v: { stages: null } },
        { id: target.owner.id, v: { stages: null } },
      ]);

      for (const k of stageKeys) {
        user.v.stages[k] = target.v.stages[k] = 0;
      }
      return false;
    },
  },
  roar: { kind: "phaze", acc: 100, priority: -1 },
  whirlwind: { kind: "phaze", acc: 100, priority: -1, ignore: ["fly"] },
  // --
  lightscreen: {
    kind: "screen",
    screen: "light_screen",
  },
  reflect: {
    kind: "screen",
    screen: "reflect",
  },
  // --
  amnesia: { stages: [["spd", 2]] },
  // --
  acid: { effect: [10, [["def", -1]]] },
  aurorabeam: { effect: [10, [["atk", -1]]] },
  bite: {
    type: "dark",
    effect: [30, "flinch"],
  },
  blizzard: { acc: 70 },
  bubble: { effect: [10, [["spe", -1]]] },
  bubblebeam: { effect: [10, [["spe", -1]]] },
  constrict: { effect: [10, [["spe", -1]]] },
  dig: { power: 60 },
  dizzypunch: { effect: [20, "confusion"] },
  doubleedge: { power: 120 },
  earthquake: { ignore: ["dig"] },
  explosion: { power: 250 },
  fireblast: { effect: [10, "brn"] },
  gust: { type: "flying", ignore: ["fly", "bounce"] },
  karatechop: { type: "fight" },
  poisonsting: { effect: [30, "psn"] },
  psychic: { effect: [10, [["spd", -1]]] },
  razorwind: { flag: "high_crit" },
  rockslide: { effect: [30, "flinch"] },
  rockthrow: { acc: 90 },
  sandattack: { type: "ground" },
  selfdestruct: { power: 200 },
  skullbash: {
    effect: [100, [["def", +1]]],
    effect_self: "charge",
  },
  sludge: { effect: [30, "psn"] },
  thunder: {
    ignore: ["fly", "bounce"],
    effect: [30, "par"],
  },
  triattack: { flag: "tri_attack" },
  wingattack: { power: 60 },
};
