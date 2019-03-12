import {getPathData} from './path-data-polyfill';

type Curve = [number, number, number, number, number, number, number, number]
function isFlatEnough([x0, y0, x1, y1, x2, y2, x3, y3]: Curve, flatness: number) {
  // https://github.com/paperjs/paper.js/blob/a61e83edf2ed1870bd41bad135f4f6fc85b0f628/src/path/Curve.js#L806
  const ux = 3 * x1 - 2 * x0 - x3,
        uy = 3 * y1 - 2 * y0 - y3,
        vx = 3 * x2 - 2 * x3 - x0,
        vy = 3 * y2 - 2 * y3 - y0;
  return Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy)
          <= 16 * flatness * flatness;
}

function subdivide([x0, y0, x1, y1, x2, y2, x3, y3]: Curve, t: number): [Curve, Curve] {
  // https://github.com/paperjs/paper.js/blob/a61e83edf2ed1870bd41bad135f4f6fc85b0f628/src/path/Curve.js#L606
  if (t === undefined)
      t = 0.5;
  // Triangle computation, with loops unrolled.
  let u = 1 - t,
      // Interpolate from 4 to 3 points
      x4 = u * x0 + t * x1, y4 = u * y0 + t * y1,
      x5 = u * x1 + t * x2, y5 = u * y1 + t * y2,
      x6 = u * x2 + t * x3, y6 = u * y2 + t * y3,
      // Interpolate from 3 to 2 points
      x7 = u * x4 + t * x5, y7 = u * y4 + t * y5,
      x8 = u * x5 + t * x6, y8 = u * y5 + t * y6,
      // Interpolate from 2 points to 1 point
      x9 = u * x7 + t * x8, y9 = u * y7 + t * y8;
  // We now have all the values we need to build the sub-curves:
  return [
      [x0, y0, x4, y4, x7, y7, x9, y9], // left
      [x9, y9, x8, y8, x6, y6, x3, y3] // right
  ];
}

function flatten(v: Curve, flatness: number, maxRecursion = 32) {
  const minSpan = 1 / maxRecursion
  const parts: Curve[] = []

  function computeParts(curve: Curve, t1: number, t2: number) {
    if ((t2 - t1) > minSpan && !isFlatEnough(curve, flatness) /* && !isStraight(curve) */) {
      const halves = subdivide(curve, 0.5);
      const tMid = (t1 + t2) / 2;
      computeParts(halves[0], t1, tMid);
      computeParts(halves[1], tMid, t2);
    } else {
      const dx = curve[6] - curve[0];
      const dy = curve[7] - curve[1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        parts.push(curve)
      }
    }
  }

  computeParts(v, 0, 1)

  return parts
}

function* walkSvgShapes(svgEl: SVGElement): IterableIterator<SVGElement> {
  switch (svgEl.tagName.toLowerCase()) {
    case 'svg':
    case 'g':
      for (const child of svgEl.children) {
        yield* walkSvgShapes(child as SVGElement)
      }
      break;
    case 'rect':
    case 'circle':
    case 'ellipse':
    case 'path':
    case 'line':
    case 'polyline':
    case 'polygon':
      yield svgEl
      break;
  }
}

