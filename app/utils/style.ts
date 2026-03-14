import tailwindColors from "tailwindcss/colors";
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
  brn: "orange",
  psn: "fuchsia",
  tox: "fuchsia",
  frz: "sky",
  par: "amber",
  slp: "gray",
} as const;

const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;

const colorInterp = (
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
    const [r, g, b] = oklchStringToRGB(hex);
    return rgb2hsv(r, g, b);
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

const oklchStringToRGB = (str: string) => {
  function linearToSRGB(c: number) {
    if (c <= 0.0031308) return 12.92 * c;
    return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }

  const ma = str.match(/oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s)]+)\s*\)/i);
  if (!ma) throw new Error("Invalid oklch color");

  let L = parseFloat(ma[1]);
  const C = parseFloat(ma[2]);
  const h = parseFloat(ma[3]);

  if (ma[1].includes("%")) {
    L /= 100;
  }

  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const bp = C * Math.sin(hr);

  const l = (L + 0.3963377774 * a + 0.2158037573 * bp) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bp) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bp) ** 3;

  const r = linearToSRGB(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = linearToSRGB(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const b = linearToSRGB(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return [
    Math.round(Math.min(Math.max(r, 0), 1) * 255),
    Math.round(Math.min(Math.max(g, 0), 1) * 255),
    Math.round(Math.min(Math.max(b, 0), 1) * 255),
  ];
};
