import {Vec2, vmul} from "./vec";

export class PaperSize {

  get landscape(): PaperSize {
    return new PaperSize({
      x: Math.max(this.size.x, this.size.y),
      y: Math.min(this.size.x, this.size.y),
    });
  }

  get portrait(): PaperSize {
    return new PaperSize({
      x: Math.min(this.size.x, this.size.y),
      y: Math.max(this.size.x, this.size.y),
    });
  }

  public static standard: {[name: string]: PaperSize} = {
    "USLetter": new PaperSize(vmul({x: 8.5, y: 11}, 25.4)),
    "USLegal": new PaperSize(vmul({x: 8.5, y: 14}, 25.4)),
    "ArchA": new PaperSize(vmul({x: 9, y: 12}, 25.4)),
    "A4": new PaperSize({x: 210, y: 297}),
    "A5": new PaperSize({x: 148, y: 210}),
    "A6": new PaperSize({x: 105, y: 148}),
    "6x8": new PaperSize(vmul({x: 6, y: 8}, 25.4)),
    "5x7": new PaperSize(vmul({x: 5, y: 8}, 25.4)),
  };
  public size: Vec2;
  constructor(size: Vec2) {
    this.size = size;
  }
}
