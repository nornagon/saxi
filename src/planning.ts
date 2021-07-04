/**
 * Cribbed from https://github.com/fogleman/axi/blob/master/axi/planner.py
 */
const epsilon = 1e-9;
import {PaperSize} from "./paper-size";
import {vadd, vdot, Vec2, vlen, vmul, vnorm, vsub} from "./vec";

export interface PlanOptions {
  paperSize: PaperSize;
  marginMm: number;
  selectedStrokeLayers: Set<string>;
  selectedGroupLayers: Set<string>;
  layerMode: 'group' | 'stroke' | 'all';

  penUpHeight: number;
  penDownHeight: number;
  pointJoinRadius: number;
  pathJoinRadius: number;

  penDownAcceleration: number;
  penDownMaxVelocity: number;
  penDownCorneringFactor: number;

  penUpAcceleration: number;
  penUpMaxVelocity: number;

  penDropDuration: number;
  penLiftDuration: number;

  sortPaths: boolean;
  rotateDrawing: number;
  fitPage: boolean;
  cropToMargins: boolean;

  minimumPathLength: number;
}

export const defaultPlanOptions: PlanOptions = {
  penUpHeight: 50,
  penDownHeight: 60,
  pointJoinRadius: 0,
  pathJoinRadius: 0.5,
  paperSize: PaperSize.standard.ArchA.landscape,
  marginMm: 20,
  selectedGroupLayers: new Set(),
  selectedStrokeLayers: new Set(),
  layerMode: 'stroke',

  penDownAcceleration: 200,
  penDownMaxVelocity: 50,
  penDownCorneringFactor: 0.127,

  penUpAcceleration: 400,
  penUpMaxVelocity: 200,

  penDropDuration: 0.12,
  penLiftDuration: 0.12,

  sortPaths: true,
  rotateDrawing: 0,
  fitPage: true,
  cropToMargins: true,

  minimumPathLength: 0,
};

interface Instant {
  t: number;
  p: Vec2;
  s: number;
  v: number;
  a: number;
}

interface AccelerationProfile {
  acceleration: number;
  maximumVelocity: number;
  corneringFactor: number;
}

interface ToolingProfile {
  penDownProfile: AccelerationProfile;
  penUpProfile: AccelerationProfile;
  penDownPos: number; // int
  penUpPos: number; // int
  penLiftDuration: number;
  penDropDuration: number;
}

export const Device = {
  Axidraw: {
    stepsPerMm: 5,

    // Practical min/max that you might ever want the pen servo to go on the AxiDraw (v2)
    // Units: 83ns resolution pwm output.
    // Defaults: penup at 12000 (1ms), pendown at 16000 (1.33ms).
    penServoMin: 7500,  // pen down
    penServoMax: 28000, // pen up

    penPctToPos(pct: number): number {
      const t = pct / 100.0;
      return Math.round(this.penServoMin * t + this.penServoMax * (1 - t));
    }
  }
};

export const AxidrawFast: ToolingProfile = {
  penDownProfile: {
    acceleration: 200 * Device.Axidraw.stepsPerMm,
    maximumVelocity: 50 * Device.Axidraw.stepsPerMm,
    corneringFactor: 0.127 * Device.Axidraw.stepsPerMm
  },
  penUpProfile: {
    acceleration: 400 * Device.Axidraw.stepsPerMm,
    maximumVelocity: 200 * Device.Axidraw.stepsPerMm,
    corneringFactor: 0
  },
  penUpPos: Device.Axidraw.penPctToPos(50),
  penDownPos: Device.Axidraw.penPctToPos(60),
  penDropDuration: 0.12,
  penLiftDuration: 0.12,
};

export class Block {
  public static deserialize(o: any): Block {
    return new Block(o.accel, o.duration, o.vInitial, o.p1, o.p2);
  }

  public accel: number;
  public duration: number;
  public vInitial: number;
  public p1: Vec2;
  public p2: Vec2;

  public distance: number;

