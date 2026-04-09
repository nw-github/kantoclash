import type {BattleEvent, PlayerId, PokeId, SwitchEvent} from "~~/game/events";
import {Pokemon, type ValidatedPokemonDesc} from "~~/game/pokemon";
import type {SpeciesId} from "~~/game/species";
import type {Generation} from "~~/game/gen";
import type {AnimationParams} from "~/components/battle/ActivePokemon.vue";
import type {BattleTimers, TeamPreview} from "~~/server/gameServer";
import {type Battlemon, Battle, type Player} from "~~/game/battle";
import {CVF, type NonEmptyArray} from "~~/game/utils";
import type {DamagingMove, ForesightMove} from "~~/game/moves";
import dirty from "~~/game/dirty";

export type ClientActivePokemon = Battlemon & {
  visible?: bool;
  owned?: bool;
  indexInTeam?: number;
  abilityUnknown?: bool;
  cflags?: CVF;
};

export type ClientPlayer = {
  name: string;
  isSpectator: bool;
  connected: bool;
  admin: bool | undefined;

  time?: BattleTimers[string];
  bp?: Omit<Player, "active"> & {active: NonEmptyArray<ClientActivePokemon>};
  teamDesc?: ValidatedPokemonDesc[];
  teamPreview?: TeamPreview;
  nPokemon: number;
  nFainted: number;
};

type Callbacks = {
  playCry(speciesId: SpeciesId, pitchDown: bool): Promise<void> | void;
  playShiny(id: PokeId): Promise<void> | void;
  playDmg(eff: number): Promise<void> | void;
  playAnimation(id: PokeId, params: AnimationParams): Promise<void> | void;
  displayEvent(e: RawUIBattleEvent): void;
};

export class AnimCallback {
  private _cb: (() => void) | undefined;

  constructor(cb: () => void) {
    this._cb = cb;
  }

  exec() {
    this._cb?.();
    this._cb = undefined;
  }
}

type AddPlayerInfo = {
  id: string;
  name: string;
  admin?: bool;
  nPokemon: number;
  teamPreview?: TeamPreview;
  isSpectator?: bool;
};

export class Players {
  items: Record<string, ClientPlayer> = {};

  get(id: PlayerId) {
    return this.items[id];
  }

  get2(id: PlayerId) {
    return this.items[id]?.bp;
  }

  ownerOf(id: PokeId) {
    const [player] = id.split(":");
    return this.items[player]?.bp;
  }

  clientOwnerOf(id: PokeId) {
    const [player] = id.split(":");
    return this.items[player];
  }

  poke(id: PokeId) {
    const [player, pos] = id.split(":");
    return this.items[player]?.bp?.active[+pos];
  }

  getBP(id: PlayerId) {
    return this.items[id]?.bp;
  }

  add({name, isSpectator, nPokemon, id, admin, teamPreview}: AddPlayerInfo) {
    if (id in this.items) {
      return this.items[id];
    }

    return (this.items[id] = {
      name,
      isSpectator: !!isSpectator,
      connected: true,
      nPokemon,
      nFainted: this.items[id]?.nFainted ?? 0,
      admin,
      teamPreview,
    });
  }
}

export class ClientManager {
  victor?: PlayerId | "draw";
  battle: Battle;
  players = new Players();
  private fake: Pokemon;
  private cb: Callbacks;
  private defaultCb: Callbacks;

  constructor(gen: Generation) {
    this.fake = Pokemon.fromDescriptor(gen, {speciesId: "abra", moves: [], level: 0});
    [this.battle] = Battle.start({
      gen,
      player1: {id: "1", team: [this.fake]},
      player2: {id: "2", team: [this.fake]},
      seed: "5",
      chooseLead: true,
    });
    this.defaultCb = this.cb = {
      playCry() {},
      playShiny() {},
      playDmg() {},
      playAnimation: (_, params) => void params.cb?.exec(),
      displayEvent() {},
    };
  }

  listen(cb: Callbacks) {
    this.cb = cb;
  }

  unlisten() {
    this.cb = this.defaultCb;
  }

