import type { Status } from "~/game/pokemon";
import type { Type } from "~/game/utils";

export const typeColor: Record<Type, string> = {
  normal: "#8F98A0",
  rock: "#C6B68A",
  ground: "#D87646",
  ghost: "#5168AB",
  poison: "#AA69C7",
  bug: "#8FC02B",
  flying: "#8EA7DC",
  fight: "#CD4068",
  water: "#4D8FD4",
  grass: "#62BA5A",
  fire: "#FF9B53",
  electric: "#F3D13B",
  ice: "#73CDBF",
  psychic: "#F97075",
  dragon: "#096CC3",
};

export const statusColor: Record<Status, string> = {
  psn: "#E879F9",
  tox: "#E879F9",
  brn: "#FB923C",
  frz: "#8bb4e6",
  slp: "#a4a48b",
  par: "#F59E0B",
};

export const baseStatColor = (stat: number) => {
  // TODO: blend between colors
  return [
    stat < 70 && "text-red-400",
    stat < 100 && "text-amber-300",
    stat >= 100 && "text-lime-400",
  ];
};