  public constructor(accel: number, duration: number, vInitial: number, p1: Vec2, p2: Vec2) {
    if (!(vInitial >= 0)) {
      throw new Error(`vInitial must be >= 0, but was ${vInitial}`);
    }
    if (!(vInitial + accel * duration >= -epsilon)) {
      throw new Error(`vFinal must be >= 0, but vInitial=${vInitial}, duration=${duration}, accel=${accel}`);
    }
    this.accel = accel;
    this.duration = duration;
    this.vInitial = vInitial;
    this.p1 = p1;
    this.p2 = p2;
    this.distance = vlen(vsub(p1, p2));
  }

  public get vFinal(): number { return Math.max(0, this.vInitial + this.accel * this.duration); }

  public instant(tU: number, dt: number= 0, ds: number= 0): Instant {
    const t = Math.max(0, Math.min(this.duration, tU));
    const a = this.accel;
    const v = this.vInitial + this.accel * t;
    const s = Math.max(0, Math.min(this.distance, this.vInitial * t + a * t * t / 2));
    const p = vadd(this.p1, vmul(vnorm(vsub(this.p2, this.p1)), s));
    return {t: t + dt, p, s: s + ds, v, a};
  }

  public serialize(): any {
    return {
      accel: this.accel,
      duration: this.duration,
      vInitial: this.vInitial,
      p1: this.p1,
      p2: this.p2,
    };
  }
}

export interface Motion {
  duration(): number;
  serialize(): any;
}

export class PenMotion implements Motion {
  public static deserialize(o: any): PenMotion {
    return new PenMotion(o.initialPos, o.finalPos, o.duration);
  }

  public initialPos: number;
  public finalPos: number;
  public pDuration: number;

  public constructor(initialPos: number, finalPos: number, duration: number) {
    this.initialPos = initialPos;
    this.finalPos = finalPos;
    this.pDuration = duration;
  }

  public duration(): number {
    return this.pDuration;
  }

  public serialize(): any {
    return {
      t: "PenMotion",
      initialPos: this.initialPos,
      finalPos: this.finalPos,
      duration: this.pDuration,
    };
  }
}

function scanLeft<A, B>(a: A[], z: B, op: (b: B, a: A) => B): B[] {
  const b: B[] = [];
  let acc = z;
  b.push(acc);
  for (const x of a) { acc = op(acc, x); b.push(acc); }
  return b;
}

function sortedIndex<T>(array: T[], obj: T) {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (array[mid] < obj) { low = mid + 1; } else { high = mid; }
  }
  return low;
}

export class XYMotion implements Motion {
  public static deserialize(o: any): XYMotion {
    return new XYMotion(o.blocks.map(Block.deserialize));
  }
  public blocks: Block[];

  private ts: number[];
  private ss: number[];

  public constructor(blocks: Block[]) {
    this.blocks = blocks;
    this.ts = scanLeft(blocks.map((b) => b.duration), 0, (a, b) => a + b).slice(0, -1);
    this.ss = scanLeft(blocks.map((b) => b.distance), 0, (a, b) => a + b).slice(0, -1);
  }

  public get p1(): Vec2 {
    return this.blocks[0].p1;
  }
  public get p2(): Vec2 {
    return this.blocks[this.blocks.length - 1].p2;
  }

  public duration(): number {
    return this.blocks.map((b) => b.duration).reduce((a, b) => a + b, 0);
  }

  public instant(t: number): Instant {
    const idx = sortedIndex(this.ts, t);
    const blockIdx = this.ts[idx] === t ? idx : idx - 1;
    const block = this.blocks[blockIdx];
    return block.instant(t - this.ts[blockIdx], this.ts[blockIdx], this.ss[blockIdx]);
  }

  public serialize(): any {
    return {
      t: "XYMotion",
      blocks: this.blocks.map((b) => b.serialize())
    };
  }
}

export class Plan {
  public static deserialize(o: any): Plan {
    return new Plan(o.motions.map((m: any) => {
      switch (m.t) {
        case "XYMotion": return XYMotion.deserialize(m);
        case "PenMotion": return PenMotion.deserialize(m);
      }
    }));
  }
  public motions: Motion[];
  public constructor(motions: Motion[]) {
    this.motions = motions;
  }
  public duration(): number {
    return this.motions.map((m) => m.duration()).reduce((a, b) => a + b, 0);
  }
  public motion(i: number) { return this.motions[i]; }