  async handleEvent(e: BattleEvent) {
    if (e.type === "switch") {
      const poke = this.players.poke(e.src)!;
      if (poke.initialized && !poke.v.fainted && e.why !== "batonpass" && e.why !== "uturn") {
        if (e.why !== "phaze") {
          this.cb.displayEvent({type: "retract", src: e.src, name: poke.base.name});
        }
        await this.cb.playAnimation(e.src, {
          anim: e.why === "phaze" ? "phaze" : "retract",
          batonPass: false,
          name: poke.base.name,
        });
      }

      this.cb.displayEvent(e);
      return await this.cb.playAnimation(e.src, {
        anim: "sendin",
        name: e.name,
        batonPass: e.why === "batonpass",
        cb: new AnimCallback(() => {
          const base =
            e.indexInTeam !== -1
              ? this.players.ownerOf(e.src)!.team[e.indexInTeam]
              : this.findOrCreateEnemyBasePokemon(e);
          poke.switchTo(base, this.battle);
          poke.cflags = CVF.none;
          this.battle.events.length = 0;

          poke.visible = true;
          poke.owned = e.indexInTeam !== -1;
          poke.indexInTeam = e.indexInTeam;
          poke.base.hp = e.hp;
          this.handleVolatiles(e);
          this.cb.playCry(e.speciesId, false)?.then(() => {
            if (e.shiny) {
              this.cb.playShiny(e.src);
            }
          });
        }),
      });
    } else if (e.type === "damage" || e.type === "recover") {
      const update = () => {
        const target = this.players.poke(e.target)!;
        const ev = e as UIDamageEvent | UIRecoverEvent;
        target.base.hp = e.hpAfter;
        if (target.owned) {
          ev.maxHp = target.base.maxHp;
        }

        if (e.why !== "substitute") {
          this.handleVolatiles(ev);
        }
        if (e.why !== "explosion" || (e.eff ?? 1) !== 1) {
          this.cb.displayEvent(ev);
        }
      };

      if (e.type === "damage" && (e.why === "attacked" || e.why === "ohko" || e.why === "trap")) {
        const eff = e.why === "ohko" || !e.eff ? 1 : e.eff;
        await this.cb.playAnimation(e.src, {
          anim: "attack",
          target: e.target,
          cb: new AnimCallback(() => {
            update();
            this.cb.playDmg(eff);
            this.cb.playAnimation(e.target, {anim: "hurt", direct: true});
          }),
        });
      } else {
        update();
        if (
          e.why === "confusion" ||
          e.why === "sand" ||
          e.why === "hail" ||
          e.why === "future_sight"
        ) {
          await Promise.allSettled([
            this.cb.playDmg(e.eff ?? 1),
            this.cb.playAnimation(e.target, {anim: "hurt", direct: true}),
          ]);
        }
      }

      if (e.why === "substitute") {
        this.players.poke(e.target)!.v.substitute = 1;
        this.cb.displayEvent({type: "get_sub", src: e.target});
        await this.cb.playAnimation(e.target, {
          anim: "get_sub",
          cb: new AnimCallback(() => this.handleVolatiles(e)),
        });
      }
      return;
    } else if (e.type === "info") {
      const confusionMessages = [
        "become_confused",
        "fatigue_confuse",
        "fatigue_confuse_max",
        "confused",
      ];

      if (e.why === "faint") {
        const poke = this.players.poke(e.src)!;
        this.cb.playCry(poke.v.speciesId, true);
        this.cb.displayEvent(e);
        await this.cb.playAnimation(e.src, {anim: "faint"});

        poke.v.fainted = true;
        poke.visible = false;
        this.players.clientOwnerOf(e.src).nFainted++;
        this.handleVolatiles(e);
        return;
      } else if (e.why === "heal_bell") {
        this.players.ownerOf(e.src)!.team.forEach(poke => (poke.status = undefined));
      } else if (e.why === "batonpass") {
        this.handleVolatiles(e);
        await this.cb.playAnimation(e.src, {
          anim: "retract",
          name: this.players.poke(e.src)!.base.name,
          batonPass: true,
        });
        return;
      } else if (e.why === "uturn") {
        this.cb.displayEvent(e);
        this.handleVolatiles(e);
        await this.cb.playAnimation(e.src, {
          anim: "retract",
          name: this.players.poke(e.src)!.base.name,
          batonPass: true,
        });
        return;
      } else if (e.why === "confused_end") {
        this.players.poke(e.src)!.v.confusion = 0;
      } else if (confusionMessages.includes(e.why)) {
        this.players.poke(e.src)!.v.confusion = 1;
      }
    } else if (e.type === "transform") {
      this.cb.displayEvent(e);

      return await this.cb.playAnimation(e.src, {
        anim: "transform",
        cb: new AnimCallback(() => {
          this.handleVolatiles(e);

          const src = this.players.poke(e.src)!;
          if (e.permanent) {
            src.base.speciesId = e.speciesId;
            if (e.ability) {
              src.base.ability = e.ability;
            }
            src.base.recalculateStats();
          }

          if (e.ability) {
            src.v.ability = e.ability;
          }
        }),
      });
    } else if (e.type === "hit_sub") {
      if (e.confusion) {
        await Promise.allSettled([
          this.cb.playDmg(e.eff ?? 1),
          this.cb.playAnimation(e.src, {anim: "hurt", direct: false}),
        ]);
      } else {
        await this.cb.playAnimation(e.src, {
          anim: "attack",
          target: e.target,
          cb: new AnimCallback(() => {
            this.cb.displayEvent(e);
            this.cb.playDmg(e.eff ?? 1);
            this.cb.playAnimation(e.target, {anim: "hurt", direct: false});
          }),
        });
      }
      if (e.broken) {
        this.players.poke(e.target)!.v.substitute = 0;
        this.cb.displayEvent({type: "sub_break", target: e.target});
        await this.cb.playAnimation(e.target, {
          anim: "lose_sub",
          cb: new AnimCallback(() => this.handleVolatiles(e)),
        });
      }
      return;
    } else if (e.type === "end") {
      this.victor = e.victor ?? "draw";
    } else if (e.type === "weather") {
      if (e.kind === "start") {
        this.battle.weather = {kind: e.weather, turns: -1};
      } else if (e.kind === "end") {
        this.battle.weather = undefined;
      }
    } else if (e.type === "item") {
      this.players.poke(e.src)!.base.itemId = undefined;
    } else if (e.type === "screen") {
      this.players.get(e.user).bp!.screens[e.screen] = e.kind === "start" ? 1 : 0;
    } else if (e.type === "thief") {
      this.players.poke(e.src)!.base.itemId = e.item;
      this.players.poke(e.target)!.base.itemId = undefined;
    } else if (e.type === "trick") {
      this.players.poke(e.src)!.base.itemId = e.srcItem;
      this.players.poke(e.target)!.base.itemId = e.targetItem;
    } else if (e.type === "knockoff") {
      this.players.poke(e.target)!.base.itemUnusable = true;
    } else if (e.type === "recycle") {
      const src = this.players.poke(e.src)!.base;
      src.itemId = e.item;
      src.itemUnusable = false;
    } else if (e.type === "sketch") {
      const src = this.players.poke(e.src)!;
      if (src.owned && e.moveIndex !== -1) {
        src.base.moves[e.moveIndex] = e.move;
      }
    } else if (e.type === "hazard") {
      const player = this.players.get(e.player).bp!;
      if (e.spin) {
        player.hazards[e.hazard] = 0;
      } else {
        await this.cb.playAnimation(e.src, {
          anim: "spikes",
          cb: new AnimCallback(() => {
            player.hazards![e.hazard] = (player.hazards![e.hazard] || 0) + 1;
          }),
        });
      }
    } else if (e.type === "skill_swap") {
      const src = this.players.poke(e.src);
      const target = this.players.poke(e.target);
      if (src) {
        src.abilityUnknown = true;
      }
      if (target) {
        target.abilityUnknown = true;
      }
      // TODO: set ability
    } else if (e.type === "copy_ability") {
      this.players.poke(e.src)!.v.ability = e.ability;
      this.players.poke(e.src)!.abilityUnknown = false;
      this.players.poke(e.target)!.v.ability = e.ability;
      this.players.poke(e.target)!.abilityUnknown = false;
    } else if (e.type === "move") {
      const src = this.players.poke(e.src)!;
      if (!src.owned && !e.called) {
        const idx = src.base.moves.findIndex(id => id === e.move);
        // TODO: pressure
        const ppcost = e.disabled || e.thrashing ? 0 : 1;
        if (idx === -1) {
          src.base.moves.push(e.move);
          src.base.pp.push(src.base.gen.getMaxPP(e.move) - ppcost);
        } else {
          src.base.pp[idx] -= ppcost;
        }
      }
    } else if (e.type === "charge") {
      const src = this.players.poke(e.src)!;
      if (!e.called && !src.owned && !src.base.moves.includes(e.move)) {
        src.base.moves.push(e.move);
        src.base.pp.push(src.base.gen.getMaxPP(e.move));
      }
    } else if (e.type === "proc_ability") {
      const src = this.players.poke(e.src)!;
      src.abilityUnknown = false;
      src.v.ability = e.ability;
      if (!src.owned && !src.base.ability && !src.abilityUnknown) {
        src.base.ability = e.ability;
      }
    }
    // TODO: PP restoring berries, mimic

    this.handleVolatiles(e);
    if (e.type !== "sv") {
      this.cb.displayEvent(e);
    }
  }

