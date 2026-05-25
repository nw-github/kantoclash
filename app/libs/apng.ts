import upng from "./upng";

export default class APNG {
  public width: number;
  public height: number;
  private frames: {delay: number; data: ImageData}[];
  private needsClear = false;

  constructor(buf: ArrayBuffer) {
    const img = upng.decode(buf);
    this.width = img.width;
    this.height = img.height;
    this.frames = upng.toRGBA8(img).map((data, i) => {
      const frame = img.frames[i];
      return {
        delay: frame.delay,
        data: new ImageData(new Uint8ClampedArray(data), img.width, img.height),
      };
    });
  }

  get frameCount() {
    return this.frames.length;
  }

  getDelay(frame: number): number {
    return this.frames[frame].delay;
  }

  drawFrame(ctx: CanvasRenderingContext2D, frame: number, xOffset = 0, yOffset = 0) {
    // if (this.needsClear) {
    //   ctx.clearRect(0, 0, this.width, this.height);
    //   this.needsClear = false;
    // }

    ctx.putImageData(this.frames[frame].data, xOffset, yOffset);
  }
}