  public withPenHeights(penUpHeight: number, penDownHeight: number): Plan {
    let penMotionIndex = 0;
    return new Plan(this.motions.map((motion, j) => {
      if (motion instanceof XYMotion) {
        return motion;
      } else if (motion instanceof PenMotion) {
        // Uuuugh this is really hacky. We should instead store the
        // pen-up/pen-down heights in a single place and reference them from
        // the PenMotions. Then we can change them in just one place.
        if (j === this.motions.length - 3) {
          return new PenMotion(penDownHeight, Device.Axidraw.penPctToPos(0), motion.duration());
        } else if (j === this.motions.length - 1) {
          return new PenMotion(Device.Axidraw.penPctToPos(0), penUpHeight, motion.duration());
        }
        return (penMotionIndex++ % 2 === 0
          ? new PenMotion(penUpHeight, penDownHeight, motion.duration())
          : new PenMotion(penDownHeight, penUpHeight, motion.duration()));
      }
    }));
  }

  public serialize(): any {
    return {
      motions: this.motions.map((m) => m.serialize())
    };
  }
}

class Segment {
  public p1: Vec2;
  public p2: Vec2;
  public maxEntryVelocity: number = 0;
  public entryVelocity: number = 0;
  public blocks: Block[];

  public constructor(p1: Vec2, p2: Vec2) {
    this.p1 = p1;
    this.p2 = p2;
    this.blocks = [];
  }
  public length(): number { return vlen(vsub(this.p2, this.p1)); }
  public direction(): Vec2 { return vnorm(vsub(this.p2, this.p1)); }
}

function cornerVelocity(seg1: Segment, seg2: Segment, vMax: number, accel: number, cornerFactor: number): number {
  // https://onehossshay.wordpress.com/2011/09/24/improving_grbl_cornering_algorithm/
  const cosine = -vdot(seg1.direction(), seg2.direction());
  // assert(!cosine.isNaN, s"cosine was NaN: $seg1, $seg2, ${seg1.direction}, ${seg2.direction}")
  if (Math.abs(cosine - 1) < epsilon) {
    return 0;
  }
  const sine = Math.sqrt((1 - cosine) / 2);
  if (Math.abs(sine - 1) < epsilon) {
    return vMax;
  }
  const v = Math.sqrt((accel * cornerFactor * sine) / (1 - sine));
  // assert(!v.isNaN, s"v was NaN: $accel, $cornerFactor, $sine")
  return Math.min(v, vMax);
}

/** Represents a triangular velocity profile for moving in a straight line.
 *
 * {{{
 * +a ^____,        positive acceleration until maximum velocity is reached
 *    |    |
 *    |----|---> t
 *    |    |___
 * -a v             followed by negative acceleration until final velocity is reached
 *
 * +v ^    ,
 *    |  ,' `.
 * vi |,'     `  vf
 *    |
 *    +--------> t
 * }}}
 *
 * @param s1 the length of the first (accelerating) part of the profile.
 * @param s2 the length of the second (decelerating) part of the profile.
 * @param t1 the duration of the first (accelerating) part of the profile.
 * @param t2 the duration of the second (decelerating) part of the profile.
 * @param vMax the maximum velocity achieved during the motion.
 * @param p1 the initial position
 * @param p2 the position at v=vMax
 * @param p3 the final position
 */
interface Triangle {
  s1: number; s2: number;
  t1: number; t2: number;
  vMax: number;
  p1: Vec2; p2: Vec2; p3: Vec2;
}
/** Compute a triangular velocity profile with piecewise constant acceleration.
 *
 * The maximum velocity is derived from the acceleration and the distance to be travelled.
 *
 * @param distance Distance to travel (equal to |p3-p1|).
 * @param initialVel Starting velocity, unit length per unit time.
 * @param finalVel Final velocity, unit length per unit time.
 * @param accel Magnitude of acceleration, unit length per unit time per unit time.
 * @param p1 Starting point.
 * @param p3 Ending point.
 * @return
 */
