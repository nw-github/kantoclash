import type {Mods} from "~~/game/battle";
import type {StageId} from "~~/game/utils";
import type {Generation} from "~~/game/gen";
import {parseBlob} from "music-metadata";

export const randChoice = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export type MusicInfo = {
  loopStart: number;
  loopEnd: number;
  offset: number;
  title?: string;
  artist?: string;
  album?: string;
};

const MUSIC_FILE_REGEX = /(.*)\((.*)\)(\..*)?/;

export const trackToPath = (tr: string) =>
  "/" + tr.split("/").slice(2).map(encodeURIComponent).join("/");

export const musicTrackName = (track: string) => {
  return track.slice(track.lastIndexOf("/") + 1, track.lastIndexOf("."));
};

export const getMusicInfo = async (blob: Blob, path: string) => {
  const result: MusicInfo = {loopStart: 0, loopEnd: 0, offset: 0};
  const data = await parseBlob(blob, {skipCovers: true});
  result.title = data.common.title;
  result.artist = data.common.artist;
  result.album = data.common.album;

  const sampleRate = data.format.sampleRate;
  for (const format in data.native) {
    for (const tag of data.native[format]) {
      const name = tag.id.startsWith("TXXX") ? tag.id.slice(5) : tag.id;
      if (typeof tag.value !== "string") {
        continue;
      }

      if (name === "LOOP_START" && sampleRate) {
        result.loopStart = Number(tag.value) / sampleRate;
      } else if (name === "LOOP_END" && sampleRate) {
        result.loopEnd = Number(tag.value) / sampleRate;
      } else if (name === "START_OFFSET") {
        result.offset = Number(tag.value);
      } else if (name === "S_LOOP_START") {
        result.loopStart = Number(tag.value);
      } else if (name === "S_LOOP_END") {
        result.loopEnd = Number(tag.value);
      }
    }
  }

  if (!result.title) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const match = name.match(MUSIC_FILE_REGEX);
    if (match) {
      result.title = match[1].trim();
      result.album = match[2].trim();
    } else {
      result.title = name.slice(0, name.lastIndexOf("."));
    }
  }

  return result;
};

export const toTitleCase = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1);

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

export const formatRemainingTime = (time: {startedAt: number; duration: number}) => {
  const secs = Math.max(Math.floor((time.startedAt + time.duration - Date.now()) / 1000), 0);

  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return {
    red: secs <= 10,
    time: `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`,
  };
};
