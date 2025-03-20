import tailwindColors from "tailwindcss/colors";
import type {Status} from "~/game/pokemon";
import type {Type} from "~/game/utils";

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
  dark: "#595265",
  steel: "#598DA0",
};

export const statusColor: Record<Status, string> = {
  psn: "#E879F9",
  tox: "#E879F9",
  brn: "#FB923C",
  frz: "#8bb4e6",
  slp: "#a4a48b",
  par: "#F59E0B",
};

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

export const colorInterp = (
  value: number,
  [start, ...colors]: [string, [string, number], ...[string, number][]],
  interp = lerp,
) => {
  // https://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript/54070620#54070620
  const rgb2hsv = (r: number, g: number, b: number) => {
    const v = Math.max(r, g, b);
    const c = v - Math.min(r, g, b);
    const h = c && (v == r ? (g - b) / c : v == g ? 2 + (b - r) / c : 4 + (r - g) / c);
    return {h: 60 * (h < 0 ? h + 6 : h), s: v && c / v, v};
  };

  const hsv2rgb = (h: number, s: number, v: number) => {
    const f = (n: number, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1)];
  };

  const hexrgb2hsv = (hex: string) => {
    hex = hex.slice(1);
    return rgb2hsv(
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4), 16),
    );
  };

  let prev = 0;
  for (const [color, max] of colors) {
    if (value <= max) {
      const f = (value - prev) / (max - prev);
      const begin = hexrgb2hsv(start);
      const end = hexrgb2hsv(color);
      return hsv2rgb(
        interp(begin.h, end.h, f),
        interp(begin.s, end.s, f),
        interp(begin.v, end.v, f),
      );
    }

    prev = max;
    start = color;
  }

  return [0, 0, 0];
};

const red = tailwindColors.red[800];

export const hpColor = (percent: number) => {
  const yellow = tailwindColors.yellow[600];
  const green = tailwindColors.lime[700];
  const [r, g, b] = colorInterp(percent, [red, [yellow, 50], [green, 100]]);
  return `rgb(${r}, ${g}, ${b})`;
};

export const baseStatColor = (stat: number) => {
  const yellow = tailwindColors.yellow[500];
  const green = tailwindColors.lime[500];
  const blue = tailwindColors.sky[500];
  const [r, g, b] = colorInterp(stat, [red, [yellow, 65], [green, 100], [blue, 255]]);
  return `rgb(${r}, ${g}, ${b})`;
};