function computeTriangle(
  distance: number,
  initialVel: number,
  finalVel: number,
  accel: number,
  p1: Vec2,
  p3: Vec2
): Triangle {
  const acceleratingDistance = (2 * accel * distance + finalVel * finalVel - initialVel * initialVel) / (4 * accel);
  const deceleratingDistance = distance - acceleratingDistance;
  const vMax = Math.sqrt(initialVel * initialVel + 2 * accel * acceleratingDistance);
  const t1 = (vMax - initialVel) / accel;
  const t2 = (finalVel - vMax) / -accel;
  const p2 = vadd(p1, vmul(vnorm(vsub(p3, p1)), acceleratingDistance));
  return {s1: acceleratingDistance, s2: deceleratingDistance, t1, t2, vMax, p1, p2, p3};
}

/** Represents a trapezoidal velocity profile for moving in a straight line.
 *
 * {{{
 * +a ^____,           positive acceleration until maximum velocity is reached
 *    |    |
 *    |----+--+---> t  then zero acceleration while at maximum velocity
 *    |       |___
 * -a v                finally, negative acceleration until final velocity is reached
 *
 * +v ^    ,...     vmax
 *    |  ,'    `.
 * vi |,'        `  vf
 *    |
 *    +-----------> t
 * }}}
 *
 * @param s1 the length of the first (accelerating) part of the profile.
 * @param s2 the length of the second (constant velocity) part of the profile.
 * @param s3 the length of the third (decelerating) part of the profile.
 * @param t1 the duration of the first (accelerating) part of the profile.
 * @param t2 the duration of the second (constant velocity) part of the profile.
 * @param t3 the duration of the third (decelerating) part of the profile.
 * @param p1 the initial position.
 * @param p2 the position upon achieving v=vMax and beginning constant velocity interval.
 * @param p3 the position upon beginning to decelerate after v=vMax.
 * @param p4 the final position.
 */
interface Trapezoid {
  s1: number; s2: number; s3: number;
  t1: number; t2: number; t3: number;
  p1: Vec2; p2: Vec2; p3: Vec2; p4: Vec2;
}
function computeTrapezoid(
  distance: number,
  initialVel: number,
  maxVel: number,
  finalVel: number,
  accel: number,
  p1: Vec2,
  p4: Vec2
): Trapezoid {
  const t1 = (maxVel - initialVel) / accel;
  const s1 = (maxVel + initialVel) / 2 * t1;
  const t3 = (finalVel - maxVel) / -accel;
  const s3 = (finalVel + maxVel) / 2 * t3;
  const s2 = distance - s1 - s3;
  const t2 = s2 / maxVel;
  const dir = vnorm(vsub(p4, p1));
  const p2 = vadd(p1, vmul(dir, s1));
  const p3 = vadd(p1, vmul(dir, (distance - s3)));
  return {s1, s2, s3, t1, t2, t3, p1, p2, p3, p4};
}

function dedupPoints(points: Vec2[], epsilon: number): Vec2[] {
  if (epsilon === 0) { return points; }
  const dedupedPoints: Vec2[] = [];
  dedupedPoints.push(points[0]);
  for (const p of points.slice(1)) {
    if (vlen(vsub(p, dedupedPoints[dedupedPoints.length - 1])) > epsilon) {
      dedupedPoints.push(p);
    }
  }
  return dedupedPoints;
}

/**
 * Plan a path, using a constant acceleration profile.
 * This function plans only a single x/y motion of the tool,
 * i.e. between a single pen-down/pen-up pair.
 *
 * @param points Sequence of points to pass through
 * @param profile Tooling profile to use
 * @return A plan of action
 */
