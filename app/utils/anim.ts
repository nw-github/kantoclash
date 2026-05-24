export const rem = (rem: number) =>
  parseFloat(getComputedStyle(document.documentElement).fontSize) * rem;
export const ms = (ms: number) => ms / 1000;
