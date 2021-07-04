declare module '*.svg';
declare module 'svgdom';
declare module 'wake-lock';
declare module '@serialport/binding-mock';
declare module 'color-interpolate';
declare module 'colormap';

declare module 'flatten-svg/index' {
  export { flattenSVG } from "flatten-svg/svg-to-paths";

}
declare module 'flatten-svg/svg-to-paths' {
  interface Options {
    maxError: number;
  }
  type Point = [number, number];
  interface Line {
    points: Point[];
    stroke?: string;
    groupId?: string;
  }
  export function flattenSVG(svg: SVGElement, options?: Partial<Options>): Line[];
  export {};

}
declare module 'flatten-svg' {
  import main = require('flatten-svg/index');
  export = main;
}