function constantAccelerationPlan(points: Vec2[], profile: AccelerationProfile): XYMotion {
  const dedupedPoints = dedupPoints(points, epsilon);
  if (dedupedPoints.length === 1) {
    return new XYMotion([new Block(0, 0, 0, dedupedPoints[0], dedupedPoints[0])]);
  }
  const segments = dedupedPoints.slice(1).map((a, i) => new Segment(dedupedPoints[i], a));

  const accel = profile.acceleration;
  const vMax = profile.maximumVelocity;
  const cornerFactor = profile.corneringFactor;

  // Calculate the maximum entry velocity for each segment based on the angle between it
  // and the previous segment.
  segments.slice(1).forEach((seg2, i) => {
    const seg1 = segments[i];
    seg2.maxEntryVelocity = cornerVelocity(seg1, seg2, vMax, accel, cornerFactor);
  });

  // This is to force the velocity to zero at the end of the path.
  const lastPoint = dedupedPoints[dedupedPoints.length - 1];
  segments.push(new Segment(lastPoint, lastPoint));

  let i = 0;
  while (i < segments.length - 1) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    const distance = segment.length();
    const vInitial = segment.entryVelocity;
    const vExit = nextSegment.maxEntryVelocity;
    const p1 = segment.p1;
    const p2 = segment.p2;

    const m = computeTriangle(distance, vInitial, vExit, accel, p1, p2);
    if (m.s1 < -epsilon) {
      // We'd have to start decelerating _before we started on this segment_. backtrack.
      // In order enter this segment slow enough to be leaving it at vExit, we need to
      // compute a maximum entry velocity s.t. we can slow down in the distance we have.
      // TODO: verify this equation.
      segment.maxEntryVelocity = Math.sqrt(vExit * vExit + 2 * accel * distance);
      i -= 1;
    } else if (m.s2 <= 0) {
      // No deceleration.
      // TODO: shouldn't we check vMax here and maybe do trapezoid? should the next case below come first?
      const vFinal = Math.sqrt(vInitial * vInitial + 2 * accel * distance);
      const t = (vFinal - vInitial) / accel;
      segment.blocks = [
        new Block(accel, t, vInitial, p1, p2)
      ];
      nextSegment.entryVelocity = vFinal;
      i += 1;
    } else if (m.vMax > vMax) {
      // Triangle profile would exceed maximum velocity, so top out at vMax.
      const z = computeTrapezoid(distance, vInitial, vMax, vExit, accel, p1, p2);
      segment.blocks = [
        new Block(accel, z.t1, vInitial, z.p1, z.p2),
        new Block(0, z.t2, vMax, z.p2, z.p3),
        new Block(-accel, z.t3, vMax, z.p3, z.p4)
      ];
      nextSegment.entryVelocity = vExit;
      i += 1;
    } else {
      // Accelerate, then decelerate.
      segment.blocks = [
        new Block(accel, m.t1, vInitial, m.p1, m.p2),
        new Block(-accel, m.t2, m.vMax, m.p2, m.p3)
      ];
      nextSegment.entryVelocity = vExit;
      i += 1;
    }
  }
  const blocks: Block[] = [];
  segments.forEach((s) => {
    s.blocks.forEach((b) => {
      if (b.duration > epsilon) {
        blocks.push(b);
      }
    });
  });
  return new XYMotion(blocks);
}

export function plan(
  paths: Vec2[][],
  profile: ToolingProfile
): Plan {
  const motions: Motion[] = [];
  let curPos = { x: 0, y: 0 };
  const penMaxUpPos = profile.penUpPos < profile.penDownPos ? 100 : 0
  // for each path: move to the initial point, put the pen down, draw the path,
  // then pick the pen up.
  paths.forEach((p, i) => {
    const m = constantAccelerationPlan(p, profile.penDownProfile);
    const penUpPos = i === paths.length - 1 ? Device.Axidraw.penPctToPos(penMaxUpPos) : profile.penUpPos;
    motions.push(
      constantAccelerationPlan([curPos, m.p1], profile.penUpProfile),
      new PenMotion(profile.penUpPos, profile.penDownPos, profile.penDropDuration),
      m,
      new PenMotion(profile.penDownPos, penUpPos, profile.penLiftDuration)
    );
    curPos = m.p2;
  });
  // finally, move back to (0, 0).
  motions.push(constantAccelerationPlan([curPos, {x: 0, y: 0}], profile.penUpProfile));
  motions.push(new PenMotion(Device.Axidraw.penPctToPos(penMaxUpPos), profile.penUpPos, profile.penDropDuration));
  return new Plan(motions);
}
