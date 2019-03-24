export interface Vec2 {
  x: number;
  y: number;
}

export function vlen2(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}
export function vlen(a: Vec2): number {
  return Math.sqrt(vlen2(a));
}
export function vsub(a: Vec2, b: Vec2): Vec2 {
  return {x: a.x - b.x, y: a.y - b.y};
}
export function vmul(a: Vec2, s: number): Vec2 {
  return {x: a.x * s, y: a.y * s};
}
export function vnorm(a: Vec2): Vec2 {
  return vmul(a, 1 / vlen(a));
}
export function vadd(a: Vec2, b: Vec2): Vec2 {
  return {x: a.x + b.x, y: a.y + b.y};
}
export function vdot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