  reset(gen: Generation, doubles?: bool) {
    const battlers = [];
    for (const id in this.players.items) {
      const cp = this.players.get(id);
      if (!cp.isSpectator) {
        cp.nFainted = 0;
        battlers.push(id);
      }
    }

    const [player1, player2] = battlers.map(id => {
      const cp = this.players.get(id);
      if (cp.teamDesc) {
        return {id, team: cp.teamDesc.map(poke => Pokemon.fromDescriptor(gen, poke))};
      } else {
        return {id, team: Array.from({length: cp.nPokemon}, () => this.fake)};
      }
    });

    [this.battle] = Battle.start({
      gen,
      player1,
      player2,
      seed: "5",
      doubles,
      chooseLead: true,
    });
    this.players.get(player1.id).bp = this.battle.players[0];
    this.players.get(player2.id).bp = this.battle.players[1];
  }

  private findOrCreateEnemyBasePokemon(e: SwitchEvent) {
    const owner = this.players.ownerOf(e.src)!;
    // TODO: better heuristics based on for example, HP, if the opponent has multiple of the same
    // Pokemon
    const poke = owner.team.find(poke => poke.speciesId === e.speciesId && poke !== this.fake);
    if (poke) {
      return poke;
    }

    const newPoke = new Pokemon({
      gen: this.battle.gen,
      speciesId: e.speciesId,
      level: e.level,
      name: e.name,
      hp: e.hp,
      shiny: e.shiny,
      gender: e.gender,
      stats: {hp: 100, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
      ivs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
      evs: {},
      moves: [],
      pp: [],
      friendship: 0,
    });
    const slot = owner.team.findIndex(poke => poke === this.fake);
    if (slot !== -1) {
      return (owner.team[slot] = newPoke);
    }
    return owner.team[owner.team.push(newPoke) - 1];
  }

  private handleVolatiles(e: BattleEvent) {
    if (!e.volatiles) {
      return;
    }

    for (const {v, id} of e.volatiles) {
      const poke = this.players.poke(id)!;
      const gen = this.battle.gen;
      if (v.stages) {
        dirty.merge(poke.v.stages, v.stages);
      }
      if (v.stats) {
        dirty.merge(poke.v.stats, v.stats);
      }
      if (v.types) {
        poke.v.types = v.types.filter(ty => !!ty);
      }
      apply(poke.v, v, "form");
      apply(poke.v, v, "speciesId");
      apply(poke.v, v, "gender");
      apply(poke.v, v, "shiny");
      apply(poke.v, v, "transformed");
      apply(poke.v, v, "stockpile");
      apply(poke.v, v, "perishCount");
      apply(poke.v, v, "magnetRise");
      apply(poke.v, v, "flags");
      apply(poke.v, v, "drowsy");
      apply(poke.v, v, "charging", c => ({move: gen.moveList[c] as DamagingMove, targets: []}));
      apply(poke.v, v, "trapped", c => ({
        move: gen.moveList[c] as DamagingMove,
        user: poke,
        turns: -1,
      }));
      apply(poke.v, v, "identified", c => gen.moveList[c] as ForesightMove);
      apply(poke.v, v, "seededBy", id => this.players.poke(id));
      apply(poke.v, v, "meanLook", id => this.players.poke(id));
      apply(poke.v, v, "attract", id => this.players.poke(id));
      apply(poke.base, v, "status");
      apply(poke, v, "cflags");
    }
  }
}

function apply<T extends object, K extends keyof T, D extends {[P in K]: T[P] | null | undefined}>(
  obj: T,
  diff: D,
  prop: K,
): void;

function apply<T extends object, D extends object, K extends keyof T & keyof D>(
  obj: T,
  diff: D,
  prop: K,
  mapper: (v: D[K] & {}) => T[K],
): void;

function apply(obj: any, diff: any, prop: any, mapper?: any) {
  if (diff[prop] === null) {
    obj[prop] = undefined;
  } else if (diff[prop] !== undefined) {
    obj[prop] = mapper ? mapper(diff[prop]) : diff[prop];
  }
}
