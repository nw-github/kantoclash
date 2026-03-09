import type {BattleEvent, ClientVolatiles, PlayerId, PokeId, SwitchEvent} from "~~/game/events";
import {
  type FormId,
  type Gender,
  Pokemon,
  transform,
  type ValidatedPokemonDesc,
} from "~~/game/pokemon";
import {speciesList, type SpeciesId} from "~~/game/species";
import type {HazardId, ScreenId, Weather} from "~~/game/utils";
import type {Generation} from "~~/game/gen";
import type {AnimationParams} from "~/components/battle/ActivePokemon.vue";

export type ClientActivePokemon = {
  hidden?: bool;
  fainted: bool;
  owned: bool;
  v: ClientVolatiles;
  base: Pokemon;
  indexInTeam: number;
  abilityUnknown?: bool;
  substitute?: bool;
};

export type ClientPlayer = {
  name: string;
  isSpectator: bool;
  connected: bool;
  admin: bool | undefined;

  team: Pokemon[];
  teamDesc: ValidatedPokemonDesc[];
  active: (ClientActivePokemon | undefined)[];
  nPokemon: number;
  nFainted: number;
  hazards?: Partial<Record<HazardId, number>>;
  screens?: Partial<Record<ScreenId, bool>>;
};

export class Players {
  items: Record<string, ClientPlayer> = {};

  get(id: PlayerId) {
    return this.items[id];
  }

  ownerOf(id: PokeId) {
    const [player] = id.split(":");
    return this.items[player];
  }

  poke(id: PokeId) {
    const [player, pos] = id.split(":");
    return this.items[player]?.active[Number(pos)];
  }

  setPoke(id: PokeId, active: ClientActivePokemon) {
    const [player, pos] = id.split(":");
    return (this.items[player].active[Number(pos)] = active);
  }

  add(id: PlayerId, player: ClientPlayer) {
    this.items[id] = player;
  }
}

export const gen1Gender: Partial<Record<SpeciesId, Gender>> = {
  nidoranf: "F",
  nidoranm: "M",
};

export const getSpritePath = (
  speciesId: string | undefined,
  female?: bool,
  shiny?: bool,
  back?: bool,
  form?: FormId,
) => {
  if (!speciesId || !(speciesId in speciesList)) {
    return `/sprites/battle/unknown.png`;
  }

  const sp = speciesList[speciesId as SpeciesId];
  let id = sp.sprite ?? String(sp.dexId);
  if (form) {
    id += `-${form}`;
  }

  let extra = shiny ? "shiny/" : "";
  if (female && femaleIds.has(id)) {
    extra += "female/";
  }

  if (!back) {
    return `/sprites/battle/${extra}${id}.gif`;
  } else {
    return `/sprites/battle/back/${extra}${id}.gif`;
  }
};

type Callbacks = {
  playCry(speciesId: SpeciesId, pitchDown: bool): Promise<void> | void;
  playShiny(id: PokeId): Promise<void> | void;
  playDmg(eff: number): Promise<void> | void;
  playAnimation(id: PokeId, params: AnimationParams): Promise<void> | void;
  displayEvent(e: RawUIBattleEvent): void;
  preloadSprite(poke: PokeId, speciesId: string, female?: bool, shiny?: bool, form?: FormId): any;
};

export class ClientManager {
  weather?: Weather;
  victor?: PlayerId | "draw";

  constructor(private cb: Callbacks) {}

