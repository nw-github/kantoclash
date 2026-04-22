import type {Type} from "~~/game/utils";

export const typeColor: Record<Type, string> = {
  normal: "#8F98A0",
  rock: "#C6B68A",
  ground: "#D87646",
  ghost: "#5168AB",
  "???": "#5168AB",
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
  dark: "#595265",
  steel: "#598DA0",
};

export const statusColor = {
  brn: {color: "old-orange", variant: undefined},
  psn: {color: "old-fuchsia", variant: undefined},
  tox: {color: "old-fuchsia", variant: undefined},
  frz: {color: "old-sky", variant: undefined},
  par: {color: "old-amber", variant: undefined},
  slp: {color: "neutral", variant: "subtle"},
} as const;

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

type HSV = {h: number; s: number; v: number};

const colorInterp = (
  value: number,
  [start, ...colors]: [HSV, [HSV, number], ...[HSV, number][]],
  interp = lerp,
) => {
  const hsv2rgb = (h: number, s: number, v: number) => {
    const f = (n: number, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1)];
  };

  let prev = 0;
  for (const [color, max] of colors) {
    if (value <= max) {
      const f = (value - prev) / (max - prev);
      return hsv2rgb(
        interp(start.h, color.h, f),
        interp(start.s, color.s, f),
        interp(start.v, color.v, f),
      );
    }

    prev = max;
    start = color;
  }

  return [0, 0, 0];
};

export const hpColor = (percent: number) => {
  const [r, g, b] = colorInterp(percent, [red, [hp_yellow, 50], [hp_green, 100]]);
  return `rgb(${r}, ${g}, ${b})`;
};

export const baseStatColor = (stat: number) => {
  const [r, g, b] = colorInterp(stat, [red, [bs_yellow, 65], [bs_green, 100], [bs_blue, 255]]);
  return `rgb(${r}, ${g}, ${b})`;
};

export const ppColor = (cur: number) => {
  return cur <= 2 ? "text-red-500" : cur <= 5 ? "text-amber-400" : "";
};

export const teamName = (name?: string) => name || "Unnamed Team";

const red = {h: 0, s: 0.8235294117647058, v: 153};
const hp_yellow = {h: 40.60606060606061, s: 0.9801980198019802, v: 202};
const hp_green = {h: 85.87155963302752, s: 0.8790322580645161, v: 124};

const bs_yellow = {h: 45.39823008849557, s: 0.9658119658119658, v: 234};
const bs_green = {h: 83.73626373626374, s: 0.8921568627450981, v: 204};
const bs_blue = {h: 198.63013698630135, s: 0.9399141630901288, v: 233};
