export type Gif = {
  width: number;
  height: number;
  frameCount: number;
  getDelay(frame: number): number;
  // scaleCanvas(canvas: HTMLCanvasElement, max_width?: number);
  drawFrame(ctx: CanvasRenderingContext2D, frame: number, xOffset?: number, yOffset?: number);
};

export function loadGIF(data: ArrayBuffer): Promise<Gif>;