  async handleEvent(e: BattleEvent, players: Players, gen: Generation) {
    if (e.type === "switch") {
      const poke = players.poke(e.src);
      let _img;
      if (poke) {
        if (!poke.fainted && e.why !== "batonpass" && e.why !== "uturn") {
          if (e.why !== "phaze") {
            this.cb.displayEvent({type: "retract", src: e.src, name: poke.base.name});
          }
          await this.cb.playAnimation(e.src, {
            anim: e.why === "phaze" ? "phaze" : "retract",
            batonPass: false,
            name: poke.base.name,
          });
        }

        _img = this.cb.preloadSprite(e.src, e.speciesId, e.gender === "F", e.shiny, e.form);
      } else {
        players.setPoke(e.src, {
          hidden: true,
          v: {stages: {}},
          fainted: true,
          indexInTeam: -1,
          owned: false,
          base: new Pokemon({
            gen,
            speciesId: e.speciesId,
            ivs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
            stats: {hp: 100, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
            level: 0,
            name: "",
            moves: [],
            pp: [],
            hp: 0,
            friendship: 0,
            shiny: false,
            gender: "N",
          }),
        });
      }

      this.cb.displayEvent(e);
      await this.cb.playAnimation(e.src, {
        anim: "sendin",
        name: e.name,
        batonPass: e.why === "batonpass",
        cb: () => {
          const poke = players.setPoke(e.src, {
            ...e,
            owned: e.indexInTeam !== -1,
            base:
              e.indexInTeam !== -1
                ? players.ownerOf(e.src).team[e.indexInTeam]
                : this.findOrCreateEnemyBasePokemon(e, players, gen),
            v: {stages: {}},
            fainted: false,
          });
          poke.base.hp = e.hp;
          this.handleVolatiles(e, players);
          this.cb.playCry(e.speciesId, false)?.then(() => {
            if (e.shiny) {
              this.cb.playShiny(e.src);
            }
          });
        },
      });
      return;
    } else if (e.type === "damage" || e.type === "recover") {
      const update = () => {
        const target = players.poke(e.target)!;
        const ev = e as UIDamageEvent | UIRecoverEvent;
        target.base.hp = e.hpAfter;
        if (target.owned) {
          ev.maxHp = target.base.stats.hp;
        }

        if (e.why !== "substitute") {
          this.handleVolatiles(ev, players);
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
          cb: () => {
            update();
            this.cb.playDmg(eff);
            this.cb.playAnimation(e.target, {anim: "hurt", direct: true});
          },
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
            this.cb.playAnimation(e.src, {anim: "hurt", direct: true}),
          ]);
        }
      }

      if (e.why === "substitute") {
        players.poke(e.target)!.substitute = true;
        this.cb.displayEvent({type: "get_sub", src: e.target});
        await this.cb.playAnimation(e.target, {
          anim: "get_sub",
          cb: () => this.handleVolatiles(e, players),
        });
      }
      return;
    } else if (e.type === "info") {
      if (e.why === "faint") {
        const poke = players.poke(e.src)!;
        this.cb.playCry(poke.base.speciesId, true);
        this.cb.displayEvent(e);
        await this.cb.playAnimation(e.src, {anim: "faint"});

        poke.fainted = true;
        poke.hidden = true;
        players.ownerOf(e.src).nFainted++;
        this.handleVolatiles(e, players);
        return;
      } else if (e.why === "heal_bell") {
        players.ownerOf(e.src).team.forEach(poke => (poke.status = undefined));
      } else if (e.why === "batonpass") {
        this.handleVolatiles(e, players);
        await this.cb.playAnimation(e.src, {
          anim: "retract",
          name: players.poke(e.src)!.base.name,
          batonPass: true,
        });
        return;
      } else if (e.why === "uturn") {
        this.cb.displayEvent(e);
        this.handleVolatiles(e, players);
        await this.cb.playAnimation(e.src, {
          anim: "retract",
          name: players.poke(e.src)!.base.name,
          batonPass: true,
        });
        return;
      }
    } else if (e.type === "transform") {
      const _img = this.cb.preloadSprite(e.src, e.speciesId, e.gender === "F", e.shiny, e.form);

      this.cb.displayEvent(e);

      await this.cb.playAnimation(e.src, {
        anim: "transform",
        cb: () => {
          this.handleVolatiles(e, players);

          const src = players.poke(e.src)!;
          if (e.permanent) {
            src.base.speciesId = e.speciesId;

            const ability = e.volatiles?.find(v => v.id === e.src)?.v.ability;
            if (ability) {
              src.base.ability = ability;
            }
          }

          if (e.target) {
            src.base = transform(src.base.real, players.poke(e.target)!.base);
          }
          src.base.form = e.form;
        },
      });
      return;
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
          cb: () => {
            this.cb.displayEvent(e);
            this.cb.playDmg(e.eff ?? 1);
            this.cb.playAnimation(e.target, {anim: "hurt", direct: false});
          },
        });
      }
      if (e.broken) {
        players.poke(e.target)!.substitute = false;
        this.cb.displayEvent({type: "sub_break", target: e.target});
        await this.cb.playAnimation(e.target, {
          anim: "lose_sub",
          cb: () => this.handleVolatiles(e, players),
        });
      }
      return;
    } else if (e.type === "end") {
      this.victor = e.victor ?? "draw";
    } else if (e.type === "weather") {
      if (e.kind === "start") {
        this.weather = e.weather;
      } else if (e.kind === "end") {
        this.weather = undefined;
      }
    } else if (e.type === "item") {
      players.poke(e.src)!.base.itemId = undefined;
    } else if (e.type === "screen") {
      players.get(e.user).screens ??= {};
      players.get(e.user).screens![e.screen] = e.kind === "start";
    } else if (e.type === "thief") {
      players.poke(e.src)!.base.itemId = e.item;
      players.poke(e.target)!.base.itemId = undefined;
    } else if (e.type === "trick") {
      players.poke(e.src)!.base.itemId = e.srcItem;
      players.poke(e.target)!.base.itemId = e.targetItem;
    } else if (e.type === "knockoff") {
      players.poke(e.target)!.base.itemUnusable = true;
    } else if (e.type === "recycle") {
      const src = players.poke(e.src)!.base;
      src.itemId = e.item;
      src.itemUnusable = false;
    } else if (e.type === "sketch") {
      const src = players.poke(e.src)!;
      if (src.owned) {
        src.base.moves[src.base.moves.indexOf("sketch")] = e.move;
      }
    } else if (e.type === "hazard") {
      const player = players.get(e.player);
      player.hazards ??= {};
      if (e.spin) {
        player.hazards[e.hazard] = 0;
      } else {
        await this.cb.playAnimation(e.src, {
          anim: "spikes",
          cb() {
            player.hazards![e.hazard] = (player.hazards![e.hazard] || 0) + 1;
          },
        });
      }
    } else if (e.type === "skill_swap") {
      const src = players.poke(e.src);
      const target = players.poke(e.target);
      if (src) {
        src.abilityUnknown = true;
      }
      if (target) {
        target.abilityUnknown = true;
      }
      // TODO: set ability
    } else if (e.type === "move") {
      const src = players.poke(e.src)!;
      if (!src.owned && !e.called) {
        const idx = src.base.moves.findIndex(id => id === e.move);
        // TODO: pressure, ignore 'called' moves (from assist, metronome, etc)
        const ppcost = e.disabled || e.thrashing ? 0 : 1;
        if (idx === -1) {
          src.base.moves.push(e.move);
          src.base.pp.push(src.base.gen.getMaxPP(src.base.gen.moveList[e.move]) - ppcost);
        } else {
          src.base.pp[idx] -= ppcost;
        }
      }
    } else if (e.type === "charge") {
      const src = players.poke(e.src)!;
      if (!src.owned && !src.base.moves.includes(e.move)) {
        src.base.moves.push(e.move);
        src.base.pp.push(src.base.gen.getMaxPP(src.base.gen.moveList[e.move]));
      }
    } else if (e.type === "proc_ability") {
      const src = players.poke(e.src)!;
      if (!src.owned && !src.base.ability) {
        src.base.ability = e.ability;
      }
    }
    // TODO: PP restoring berries, mimic

    this.handleVolatiles(e, players);
    if (e.type !== "sv") {
      this.cb.displayEvent(e);
    }
  }

  reset(players: Players, gen: Generation) {
    for (const k in players.items) {
      const player = players.items[k];
      player.nFainted = 0;
      player.active = Array(player.active.length);
      player.screens = undefined;
      player.hazards = undefined;
      player.team = player.teamDesc.map(poke => Pokemon.fromDescriptor(gen, poke));
    }

    this.weather = undefined;
  }

  private findOrCreateEnemyBasePokemon(e: SwitchEvent, players: Players, gen: Generation) {
    const owner = players.ownerOf(e.src);
    // TODO: better heuristics based on for example, HP, if the opponent has multiple of the same
    // Pokemon
    const poke = owner.team.find(poke => poke.speciesId === e.speciesId);
    if (poke) {
      return poke;
    }

    const idx = owner.team.push(
      new Pokemon({
        gen,
        speciesId: e.speciesId,
        level: e.level,
        name: e.name,
        hp: e.hp,
        shiny: e.shiny,
        gender: e.gender,
        stats: {hp: 100, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
        ivs: {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0},
        moves: [],
        pp: [],
        friendship: 0,
      }),
    );
    return owner.team[idx - 1];
  }

  private handleVolatiles(e: BattleEvent, players: Players) {
    if (e.volatiles) {
      for (const {v, id} of e.volatiles) {
        const poke = players.poke(id);
        if (!poke) {
          continue;
        }

        poke.v = mergeVolatiles(v, poke.v) as ClientVolatiles;
        poke.base.status = poke.v.status;
      }
    }
  }
}

const mergeVolatiles = <T extends object>(ext: any, obj: T) => {
  const isObject = (foo: any): foo is object => {
    return !Array.isArray(foo) && typeof foo === "object";
  };

  const result: any = {};
  for (const kk of new Set([...Object.keys(obj), ...Object.keys(ext)])) {
    const k = kk as keyof T;
    if (ext[k] === null) {
      continue;
    } else if (isObject(obj[k]) || isObject(ext[k])) {
      result[k] = mergeVolatiles(ext[k] ?? {}, obj[k] ?? {});
    } else {
      result[k] = ext[k] ?? obj[k];
    }
  }

  return result as T;
};
