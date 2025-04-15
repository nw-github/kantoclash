import type {Mods} from "~/game/battle";
import type {StageId} from "../game/utils";
import type {Generation} from "~/game/gen1";

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

const stageTable: Record<StageId, string> = {
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