export function svgToPaths(svgString: string) {
  const div = document.createElement('div')
  div.style.position = 'absolute'
  div.style.left = '99999px'
  document.body.appendChild(div)
  try {
    div.innerHTML = svgString
    const svg = div.querySelector('svg') as SVGElement
    const svgPoint = (svg as any).createSVGPoint()
    const paths = []
    for (const path of walkSvgShapes(svg)) {
      const type = path.nodeName.toLowerCase()
      const ctm = (path as SVGGraphicsElement).getCTM()
      const xf = ([x,y]: [number, number]) => { svgPoint.x = x; svgPoint.y = y;
        const xfd = svgPoint.matrixTransform(ctm); return [xfd.x, xfd.y] }
      let pathData;
      if (type === 'path') {
        pathData = getPathData((path as any), {normalize: true})
      } else if (type === 'ellipse') {
        const ellipse = path as SVGEllipseElement
        const cx = ellipse.cx.baseVal.value
        const cy = ellipse.cy.baseVal.value
        const rx = ellipse.rx.baseVal.value
        const ry = ellipse.ry.baseVal.value
        pathData = [
          {type: 'M', values: [cx-rx, cy]},
          {type: 'A', values: [rx, ry, 0, 1, 0, cx+rx, cy]},
          {type: 'A', values: [rx, ry, 0, 1, 0, cx-rx, cy]},
          {type: 'Z'}
        ]
      } else if (type === 'rect') {
        const rect = path as SVGRectElement
        const x = rect.x.baseVal.value
        const y = rect.y.baseVal.value
        const width = rect.width.baseVal.value
        const height = rect.height.baseVal.value
        pathData = [
          {type: 'M', values: [x, y]},
          {type: 'L', values: [x+width, y]},
          {type: 'L', values: [x+width, y+height]},
          {type: 'L', values: [x, y+width]},
          {type: 'Z'}
        ]
      }
      let cur = null
      let closePoint = null
      for (const cmd of pathData) {
        if (cmd.type === 'M') {
          cur = xf(cmd.values)
          closePoint = cur
          paths.push([cur]);
          // getComputedStyle doesn't seem to work until the JS loop that inserted it is done...
          //paths[paths.length - 1].stroke = getComputedStyle(path).stroke
          (paths[paths.length - 1] as any).stroke = path.getAttribute('stroke')
        } else if (cmd.type === 'L') {
          cur = xf(cmd.values)
          paths[paths.length-1].push(cur)
        } else if (cmd.type === 'C') {
          const [x1, y1, x2, y2, x3, y3] = cmd.values
          const [x0, y0] = cur
          const [tx1, ty1] = xf([x1, y1])
          const [tx2, ty2] = xf([x2, y2])
          const [tx3, ty3] = xf([x3, y3])
          const parts = flatten([x0, y0, tx1, ty1, tx2, ty2, tx3, ty3], 0.1)
          for (const part of parts) {
            paths[paths.length-1].push([part[6], part[7]])
          }
          cur = [tx3, ty3]
        } else if (cmd.type === 'A') {
          const [rx_, ry_, xAxisRotation, largeArc, sweep, x, y] = cmd.values
          const phi = xAxisRotation
          const fS = sweep
          const fA = largeArc
          const {cos, sin, atan2, sqrt, sign, acos, abs, ceil} = Math

          // https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
          const mpx = (cur[0] - x)/2,
                mpy = (cur[1] - y)/2
          const x1_ = cos(phi) * mpx + sin(phi) * mpy,
                y1_ = -sin(phi) * mpx + cos(phi) * mpy
          const x1_2 = x1_*x1_,
                y1_2 = y1_*y1_
          // ... ensure radii are large enough
          const L = x1_2/(rx_*rx_) + y1_2/(ry_*ry_)
          const rx = L <= 1 ? sqrt(L) * rx_ : rx_
          const ry = L <= 1 ? sqrt(L) * ry_ : ry_
          const rx2 = rx*rx,
                ry2 = ry*ry
          let factor = (rx2*ry2 - rx2*y1_2 - ry2*x1_2) / (rx2*y1_2 + ry2*x1_2)
          if (abs(factor) < 0.0001)
            factor = 0
          if (factor < 0) throw new Error(`bad arc args ${factor}`)
          const k = (fA === fS ? -1 : 1) * sqrt(factor)
          const cx_ = k * rx * y1_ / ry,
                cy_ = k * -ry * x1_ / rx
          const cx = cos(phi) * cx_ - sin(phi) * cy_ + (cur[0] + x)/2,
                cy = sin(phi) * cx_ + cos(phi) * cy_ + (cur[1] + y)/2
          const ang = (ux: number, uy: number, vx: number, vy: number) => {
            /*
            (ux*vy - uy*vx < 0 ? -1 : 1) *
              acos((ux*vx+uy*vy) / sqrt(ux*ux+uy*uy)*sqrt(vx*vx+vy*vy))
              */
            // https://github.com/paperjs/paper.js/blob/f5366fb3cb53bc1ea52e9792e2ec2584c0c4f9c1/src/path/Path.js#L2516
            return atan2(ux * vy - uy * vx, ux*vx + uy*vy)
          }
          const t1 = ang(1, 0, (x1_-cx_)/rx, (y1_-cy_)/ry)
          const dt_ = ang((x1_-cx_)/rx, (y1_-cy_)/ry, (-x1_-cx_)/rx,
            (-y1_-cy_)/ry) % (Math.PI*2)
          const dt =
            fS === 0 && dt_ > 0 ? dt_ - Math.PI*2 :
            fS === 1 && dt_ < 0 ? dt_ + Math.PI*2 :
            dt_

          // now:
          // - (cx, cy) is the center of the ellipse
          // - (rx, ry) is the radius
          // - phi is the angle around the x-axis of the current
          //   coordinate system to the x-axis of the ellipse
          // - t1 is the start angle of the elliptical arc prior to the stretch and rotate operations.
          // - t1+dt is the end angle of the elliptical arc prior to the stretch and rotate operations.

          // parameterization:
          // ( x )  =  ( cos phi   -sin phi ) . ( rx cos t )  +  ( cx )
          // ( y )  =  ( sin phi    cos phi )   ( ry sin t )     ( cy )

          // https://i.imgur.com/JORhNjU.jpg
          // maximum error based on maximum deviation from true arc
          const e0 = 0.5
          const n = ceil(abs(dt) / acos(1-e0/rx))

          for (let i = 1; i <= n; i++) {
            const theta = t1 + dt * i/n
            const tx = cos(phi) * rx * cos(theta) - sin(phi) * ry * sin(theta) + cx
            const ty = sin(phi) * rx * cos(theta) + cos(phi) * ry * sin(theta) + cy
            paths[paths.length-1].push([tx,ty])
          }
          cur = [x, y]
        } else if (cmd.type === 'Z') {
          if (closePoint && (cur[0] !== closePoint[0] || cur[1] !== closePoint[1])) {
            paths[paths.length-1].push(closePoint)
          }
        } else {
          throw Error("um")
        }
      }
    }
    return paths
  } finally {
    div.remove()
  }
}
