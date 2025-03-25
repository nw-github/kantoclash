import type {Mods} from "~/game/battle";
import type {Stages} from "../game/utils";
import type {Generation} from "~/game/gen1";
import type {ItemId} from "~/game/item";

export const randChoice = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export const musicTrackName = (track: string) => {
  return track.slice(track.lastIndexOf("/") + 1, track.lastIndexOf("."));
};

export const toSeconds = (pos: string) => {
  const [m, sms] = pos.split(":");
  if (!sms) {
    return +m;
  }

  const [s, ms] = sms.split(".").map(Number);
  return +m * 60 + s + ms / 1000;
};

export const toTitleCase = (s: string) => {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
};

export const roundTo = (num: number, places: number = 1) => {
  const pow = 10 ** places;
  return Math.round(num * pow) / pow;
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const modNames: Record<keyof Mods, {name: string; desc: string}> = {
  sleepClause: {
    name: "Sleep Clause",
    desc: "Only one enemy Pokémon can be put to sleep at a time.",
  },
  freezeClause: {name: "Freeze Clause", desc: "Only one Pokémon can be frozen at a time."},
  endlessBattle: {
    name: "Endless Battle Clause",
    desc: "Battles that cannot end naturally or exceed 1000 turns will result in a draw.",
  },
};

const stageTable: Record<Stages, string> = {
  atk: "Attack",
  def: "Defense",
  spa: "Special",
  spd: "Special Defense",
  spe: "Speed",
  acc: "Acccuracy",
  eva: "Evasion",
};

export const getStageTable = (gen: Generation) => {
  if (gen.id === 1) {
    return stageTable;
  } else {
    return {...stageTable, spa: "Special Attack"};
  }
};

export const getStatKeys = (gen: Generation) => {
  if (gen.id === 1) {
    return {hp: "HP", atk: "Atk", def: "Def", spa: "Spc", spe: "Spe"};
  } else {
    return {hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe"};
  }
};

export const itemDesc: Partial<Record<ItemId, string>> = {
  softsand: "Boosts Ground-type moves by 10%.",
  hardstone: "Boosts Rock-type moves by 10%.",
  metalcoat: "Boosts Steel-type moves by 10%.",
  pinkbow: "Boosts Normal-type moves by 10%.",
  blackbelt: "Boosts Fighting-type moves by 10%.",
  sharpbeak: "Boosts Flying-type moves by 10%.",
  poisonbarb: "Boosts Poison-type moves by 10%.",
  silverpowder: "Boosts Bug-type moves by 10%.",
  spelltag: "Boosts Ghost-type moves by 10%.",
  polkadotbow: "Boosts Normal-type moves by 10%.",
  charcoal: "Boosts Fire-type moves by 10%.",
  mysticwater: "Boosts Water-type moves by 10%.",
  miracleseed: "Boosts Grass-type moves by 10%.",
  magnet: "Boosts Electric-type moves by 10%.",
  twistedspoon: "Boosts Psychic-type moves by 10%.",
  nevermeltice: "Boosts Ice-type moves by 10%.",
  dragonscale: "Boosts Dragon-type moves by 10%.",
  blackglasses: "Boosts Dark-type moves by 10%.",
  brightpowder: "Makes foes less accurate.",
  metalpowder: "Boosts Ditto's Def and SpD by 50%.",
  lightball: "Boosts Pikachu's SpA by 50%.",
  quickclaw: "Small chance to go first in priority bracket.",
  stick: "Boosts Farfetch'd's critical hit ratio by 2.",
  thickclub: "Boosts Marowak's Atk by 50%.",
  scopelens: "Boosts critical hit ratio.",
  leftovers: "Heal 1/16 HP after each turn.",
  kingsrock: "Small chance to flinch on most moves.",
  focusband: "Small chance to endure hits that would kill.",
  berserkgene: "Boosts Atk but permanently confuses.",
  berry: "Restores 10 HP once below 50%.",
  berryjuice: "Restores 20 HP once below 50%.",
  goldberry: "Restores 30 HP once below 50%.",
  mintberry: "Cures sleep once.",
  psncureberry: "Cures poison once.",
  przcureberry: "Cures paralyze once.",
  iceberry: "Cures burn once.",
  burntberry: "Cures freeze once.",
  miracleberry: "Cures status or confusion once.",
  bitterberry: "Cures confusion once.",
  mysteryberry: "Restores PP by 5 once.",
};
